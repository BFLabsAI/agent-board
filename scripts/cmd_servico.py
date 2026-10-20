"""
painel.py servico: o painel sempre ligado (systemd) e exposto só na tailnet (tailscale serve).

  painel.py servico instalar [--porta 8765] [--dry-run]
  painel.py servico status   [--porta 8765]
  painel.py servico remover  [--porta 8765] [--dry-run]

`instalar` grava o unit agent-board-painel.service, liga o serviço e configura o `tailscale serve`
(HTTPS 443 e HTTP <porta> para 127.0.0.1:<porta>). Os dois passos são idempotentes. `--dry-run` só imprime
o unit e os comandos. Contrato em docs/referencia/painel-api.md (Workspaces federados).
"""
import argparse
import json
import os
import shlex
import subprocess
import sys

import base

NOME_UNIT = "agent-board-painel.service"
DIR_UNIT = "/etc/systemd/system"
AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ_SKILL = os.path.dirname(AQUI)
PYTHON = "/usr/bin/python3"


def gerar_unit(porta=8765, home=None, raiz_skill=RAIZ_SKILL, scripts=AQUI):
    """Texto do unit. `home`: AGENT_BOARD_HOME, só entra se não for o padrão."""
    home = base.HOME if home is None else home
    padrao = os.path.expanduser("~/.agent-hooks/agent-board")
    linhas = ["[Unit]", "Description=agent-board painel (Workspace federado)",
              "After=network-online.target tailscaled.service", "Wants=network-online.target", "",
              "[Service]", "Type=simple", "User=root", f"WorkingDirectory={raiz_skill}"]
    if os.path.abspath(home) != os.path.abspath(padrao):
        linhas.append(f"Environment=AGENT_BOARD_HOME={home}")
    # o serviço não herda o ambiente do terminal: leva o orca que este terminal usa (o do Orca server)
    for var in ("ORCA_CLI_BIN_DIR", "ORCA_BIN"):
        if os.environ.get(var):
            linhas.append(f"Environment={var}={os.environ[var]}")
    linhas += [f"ExecStart={PYTHON} {os.path.join(scripts, 'painel.py')} servir --porta {porta}",
               "Restart=always", "RestartSec=3", "", "[Install]", "WantedBy=multi-user.target", ""]
    return "\n".join(linhas)


def _ler(caminho):
    try:
        with open(caminho) as f:
            return f.read()
    except OSError:
        return None


def comandos_serve(porta, https=True):
    """Navegador: HTTPS 443 se a tailnet emite certificado; senão HTTP 80 (o tráfego já vai cifrado pelo WireGuard).
    Outros painéis: HTTP na própria porta, pelo IP da tailnet."""
    navegador = "--https=443" if https else "--http=80"
    return [["tailscale", "serve", "--bg", navegador, f"http://127.0.0.1:{porta}"],
            ["tailscale", "serve", "--bg", f"--http={porta}", f"http://127.0.0.1:{porta}"]]


def comandos_serve_off(porta, https=True):
    navegador = "--https=443" if https else "--http=80"
    return [["tailscale", "serve", navegador, "off"], ["tailscale", "serve", f"--http={porta}", "off"]]


def tailnet_tem_https(executar):
    """A tailnet emite certificado HTTPS (CertDomains em `tailscale status --json`)?"""
    rc, out = executar(["tailscale", "status", "--json"])
    try:
        return rc == 0 and bool((json.loads(out) or {}).get("CertDomains"))
    except ValueError:
        return False


def serve_configurado(status, porta, https=True):
    """`tailscale serve status --json` já tem o navegador (HTTPS 443 ou HTTP 80) e HTTP <porta> em 127.0.0.1:<porta>?"""
    web = (status or {}).get("Web") or {}
    alvo = f"127.0.0.1:{porta}"

    def tem(sufixo):
        for chave, cfg in web.items():
            if chave.endswith(f":{sufixo}"):
                prox = ((cfg or {}).get("Handlers") or {}).get("/", {}).get("Proxy", "")
                if alvo in prox:
                    return True
        return False
    return tem(443 if https else 80) and tem(porta)


def executar_real(cmd):
    """(código, saída). Comando que não existe volta como 127."""
    try:
        p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=60)
        return p.returncode, p.stdout.decode("utf-8", "replace")
    except (OSError, subprocess.SubprocessError) as exc:
        return 127, str(exc)


def _serve_status(executar):
    rc, out = executar(["tailscale", "serve", "status", "--json"])
    try:
        return json.loads(out) if rc == 0 else None
    except ValueError:
        return None


