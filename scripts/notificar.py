#!/usr/bin/env python3
"""
agent-board: notificação externa de um envio bem-sucedido (webhook, GitHub e floor do Maestri).

Roda num processo separado, disparado pelo post_send do hook (disparar()), para
nunca atrasar nem derrubar o envio. Erro aqui vai para avisos.log e pronto.

  - Webhook: se $AGENT_BOARD_WEBHOOK estiver definido e o tipo estiver em
    $AGENT_BOARD_WEBHOOK_TIPOS (padrão "escalacao,entrega"), faz POST JSON
    {"text": "..."} (formato aceito por Slack e afins). A URL é segredo: só
    vem do ambiente, nunca do git, e não aparece no avisos.log.
  - GitHub: com "github": {"comentar_entregas": true} no agent-board.json,
    uma entrega com --issues vira comentário em cada Issue (gh issue comment).
  - Maestri: com "maestri": {"status_do_floor": true}, uma entrega feita de um
    terminal do Maestri põe o floor em revisão (maestri floor status --state review).

Também tem o extras_entrega(), usado pelo pre_send para anotar no log a branch
de quem entrega (worktree do cadastro ou floor do Maestri).
"""
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from base import HOME, Barrado, carregar_config, registrar_aviso  # noqa: E402

TIPOS_PADRAO = "escalacao,entrega"
TIMEOUT_WEBHOOK = 10
TIMEOUT_GH = 30
TIMEOUT_GIT = 5


def branch_de(worktree):
    """Branch atual do worktree, ou None (sem git, detached, demorou)."""
    try:
        r = subprocess.run(["git", "-C", worktree, "rev-parse", "--abbrev-ref", "HEAD"],
                           capture_output=True, text=True, timeout=TIMEOUT_GIT)
    except (OSError, subprocess.SubprocessError):
        return None
    b = r.stdout.strip()
    return b if r.returncode == 0 and b and b != "HEAD" else None


def extras_entrega(tipo, eu, cwd=None):
    """Campos a mais na linha de log: {"branch": ...} numa entrega de quem tem worktree.

    O worktree vem do cadastro (cadastrar --worktree) ou, num floor do Maestri, do
    diretório em que o agente está, quando ele é um checkout diferente da raiz.
    """
    if tipo != "entrega":
        return {}
    pasta = eu.get("worktree") or (cwd if cwd and _outro_checkout(cwd, eu.get("raiz")) else None)
    b = branch_de(pasta) if pasta else None
    return {"branch": b} if b else {}


def _outro_checkout(cwd, raiz):
    """True quando cwd está num checkout git (ex.: floor do Maestri) que não é o da raiz do projeto."""
    def topo(pasta):
        try:
            r = subprocess.run(["git", "-C", pasta, "rev-parse", "--show-toplevel"], capture_output=True,
                               text=True, timeout=5, stdin=subprocess.DEVNULL)
        except (OSError, subprocess.TimeoutExpired):
            return None
        return os.path.realpath(r.stdout.strip()) if r.returncode == 0 and r.stdout.strip() else None
    a = topo(cwd)
    return bool(a) and a != topo(raiz or "")


def tipos_webhook():
    return {t.strip() for t in os.environ.get("AGENT_BOARD_WEBHOOK_TIPOS", TIPOS_PADRAO).split(",") if t.strip()}


def comentar_entregas(raiz):
    try:
        return bool(carregar_config(raiz).get("github", {}).get("comentar_entregas"))
    except (Barrado, ValueError, AttributeError, OSError):
        return False


def quer_webhook(p):
    return bool(os.environ.get("AGENT_BOARD_WEBHOOK")) and p.get("tipo_time") in tipos_webhook()


def quer_github(p):
    return p.get("tipo_time") == "entrega" and bool(p.get("issues")) and bool(p.get("raiz")) \
        and comentar_entregas(p["raiz"])


