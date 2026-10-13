"""
painel.py: o agent-board num canvas do Maestri.

  eu            mostra o painel deste terminal (handle e nome no canvas)
  solicitar     o agente pede o próprio cadastro (o master confirma com o CEO e cadastra)
  solicitacoes  o master vê os pedidos de cadastro
  maestri conectar | rotina   leva a política para o canvas (Maestro; só mostra sem --aplicar)

No Maestri não há lista de terminais com o ID de cada um: quem sabe o próprio
ID é o terminal ($MAESTRI_TERMINAL_ID). Por isso o cadastro começa no agente
(solicitar) e termina no master (cadastrar), sempre com a confirmação do CEO.
"""
import argparse
import json
import os
import re
import shlex
import sys

import maestri
import toon
from base import CONFIG_REL, HOME, agora, carregar_paineis, eh_maestri, ler_json, meu_handle, prefixo_home, trava
from cmd_log import exigir_master, raiz_de

SOLICITACOES = os.path.join(HOME, "solicitacoes")
SCRIPTS = os.path.dirname(os.path.abspath(__file__))


def _arquivo(handle):
    return os.path.join(SOLICITACOES, re.sub(r"[^A-Za-z0-9_-]", "_", handle) + ".json")


def solicitacao(handle):
    return ler_json(_arquivo(handle), None)


def eu(args):
    p = argparse.ArgumentParser(prog="painel.py eu")
    p.add_argument("--formato", choices=("texto", "toon"), default="texto")
    a = p.parse_args(args)
    handle = meu_handle()
    if handle is None:
        sys.exit("este terminal não está no Orca nem no Maestri (sem $ORCA_TERMINAL_HANDLE e sem $MAESTRI_TERMINAL_ID)")
    cad = carregar_paineis().get(handle) or {}
    dados = {"handle": handle, "transporte": "maestri" if eh_maestri(handle) else "orca",
             "nome_canvas": maestri.meu_nome() if eh_maestri(handle) else None,
             "agente": cad.get("agente"), "projeto": cad.get("projeto"), "papel": cad.get("papel")}
    if a.formato == "toon":
        print(toon.objeto(dados))
        return
    for k, v in dados.items():
        print(f"{k}: {v if v is not None else '-'}")
    if not cad:
        print("sem cadastro: peça ao master" + (" (ou rode painel.py solicitar)" if eh_maestri(handle) else ""))


def solicitar(args):
    p = argparse.ArgumentParser(prog="painel.py solicitar",
                                description="Pede o cadastro deste terminal do Maestri como <agente> do projeto.")
    p.add_argument("--raiz", required=True)
    p.add_argument("--agente", required=True, help="nome no padrão do time, ex.: alpha-manager01-cc")
    a = p.parse_args(args)
    raiz = raiz_de(a.raiz)
    handle = meu_handle()
    if not eh_maestri(handle):
        sys.exit("solicitar é para terminais do Maestri; no Orca o master vê os painéis com painel.py listar")
    nome = maestri.meu_nome()
    if not nome:
        sys.exit("não consegui ler o nome deste terminal no canvas (maestri list); confira a CLI com maestri debug")
    dados = {"handle": handle, "nome_canvas": nome, "agente": a.agente, "raiz": raiz,
             "projeto": ler_json(os.path.join(raiz, CONFIG_REL), {}).get("projeto"),
             "ts": agora().isoformat(timespec="seconds")}
    os.makedirs(SOLICITACOES, exist_ok=True)
    with trava(os.path.join(HOME, "travas", "solicitacoes.lock")):
        tmp = _arquivo(handle) + ".tmp"
        with open(tmp, "w") as f:
            json.dump(dados, f, ensure_ascii=False)
        os.replace(tmp, _arquivo(handle))
    print(f"pedido de cadastro registrado: {handle} ({nome}) como {a.agente}. "
          "O master confirma com o CEO e roda painel.py cadastrar.")


def pendentes_de_cadastro():
    cad = carregar_paineis()
    out = []
    try:
        nomes = sorted(os.listdir(SOLICITACOES))
    except FileNotFoundError:
        nomes = []
    for n in nomes:
        s = ler_json(os.path.join(SOLICITACOES, n), None) if n.endswith(".json") else None
        if s and cad.get(s.get("handle"), {}).get("nome_canvas") != s.get("nome_canvas"):
            out.append(s)
    return out


def solicitacoes(args):
    p = argparse.ArgumentParser(prog="painel.py solicitacoes")
    p.add_argument("--formato", choices=("texto", "toon"), default="texto")
    a = p.parse_args(args)
    pend = pendentes_de_cadastro()
    if a.formato == "toon":
        print(toon.tabela("solicitacoes", pend, ["handle", "nome_canvas", "agente", "projeto", "ts"]))
        return
    if not pend:
        print("nenhum pedido de cadastro pendente")
        return
    for s in pend:
        print(f"{s['handle']}  {s['nome_canvas']!r}  quer ser {s['agente']} em {s.get('projeto')}  ({s['ts']})")
    print("\nConfirme a lista com o CEO e cadastre: painel.py cadastrar --raiz <path> "
          + " ".join(f"{s['handle']}={s['agente']}" for s in pend))


