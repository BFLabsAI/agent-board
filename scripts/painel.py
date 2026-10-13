#!/usr/bin/env python3
"""
painel.py: cadastro de painéis do agent-board. Uso exclusivo do master.

  painel.py init --raiz <project-path> --projeto <project-name> --prefixo <project-prefix>
      Cria docs/agent-board/ no projeto (config, CONTRATO.md, log vazio) e a linha
      merge=union no .gitattributes. Não sobrescreve o que já existe; com
      --atualizar-contrato, troca o CONTRATO.md pela versão atual da skill.
  painel.py listar [--formato toon]
      Mostra os terminais abertos no Orca, com o cadastro de cada um.
  painel.py cadastrar --raiz <project-path> <term_...>=<agente> [<term_...>=<agente> ...]
      Cadastra (ou recadastra) painéis do projeto. Só depois de o CEO confirmar a lista.
  painel.py remover <term_...> [...]
      Tira painéis do cadastro.

Log do projeto (cada um aceita --help):
  painel.py historico --raiz <path> [--agente X] [--sobre texto] [--n 20] [--tudo] [--formato toon|json]
      Últimas mensagens, em TOON por padrão (economiza tokens no contexto do agente).
  painel.py verificar --raiz <path>
      Confere a cadeia de hash do log e do arquivo morto. Sai com 1 se achar adulteração.
  painel.py arquivar --raiz <path> [--dias 30]
      Move conversas fechadas e antigas para docs/agent-board/arquivo/AAAA-MM.jsonl.
  painel.py reenviar --raiz <path> <id>
      Reenvia uma mensagem (ex.: o painel fechou antes de ler), para o painel atual do destino.

O cadastro fica em $AGENT_BOARD_HOME/paineis.json (padrão ~/.agent-hooks/agent-board).
"""
import datetime
import json
import os
import re
import shutil
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from base import CONFIG_REL, LOG_REL, PAINEIS, achar_orca, papel_do_nome, trava  # noqa: E402
import cmd_log  # noqa: E402
import toon  # noqa: E402

ORCA = achar_orca()
TEMPLATES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "templates")


def com_trava(alterar):
    with trava(PAINEIS + ".lock"):
        try:
            with open(PAINEIS) as f:
                dados = json.load(f)
        except FileNotFoundError:
            dados = {"versao": 1, "paineis": {}}
        alterar(dados["paineis"])
        tmp = PAINEIS + ".tmp"
        with open(tmp, "w") as f:
            json.dump(dados, f, ensure_ascii=False, indent=2)
        os.replace(tmp, PAINEIS)


def terminais():
    out = subprocess.run([ORCA, "terminal", "list", "--json"], capture_output=True, text=True, timeout=30)
    d = json.loads(out.stdout)
    t = d.get("result", d)
    return t.get("terminals", t) if isinstance(t, dict) else t


def listar(args=()):
    formato = args[args.index("--formato") + 1] if "--formato" in args else "texto"
    try:
        with open(PAINEIS) as f:
            cad = json.load(f)["paineis"]
    except FileNotFoundError:
        cad = {}
    vistos, linhas = set(), []
    for t in terminais():
        h = t.get("handle") or t.get("id")
        vistos.add(h)
        c = cad.get(h) or {}
        linhas.append({"handle": h, "titulo": str(t.get("title", "")), "projeto": c.get("projeto"),
                       "agente": c.get("agente"), "situacao": "cadastrado" if c else "sem cadastro"})
    for h, c in cad.items():
        if h not in vistos:
            linhas.append({"handle": h, "titulo": "", "projeto": c["projeto"], "agente": c["agente"],
                           "situacao": "fechado: recadastrar"})
    if formato == "toon":
        print(toon.tabela("paineis", linhas, ["handle", "titulo", "projeto", "agente", "situacao"]))
        return
    for l in linhas:
        marca = f"{l['projeto']}/{l['agente']}" if l["agente"] else "(sem cadastro)"
        if l["situacao"].startswith("fechado"):
            print(f"{l['handle']}  (painel fechado ou reaberto)  {marca}  -> recadastrar")
        else:
            print(f"{l['handle']}  {l['titulo']:40.40}  {marca}")


