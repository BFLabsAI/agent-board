"""
painel.py: comandos sobre os pedidos e entregas do projeto (tarefas, vigiar, simular).

tarefas e simular só leem. vigiar escreve uma linha de status "atrasado" por
pedido vencido, sempre pelo registro.py, e avisa o master na tela.
"""
import argparse
import json
import os
import sys

import registro
import toon
from avisos import disparar
from base import CONFIG_REL, Barrado, agora, carregar_paineis, ler_json, master_do_projeto, papel_do_nome, registrar_aviso
from cmd_log import exigir_master, raiz_de
from politica import TIPOS, andamentos, data, respostas, validar_envio

CAMPOS = ("id", "de", "para", "assunto", "estado", "prazo")


def vencido(l, quando):
    fim = data(l.get("prazo")) if l.get("prazo") else None
    return fim is not None and fim < quando


def estado_de(l, fechados, andam, quando):
    """Estado de um pedido ou de uma entrega, olhando respostas, andamentos e prazo."""
    resp = fechados.get(l["id"])
    if l.get("tipo") == "entrega":
        if resp is None:
            return "aguardando_revisao"
        return resp.get("veredito") if resp.get("veredito") in ("aprovado", "rejeitado") else "concluido"
    if resp is not None:
        return "concluido"
    if vencido(l, quando):
        return "atrasado"
    return "em_andamento" if l["id"] in andam else "aberto"


def quadro(mensagens, quando, agente=None):
    """Uma linha por pedido/entrega: id, de, para, assunto, estado, prazo."""
    fechados, andam = respostas(mensagens), andamentos(mensagens)
    out = []
    for l in mensagens:
        if l.get("tipo") not in ("pedido", "entrega"):
            continue
        if agente and agente not in (l.get("de"), l.get("para")):
            continue
        out.append({"id": l["id"], "de": l.get("de"), "para": l.get("para"), "assunto": l.get("assunto"),
                    "estado": estado_de(l, fechados, andam, quando), "prazo": l.get("prazo")})
    return out


def tarefas(args):
    p = argparse.ArgumentParser(prog="painel.py tarefas")
    p.add_argument("--raiz", required=True)
    p.add_argument("--agente", help="só pedidos e entregas de ou para este agente")
    p.add_argument("--formato", choices=("toon", "json"), default="toon")
    a = p.parse_args(args)
    linhas = quadro(registro.ler_log(raiz_de(a.raiz)), agora(), a.agente)
    if a.formato == "json":
        print(json.dumps(linhas, ensure_ascii=False, indent=2))
    else:
        print(toon.tabela("tarefas", linhas, list(CAMPOS)))


def atrasados(raiz, quando):
    """Pedidos com prazo vencido, sem resposta e ainda não escalados (sem status "atrasado")."""
    msgs = registro.ler_log(raiz)
    fechados, st = respostas(msgs), registro.status(raiz)
    return [l for l in msgs if l.get("tipo") == "pedido" and l["id"] not in fechados
            and vencido(l, quando) and "atrasado" not in st.get(l["id"], [])]


def vigiar(args):
    p = argparse.ArgumentParser(prog="painel.py vigiar")
    p.add_argument("--raiz", required=True)
    a = p.parse_args(args)
    exigir_master("vigiar")
    raiz = raiz_de(a.raiz)
    quando = agora()
    vencidos = atrasados(raiz, quando)
    if not vencidos:
        print("nenhum pedido atrasado para escalar")
        return
    for l in vencidos:
        registro.gravar_log(raiz, {"id": l["id"], "ts": quando.isoformat(timespec="seconds"), "status": "atrasado"})
        print(f"{l['id']} atrasado: {l['de']} -> {l['para']}, prazo {l['prazo']}: {l.get('assunto')}")
    # Um aviso só por rodada: o aviso na tela é limitado a 1 por destino a cada 60 s.
    texto = (f"[agent-board] {len(vencidos)} pedido(s) passaram do prazo sem resposta: "
             f"{', '.join(l['id'] + ' (' + str(l['para']) + ')' for l in vencidos)}. "
             f"Veja: painel.py tarefas --raiz {raiz}")
    registrar_aviso(texto)
    projeto = ler_json(os.path.join(raiz, CONFIG_REL), {}).get("projeto")
    master = master_do_projeto(carregar_paineis(), projeto)
    if master:
        disparar(master, vencidos[0]["id"], texto)
    else:
        print("master do projeto não está cadastrado; o aviso ficou só no avisos.log")


def _agente(nome):
    return {"agente": nome, "papel": papel_do_nome(nome)}


def simular_log(mensagens, cfg_nova, cfg_atual):
    """Reexecuta cada mensagem contra a config nova, com o log até aquele ponto. -> (barradas, avisos)."""
    barradas, avisos = [], []
    for i, l in enumerate(mensagens):
        if l.get("tipo") not in TIPOS or not l.get("de") or not l.get("para"):
            continue  # linha que não é envio do time (ex.: nota)
        antes, quando = mensagens[:i], data(l.get("ts")) or agora()
        chamada = (_agente(l["de"]), _agente(l["para"]), l["tipo"], l.get("modo"), l.get("responde_a"),
                   l.get("veredito"), None, antes, quando)
        try:
            r = validar_envio(cfg_nova, *chamada)
        except Barrado as exc:
            try:
                validar_envio(cfg_atual, *chamada)
                hoje = "passa"
            except Barrado:
                hoje = "barrada"
            barradas.append({"id": l["id"], "de": l["de"], "para": l["para"], "tipo": l["tipo"],
                             "motivo": str(exc), "config_atual": hoje})
            continue
        if r["ping_pong"]:
            avisos.append({"id": l["id"], "par": " ".join(r["ping_pong"]["par"]), "n": r["ping_pong"]["n"]})
    return barradas, avisos


def simular(args):
    p = argparse.ArgumentParser(prog="painel.py simular")
    p.add_argument("--raiz", required=True)
    p.add_argument("--config", required=True, help="agent-board.json novo, a testar contra o log")
    p.add_argument("--tudo", action="store_true", help="inclui o arquivo morto")
    p.add_argument("--formato", choices=("toon", "json"), default="toon")
    a = p.parse_args(args)
    raiz = raiz_de(a.raiz)
    try:
        with open(a.config) as f:
            cfg_nova = json.load(f)
    except (OSError, ValueError) as exc:
        sys.exit(f"não consegui ler {a.config}: {exc}")
    cfg_atual = ler_json(os.path.join(raiz, CONFIG_REL), {})
    msgs = registro.ler_tudo(raiz) if a.tudo else registro.ler_log(raiz)
    barradas, avisos = simular_log(msgs, cfg_nova, cfg_atual)
    if a.formato == "json":
        print(json.dumps({"barradas": barradas, "ping_pong": avisos}, ensure_ascii=False, indent=2))
    else:
        print(toon.tabela("barradas", barradas, ["id", "de", "para", "tipo", "motivo", "config_atual"]))
        if avisos:
            print(toon.tabela("ping_pong", avisos, ["id", "par", "n"]))
        print(f"{len(barradas)} de {len(msgs)} mensagem(ns) seriam barradas pela config nova")
    if barradas:
        sys.exit(1)