def _pares(cfg, agentes):
    """Pares de agentes (nomes do time) que precisam de corda no canvas para a política funcionar.

    Master com todos (escalação, entrega, respostas); os demais conforme `ligacoes`,
    ou, sem ela, conforme `pode_pedir_a` de cada papel. Corda serve aos dois sentidos.
    """
    por_papel = {}
    for a in agentes:
        por_papel.setdefault(a["papel"], []).append(a["agente"])
    pares = set()
    for m in por_papel.get("master", []):
        pares.update(tuple(sorted((m, o["agente"]))) for o in agentes if o["agente"] != m)
    ligacoes = cfg.get("ligacoes")
    for de in agentes:
        for para in agentes:
            if de is para:
                continue
            if ligacoes is not None:
                casa = any(l[0] in (de["papel"], de["agente"]) and l[1] in (para["papel"], para["agente"])
                           for l in ligacoes if isinstance(l, list) and len(l) == 2)
            else:
                casa = para["papel"] in cfg.get("papeis", {}).get(de["papel"], {}).get("pode_pedir_a", [])
            if casa:
                pares.add(tuple(sorted((de["agente"], para["agente"]))))
    return sorted(pares)


def conectar(args):
    p = argparse.ArgumentParser(prog="painel.py maestri conectar",
                                description="Cria no canvas as cordas que a política do time exige (maestri connect).")
    p.add_argument("--raiz", required=True)
    p.add_argument("--aplicar", action="store_true", help="roda os maestri connect (Maestro); sem isso só mostra")
    a = p.parse_args(args)
    exigir_master("maestri conectar")
    raiz = raiz_de(a.raiz)
    cfg = ler_json(os.path.join(raiz, "docs", "agent-board", "agent-board.json"), {})
    agentes = [dict(v, handle=h) for h, v in carregar_paineis().items()
               if v.get("projeto") == cfg.get("projeto") and eh_maestri(h)]
    canvas = {x["agente"]: x.get("nome_canvas") or x["agente"] for x in agentes}
    pares = _pares(cfg, agentes)
    if not pares:
        print("nenhuma corda a criar (cadastre agentes do Maestri no projeto antes)")
        return
    falhas = 0
    for x, y in pares:
        linha = ["connect", canvas[x], canvas[y]]
        if not a.aplicar:
            print(shlex.join(["maestri"] + linha))
            continue
        codigo, saida = maestri.rodar(linha)
        falhas += codigo != 0
        print(f"{'ok   ' if codigo == 0 else 'FALHA'} {canvas[x]} <-> {canvas[y]}"
              + ("" if codigo == 0 else f": {saida.strip()[:200]}"))
    if not a.aplicar:
        print(f"\n{len(pares)} corda(s). Rode de novo com --aplicar num terminal em modo Maestro.")
    elif falhas:
        sys.exit(1)


def rotina(args):
    p = argparse.ArgumentParser(prog="painel.py maestri rotina",
                                description="Agenda o painel.py vigiar como routine do Maestri (escala atrasados).")
    p.add_argument("--raiz", required=True)
    p.add_argument("--a-cada", dest="a_cada", default="10m", help="intervalo da routine (padrão 10m)")
    p.add_argument("--aplicar", action="store_true", help="cria a routine (Maestro); sem isso só mostra")
    a = p.parse_args(args)
    exigir_master("maestri rotina")
    raiz = raiz_de(a.raiz)
    projeto = ler_json(os.path.join(raiz, CONFIG_REL), {}).get("projeto")
    comando = f"{prefixo_home()}python3 {shlex.quote(os.path.join(SCRIPTS, 'painel.py'))} vigiar --raiz {shlex.quote(raiz)}"
    linha = ["routine", "create", f"agent-board vigiar {projeto}", "--command", comando, "--every", a.a_cada]
    if not a.aplicar:
        print(shlex.join(["maestri"] + linha))
        print("\nRode de novo com --aplicar num terminal em modo Maestro (de preferência um Shell, que roda o comando).")
        return
    codigo, saida = maestri.rodar(linha)
    print(saida.strip())
    if codigo != 0:
        sys.exit(1)


def maestri_cmd(args):
    sub = {"conectar": conectar, "rotina": rotina}
    if not args or args[0] not in sub:
        sys.exit("uso: painel.py maestri conectar|rotina --raiz <path> [--aplicar]")
    sub[args[0]](args[1:])