def quer_floor(p):
    """Entrega feita de um terminal do Maestri, com "maestri": {"status_do_floor": true} na config."""
    if p.get("tipo_time") != "entrega" or not p.get("raiz") or not os.environ.get("MAESTRI_TERMINAL_ID"):
        return False
    try:
        return bool(carregar_config(p["raiz"]).get("maestri", {}).get("status_do_floor"))
    except Barrado:
        return False


def status_do_floor(p):
    """Põe o floor do remetente em revisão (o Maestri notifica o usuário)."""
    import maestri
    texto = f"Entrega {p.get('id')}: {p.get('assunto') or ''}"[:120]
    codigo, saida = maestri.rodar(["floor", "status", texto, "--state", "review"], timeout=15)
    if codigo != 0:
        registrar_aviso(f"{p.get('id')} status do floor não postado: {saida.strip()[:200]}")


def texto_de(p):
    t = f"[agent-board] {p.get('tipo_time')} {p.get('id')} de {p.get('de')} para {p.get('para')}: {p.get('assunto')}"
    if p.get("issues"):
        t += " (issues " + " ".join(f"#{n}" for n in p["issues"]) + ")"
    if p.get("branch"):
        t += f" [branch {p['branch']}]"
    return t


def enviar_webhook(url, texto):
    """POST {"text": texto}. Devolve True se o servidor aceitou. Não registra a URL (é segredo)."""
    if urllib.parse.urlparse(url).scheme not in ("http", "https"):
        registrar_aviso("webhook ignorado: AGENT_BOARD_WEBHOOK precisa ser http(s)")
        return False
    req = urllib.request.Request(url, data=json.dumps({"text": texto}, ensure_ascii=False).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_WEBHOOK) as r:
            return 200 <= r.status < 300
    except urllib.error.HTTPError as exc:
        registrar_aviso(f"webhook recusou a notificação: HTTP {exc.code}")
    except (urllib.error.URLError, OSError, ValueError) as exc:
        registrar_aviso(f"webhook falhou: {type(exc).__name__}")
    return False


def comentar_issues(p, texto):
    """gh issue comment <n> em cada Issue da entrega, no checkout principal do projeto."""
    gh = shutil.which("gh")
    if gh is None:
        registrar_aviso(f"{p.get('id')} sem gh no PATH: Issues {p.get('issues')} não comentadas")
        return
    for n in p["issues"]:
        try:
            r = subprocess.run([gh, "issue", "comment", str(int(n)), "--body", texto],
                               cwd=p["raiz"], capture_output=True, text=True, timeout=TIMEOUT_GH)
            if r.returncode != 0:
                registrar_aviso(f"{p.get('id')} gh issue comment {n} falhou: {(r.stderr or r.stdout).strip()[:200]}")
        except (OSError, ValueError, subprocess.SubprocessError) as exc:
            registrar_aviso(f"{p.get('id')} gh issue comment {n} falhou: {exc!r}")


def notificar(p):
    """Processo separado: webhook e GitHub, cada um independente do outro."""
    texto = texto_de(p)
    if quer_webhook(p):
        enviar_webhook(os.environ["AGENT_BOARD_WEBHOOK"], texto)
    if quer_github(p):
        comentar_issues(p, texto)
    if quer_floor(p):
        status_do_floor(p)


def disparar(p):
    """Chamado pelo post_send. Só abre processo se houver algo a fazer; nunca levanta exceção."""
    try:
        if not (quer_webhook(p) or quer_github(p) or quer_floor(p)):
            return
        os.makedirs(HOME, exist_ok=True)
        with open(os.path.join(HOME, "avisos.log"), "a") as erros:
            subprocess.Popen([sys.executable, os.path.abspath(__file__), json.dumps(p, ensure_ascii=False)],
                             stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                             stderr=erros, start_new_session=True)
    except Exception as exc:  # notificação nunca derruba o hook
        registrar_aviso(f"{p.get('id')} notificação não disparada: {exc!r}")


def main():
    if len(sys.argv) != 2:
        sys.exit("uso: notificar.py '<json do envio>'")
    try:
        notificar(json.loads(sys.argv[1]))
    except Exception as exc:
        registrar_aviso(f"notificação quebrou: {exc!r}")


if __name__ == "__main__":
    main()