def _mostrar(cmd):
    print("$ " + " ".join(shlex.quote(c) for c in cmd))


def instalar(porta=8765, dry_run=False, dir_unit=DIR_UNIT, executar=executar_real, saida=print):
    """Devolve 0 se tudo certo. Idempotente: unit igual não é reescrito; serve já configurado não é repetido."""
    unit = gerar_unit(porta)
    caminho = os.path.join(dir_unit, NOME_UNIT)
    https = tailnet_tem_https(executar)
    if not https:
        saida("aviso: a tailnet não emite HTTPS (habilite em login.tailscale.com > DNS > HTTPS Certificates); "
              "o navegador usa http://<maquina>.<tailnet>.ts.net, cifrado pela Tailscale")
    if dry_run:
        saida(f"# {caminho}\n{unit}")
        for cmd in [["systemctl", "daemon-reload"], ["systemctl", "enable", "--now", NOME_UNIT]] + comandos_serve(porta, https):
            saida("$ " + " ".join(shlex.quote(c) for c in cmd))
        return 0
    try:
        atual = _ler(caminho)
    except OSError:
        atual = None
    if atual != unit:
        os.makedirs(dir_unit, exist_ok=True)
        with open(caminho, "w") as f:
            f.write(unit)
        saida(f"unit gravado em {caminho}")
        executar(["systemctl", "daemon-reload"])
        if atual is not None:  # unit mudou com o serviço já instalado: reinicia para valer
            executar(["systemctl", "restart", NOME_UNIT])
    else:
        saida(f"unit já em dia: {caminho}")
    rc, out = executar(["systemctl", "enable", "--now", NOME_UNIT])
    if rc != 0:
        saida(f"systemctl enable falhou: {out.strip()}")
        return 1
    if serve_configurado(_serve_status(executar), porta, https):
        saida("tailscale serve já configurado")
        return 0
    for cmd in comandos_serve(porta, https):
        rc, out = executar(cmd)
        if rc != 0:
            saida(f"{' '.join(cmd)} falhou: {out.strip()}")
            return 1
    saida("tailscale serve configurado")
    return 0


def remover(porta=8765, dry_run=False, dir_unit=DIR_UNIT, executar=executar_real, saida=print):
    cmds = [["systemctl", "disable", "--now", NOME_UNIT]]
    caminho = os.path.join(dir_unit, NOME_UNIT)
    if dry_run:
        for cmd in cmds + [["rm", "-f", caminho], ["systemctl", "daemon-reload"]] + comandos_serve_off(porta):
            saida("$ " + " ".join(shlex.quote(c) for c in cmd))
        return 0
    executar(cmds[0])
    if os.path.exists(caminho):
        os.remove(caminho)
        saida(f"removido {caminho}")
    executar(["systemctl", "daemon-reload"])
    st = _serve_status(executar)
    for https in (True, False):
        if serve_configurado(st, porta, https):
            for cmd in comandos_serve_off(porta, https):
                executar(cmd)
            saida("tailscale serve desligado")
    return 0


def status(porta=8765, dir_unit=DIR_UNIT, executar=executar_real, saida=print):
    caminho = os.path.join(dir_unit, NOME_UNIT)
    saida(f"unit: {caminho} ({'existe' if os.path.exists(caminho) else 'não existe'})")
    rc, out = executar(["systemctl", "is-active", NOME_UNIT])
    saida(f"serviço: {out.strip() or 'desconhecido'}")
    st = _serve_status(executar)
    saida("tailscale serve: " + ("configurado" if serve_configurado(st, porta) or serve_configurado(st, porta, False) else
                                 "não configurado" if st is not None else "indisponível"))
    return 0 if rc == 0 else 1


def servico(args):
    p = argparse.ArgumentParser(prog="painel.py servico", description=__doc__.strip().splitlines()[0])
    p.add_argument("acao", choices=["instalar", "status", "remover"])
    p.add_argument("--porta", type=int, default=8765)
    p.add_argument("--dry-run", action="store_true", help="só imprime o unit e os comandos")
    p.add_argument("--dir-unit", default=DIR_UNIT, help=argparse.SUPPRESS)
    a = p.parse_args(args)
    if a.acao == "status":
        sys.exit(status(a.porta, a.dir_unit))
    if a.acao == "remover":
        sys.exit(remover(a.porta, a.dry_run, a.dir_unit))
    sys.exit(instalar(a.porta, a.dry_run, a.dir_unit))
