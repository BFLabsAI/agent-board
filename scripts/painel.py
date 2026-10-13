#!/usr/bin/env python3
"""
painel.py: cadastro de painéis do agent-board. Uso exclusivo do master.

  painel.py init --raiz <project-path> --projeto <project-name> --prefixo <project-prefix>
      Cria docs/agent-board/ no projeto (config, CONTRATO.md, log vazio) e a linha
      merge=union no .gitattributes. Não sobrescreve o que já existe; com
      --atualizar-contrato, troca o CONTRATO.md pela versão atual da skill.
  painel.py listar
      Mostra os terminais abertos no Orca, com o cadastro de cada um.
  painel.py cadastrar --raiz <project-path> <term_...>=<agente> [<term_...>=<agente> ...]
      Cadastra (ou recadastra) painéis do projeto. Só depois de o CEO confirmar a lista.
  painel.py remover <term_...> [...]
      Tira painéis do cadastro.

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


def listar():
    try:
        with open(PAINEIS) as f:
            cad = json.load(f)["paineis"]
    except FileNotFoundError:
        cad = {}
    vistos = set()
    for t in terminais():
        h = t.get("handle") or t.get("id")
        vistos.add(h)
        c = cad.get(h)
        marca = f"{c['projeto']}/{c['agente']}" if c else "(sem cadastro)"
        print(f"{h}  {t.get('title', '')!s:40.40}  {marca}")
    for h, c in cad.items():
        if h not in vistos:
            print(f"{h}  (painel fechado ou reaberto)  {c['projeto']}/{c['agente']}  -> recadastrar")


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
    ga = os.path.join(raiz, ".gitattributes")
    linha = LOG_REL + " merge=union"
    atual = open(ga).read() if os.path.exists(ga) else ""
    if linha not in atual:
        with open(ga, "a") as f:
            f.write(("" if atual.endswith("\n") or not atual else "\n") + linha + "\n")
        print("atualizado", ga)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == "init":
        init(args)
    elif cmd == "listar":
        listar()
    elif cmd == "cadastrar":
        cadastrar(args)
    elif cmd == "remover":
        remover(args)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
