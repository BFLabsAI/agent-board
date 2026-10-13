"""
painel.py: comandos sobre o log do projeto (historico, verificar, arquivar, reenviar).

Todos leem; só arquivar e reenviar escrevem, e sempre pelo registro.py.
"""
import argparse
import json
import os
import subprocess
import sys

import registro
import toon
from base import CONFIG_REL, HOME, LOG_REL, achar_orca, agora, carregar_paineis, ler_json

CAMPOS = ("id", "ts", "de", "para", "tipo", "modo", "assunto", "responde_a", "issues")


def raiz_de(valor):
    raiz = os.path.abspath(valor)
    if not os.path.exists(os.path.join(raiz, CONFIG_REL)):
        sys.exit(f"{raiz} não tem {CONFIG_REL}; rode painel.py init antes")
    return raiz


def exigir_master(comando):
    """Comando que escreve no log: só o master, ou um humano num terminal fora do cadastro."""
    eu = carregar_paineis().get(os.environ.get("ORCA_TERMINAL_HANDLE"))
    if eu is not None and eu.get("papel") != "master":
        sys.exit(f"painel.py {comando} é só do master; {eu['agente']} pode pedir a ele")


def imprimir(nome, linhas, formato, campos=CAMPOS):
    linhas = [{c: l.get(c) for c in campos} for l in linhas]
    if formato == "json":
        print(json.dumps(linhas, ensure_ascii=False, indent=2))
    else:
        print(toon.tabela(nome, linhas, list(campos)))


def historico(args):
    p = argparse.ArgumentParser(prog="painel.py historico")
    p.add_argument("--raiz", required=True)
    p.add_argument("--agente", help="só mensagens de ou para este agente")
    p.add_argument("--sobre", help="trecho do assunto (sem diferenciar maiúsculas)")
    p.add_argument("--n", type=int, default=20, help="últimas N mensagens (0 = todas)")
    p.add_argument("--tudo", action="store_true", help="inclui o arquivo morto")
    p.add_argument("--formato", choices=("toon", "json"), default="toon")
    a = p.parse_args(args)
    imprimir("mensagens", filtrar(raiz_de(a.raiz), a.agente, a.sobre, a.n, a.tudo), a.formato)


def filtrar(raiz, agente=None, sobre=None, n=20, tudo=False):
    """Mensagens do historico: de ou para `agente`, com `sobre` no assunto, as últimas `n` (0 = todas).

    Também usada pelo servidor MCP (board_historico).
    """
    msgs = registro.ler_tudo(raiz) if tudo else registro.ler_log(raiz)
    if agente:
        msgs = [m for m in msgs if agente in (m.get("de"), m.get("para"))]
    if sobre:
        msgs = [m for m in msgs if sobre.lower() in str(m.get("assunto", "")).lower()
                or sobre.lower() in str(m.get("tema", "")).lower()]
    if n:
        msgs = msgs[-n:]
    return msgs


def verificar(args):
    p = argparse.ArgumentParser(prog="painel.py verificar")
    p.add_argument("--raiz", required=True)
    a = p.parse_args(args)
    r = registro.verificar(raiz_de(a.raiz))
    print(f"{r['linhas']} linhas conferidas, {r['bifurcacoes']} bifurcação(ões) de merge")
    for prob in r["problemas"]:
        print("PROBLEMA", prob)
    if r["problemas"]:
        sys.exit(1)
    print("cadeia íntegra")


def arquivar(args):
    p = argparse.ArgumentParser(prog="painel.py arquivar")
    p.add_argument("--raiz", required=True)
    p.add_argument("--dias", type=int, default=30)
    a = p.parse_args(args)
    exigir_master("arquivar")
    raiz = raiz_de(a.raiz)
    n = registro.arquivar(raiz, a.dias)
    garantir_gitattributes(raiz)
    print(f"{n} linha(s) movida(s) para {registro.ARQUIVO_REL}/" if n else "nada para arquivar")


def garantir_gitattributes(raiz):
    """Log ativo e arquivo morto se juntam por linhas no merge (merge=union)."""
    ga = os.path.join(raiz, ".gitattributes")
    atual = open(ga).read() if os.path.exists(ga) else ""
    faltam = [l for l in (LOG_REL + " merge=union", registro.ARQUIVO_REL + "/*.jsonl merge=union")
              if l not in atual]
    if faltam:
        with open(ga, "a") as f:
            f.write(("" if atual.endswith("\n") or not atual else "\n") + "\n".join(faltam) + "\n")
        print("atualizado", ga)


def _handle_de(agente, projeto, paineis):
    for h, p in paineis.items():
        if p.get("agente") == agente and p.get("projeto") == projeto:
            return h
    sys.exit(f"{agente} não está cadastrado no projeto {projeto}; recadastre o painel antes de reenviar")


def reenviar(args):
    p = argparse.ArgumentParser(prog="painel.py reenviar")
    p.add_argument("--raiz", required=True)
    p.add_argument("id")
    a = p.parse_args(args)
    exigir_master("reenviar")
    raiz = raiz_de(a.raiz)
    msg = registro.achar(raiz, a.id)
    if msg is None:
        sys.exit(f"{a.id} não está no log ativo do projeto")
    guardado = ler_json(os.path.join(HOME, "envios", a.id + ".json"), None)
    if guardado is None:
        sys.exit(f"o comando de {a.id} não está mais guardado (só ficam os dos últimos dias)")
    projeto = ler_json(os.path.join(raiz, CONFIG_REL), {}).get("projeto")
    paineis = carregar_paineis()
    argv = list(guardado["argv"])
    argv[0] = achar_orca()
    for flag, agente in (("--to", msg["para"]), ("--from", msg["de"])):
        argv[argv.index(flag) + 1] = _handle_de(agente, projeto, paineis)
    r = subprocess.run(argv, capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        sys.exit(f"o orca recusou o reenvio de {a.id}: {(r.stderr or r.stdout).strip()}")
    registro.gravar_log(raiz, {"id": a.id, "ts": agora().isoformat(timespec="seconds"), "status": "reenviado"})
    print(f"{a.id} reenviado para {msg['para']}")