def cadastrar(args):
    if "--raiz" not in args:
        sys.exit("informe --raiz <project-path>")
    i = args.index("--raiz")
    raiz = os.path.abspath(args[i + 1])
    pares = args[:i] + args[i + 2:]
    with open(os.path.join(raiz, CONFIG_REL)) as f:
        cfg = json.load(f)
    projeto, prefixo = cfg["projeto"], cfg["prefixo"]
    novos = {}
    for par in pares:
        h, _, agente = par.partition("=")
        if not h.startswith("term_") or not agente:
            sys.exit(f"formato esperado term_...=<agente>, recebi: {par}")
        if not agente.startswith(prefixo + "-") or not papel_do_nome(agente):
            sys.exit(f"nome fora do padrão {prefixo}-master | {prefixo}-<manager|researcher><NN>-<runtime>: {agente}")
        novos[h] = agente
    if len(set(novos.values())) != len(novos):
        sys.exit("o mesmo agente apareceu em dois painéis")
    ts = datetime.datetime.now().astimezone().isoformat(timespec="seconds")

    def alterar(paineis):
        for h, agente in novos.items():
            for velho in [k for k, v in paineis.items() if v["projeto"] == projeto and v["agente"] == agente]:
                del paineis[velho]  # recadastro: o painel antigo daquele agente sai
            if h in paineis and paineis[h]["projeto"] != projeto:
                sys.exit(f"{h} já está cadastrado no projeto {paineis[h]['projeto']}")
            paineis[h] = {"projeto": projeto, "agente": agente, "papel": papel_do_nome(agente),
                          "raiz": raiz, "cadastrado_em": ts}
    com_trava(alterar)
    for h, a in novos.items():
        print(f"cadastrado {h} = {projeto}/{a}")


def remover(handles):
    def alterar(paineis):
        for h in handles:
            paineis.pop(h, None)
    com_trava(alterar)
    print("removidos:", " ".join(handles))


def init(args):
    def valor(flag):
        if flag not in args:
            sys.exit(f"informe {flag}")
        return args[args.index(flag) + 1]
    raiz, projeto, prefixo = os.path.abspath(valor("--raiz")), valor("--projeto"), valor("--prefixo")
    if not re.fullmatch(r"[a-z0-9]+", prefixo):
        sys.exit("prefixo: só letras minúsculas e números, sem hífen (ex.: <project-prefix>)")
    pasta = os.path.join(raiz, "docs", "agent-board")
    os.makedirs(pasta, exist_ok=True)
    cfg = os.path.join(raiz, CONFIG_REL)
    if not os.path.exists(cfg):
        with open(os.path.join(TEMPLATES, "agent-board.json")) as f:
            dados = json.load(f)
        dados["projeto"], dados["prefixo"] = projeto, prefixo
        with open(cfg, "w") as f:
            json.dump(dados, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print("criado", cfg)
    contrato = os.path.join(pasta, "CONTRATO.md")
    if not os.path.exists(contrato) or "--atualizar-contrato" in args:
        shutil.copy(os.path.join(TEMPLATES, "CONTRATO.md"), contrato)
        print("criado", contrato)
    log = os.path.join(raiz, LOG_REL)
    if not os.path.exists(log):
        open(log, "a").close()
        print("criado", log)
    cmd_log.garantir_gitattributes(raiz)


COMANDOS = {"historico": cmd_log.historico, "verificar": cmd_log.verificar,
            "arquivar": cmd_log.arquivar, "reenviar": cmd_log.reenviar}


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == "init":
        init(args)
    elif cmd == "listar":
        listar(args)
    elif cmd in COMANDOS:
        COMANDOS[cmd](args)
    elif cmd == "cadastrar":
        cadastrar(args)
    elif cmd == "remover":
        remover(args)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
