"""
agent-board: regras de envio (quem manda o quê para quem), sem I/O.

validar_envio() concentra as checagens sobre a lista de mensagens do log:
permissão por papel, ligações, --responde-a, --veredito, --prazo e limites.
O hook (pre_send) e o painel.py simular usam a mesma função; por isso nada
aqui lê arquivo, escreve log ou chama o orca. Só os embrulhos do fim
(checar_responde_a, pendentes_de) leem o log, para quem já os usava.

Config antiga, sem as chaves novas (ligacoes, limites, prazo_padrao), se
comporta como antes: cada regra nova só vale quando a chave existe.
"""
import datetime
import re

from base import Barrado
from registro import ler_log

TIPOS = ("pedido", "resposta", "aviso", "escalacao", "entrega", "andamento")
MODOS = ("orquestrar", "executar")
VEREDITOS = ("aprovado", "rejeitado")
PRAZO_RE = re.compile(r"^\s*(\d+)\s*([mhd])\s*$")
UNIDADES = {"m": "minutes", "h": "hours", "d": "days"}
# Só estes tipos passam pelas ligações; o resto (resposta, andamento, escalacao e entrega ao master) sempre passa.
TIPOS_LIGADOS = ("pedido", "aviso")


# ---------------------------------------------------------------------------
# Leitura das mensagens
# ---------------------------------------------------------------------------
def ids_de(valor):
    """'c-1, c-2' -> ['c-1', 'c-2']. Aceita None."""
    return [x.strip() for x in str(valor or "").split(",") if x.strip()]


def data(texto):
    """ISO do log -> datetime com fuso; None se ilegível."""
    try:
        d = datetime.datetime.fromisoformat(str(texto or ""))
    except ValueError:
        return None
    return d if d.tzinfo else d.astimezone()


def respostas(mensagens):
    """{id do original: mensagem que o fecha}: a `resposta` de quem recebeu o original, ou a `entrega`
    com --responde-a (o trabalho pedido foi entregue). A entrega mantém o ciclo próprio (revisão do master)."""
    por_id = {l["id"]: l for l in mensagens}
    out = {}
    for l in mensagens:
        if l.get("tipo") not in ("resposta", "entrega"):
            continue
        for cid in ids_de(l.get("responde_a")):
            orig = por_id.get(cid)
            if orig is not None and orig.get("para") == l.get("de"):
                out[cid] = l
    return out


def andamentos(mensagens):
    """{id do pedido: último andamento mandado por quem recebeu o pedido}."""
    por_id = {l["id"]: l for l in mensagens}
    out = {}
    for l in mensagens:
        if l.get("tipo") == "andamento":
            for cid in ids_de(l.get("responde_a")):
                if por_id.get(cid, {}).get("para") == l.get("de"):
                    out[cid] = l
    return out


def pedidos_abertos(agente, mensagens):
    """Pedidos recebidos por `agente` que ainda não têm `resposta` dele (andamento não fecha)."""
    fechados = respostas(mensagens)
    return [l for l in mensagens
            if l.get("tipo") == "pedido" and l.get("para") == agente and l["id"] not in fechados]


def pendentes(agente, mensagens, desde=""):
    """O que o Stop cobra: recebido (menos resposta e andamento) e ainda sem retorno de `agente`.

    Qualquer mensagem de `agente` com --responde-a conta como retorno; andamento
    também, e é assim que um pedido longo deixa de ser cobrado sem ser fechado.
    """
    respondidas = set()
    for l in mensagens:
        if l.get("de") == agente and l.get("responde_a"):
            respondidas.update(ids_de(l["responde_a"]))
    return [l for l in mensagens
            if l.get("para") == agente and l.get("tipo") not in ("resposta", "andamento")
            and l["id"] not in respondidas and l.get("ts", "") >= desde]


def escolher_por_papel(candidatos, mensagens):
    """Roteamento --to papel:<papel>: o agente com menos pedidos abertos; empate, o nome em ordem alfabética."""
    if not candidatos:
        return None
    return min(sorted(candidatos), key=lambda a: len(pedidos_abertos(a, mensagens)))


# ---------------------------------------------------------------------------
# Regras
# ---------------------------------------------------------------------------
def checar_permissao(cfg, de, para, tipo, modo):
    papel_de, papel_para = de["papel"], para["papel"]
    regras = cfg.get("papeis", {}).get(papel_de)
    if regras is None:
        raise Barrado(f"papel {papel_de} não existe em agent-board.json")
    if tipo != "andamento" and tipo not in regras.get("tipos", []):  # andamento é forma de resposta
        raise Barrado(f"{papel_de} não envia '{tipo}'. Permitidos: {', '.join(regras.get('tipos', []))}")
    if tipo == "pedido" and papel_para not in regras.get("pode_pedir_a", []):
        raise Barrado(f"{papel_de} não pode fazer pedido a {papel_para}. Pode pedir a: "
                      f"{', '.join(regras.get('pode_pedir_a', [])) or 'ninguém'}")
    if tipo in ("escalacao", "entrega") and papel_para != "master":
        raise Barrado(f"'{tipo}' só vai para o master")
    if tipo == "pedido" and papel_para == "manager" and modo not in MODOS:
        raise Barrado("pedido para manager precisa de --modo orquestrar ou --modo executar")
    if modo and modo not in MODOS:
        raise Barrado(f"--modo inválido: {modo}. Use orquestrar ou executar")


def _casa(lado, agente):
    """Um lado de uma ligação é um papel (master, manager, researcher) ou o nome de um agente."""
    return lado in (agente["papel"], agente["agente"])


def checar_ligacoes(cfg, de, para, tipo):
    """Com `ligacoes` na config, pedido e aviso só passam nos pares [de, para] listados (com direção)."""
    ligacoes = cfg.get("ligacoes")
    if ligacoes is None or tipo not in TIPOS_LIGADOS:
        return
    pares = [p for p in ligacoes if isinstance(p, (list, tuple)) and len(p) == 2]
    if any(_casa(a, de) and _casa(b, para) for a, b in pares):
        return
    pode = sorted({b for a, b in pares if _casa(a, de)})
    raise Barrado(f"{de['agente']} não tem ligação com {para['agente']} para '{tipo}' (ligacoes de agent-board.json). "
                  f"Pode mandar pedido/aviso para: {', '.join(pode) or 'ninguém'}. "
                  "Se precisa dele, mande escalacao ao master")


def checar_responde_a(agente, valor, mensagens, tipo="resposta"):
    """--responde-a de resposta e andamento: aponta para mensagens que existem, recebidas por `agente`.

    Resposta fecha a conversa: não se responde resposta nem andamento.
    Andamento só vale para um pedido ainda aberto, e vai para quem pediu.
    Entrega (opcional) com --responde-a fecha o pedido que ela cumpre; mesmas checagens da resposta.
    """
    if not isinstance(valor, str) or not valor.strip():
        raise Barrado(f"{tipo} precisa de --responde-a <id da mensagem original>")
    por_id = {l["id"]: l for l in mensagens}
    fechados = respostas(mensagens)
    for cid in ids_de(valor):
        if cid not in por_id:
            raise Barrado(f"--responde-a {cid}: essa mensagem não existe no log do projeto")
        orig = por_id[cid]
        if orig.get("tipo") == "resposta":
            raise Barrado(f"{cid} já é uma resposta, e resposta não se responde (a conversa está fechada). "
                          "Se precisa de algo novo, mande --type pedido ou --type aviso")
        if orig.get("tipo") == "andamento":
            raise Barrado(f"{cid} é um andamento; aponte --responde-a para o pedido original")
        if orig.get("para") != agente:
            raise Barrado(f"{cid} não foi enviada para você ({orig.get('para')}); responda só ao que você recebeu")
        if tipo == "andamento":
            if orig.get("tipo") != "pedido":
                raise Barrado(f"andamento só vale para pedido, e {cid} é '{orig.get('tipo')}'. "
                              "Responda com --type resposta")
            if cid in fechados:
                raise Barrado(f"{cid} já foi respondido; andamento só vale para pedido aberto")


def checar_destino_andamento(para, valor, mensagens):
    por_id = {l["id"]: l for l in mensagens}
    for cid in ids_de(valor):
        if por_id[cid].get("de") != para["agente"]:
            raise Barrado(f"o andamento de {cid} vai para quem fez o pedido: --to {por_id[cid].get('de')}")


def checar_veredito(tipo, valor_responde_a, veredito, mensagens):
    """Resposta a uma entrega leva --veredito aprovado|rejeitado; em qualquer outro caso, --veredito é inválido."""
    if veredito is not None:
        if not isinstance(veredito, str) or veredito not in VEREDITOS:
            raise Barrado(f"--veredito inválido: {veredito if isinstance(veredito, str) else '(vazio)'}. "
                          "Use --veredito aprovado ou --veredito rejeitado")
        if tipo != "resposta":
            raise Barrado("--veredito só vale em resposta a uma entrega; tire o --veredito")
    if tipo != "resposta":
        return
    por_id = {l["id"]: l for l in mensagens}
    entregas = [c for c in ids_de(valor_responde_a) if por_id.get(c, {}).get("tipo") == "entrega"]
    if entregas and veredito is None:
        raise Barrado(f"resposta a entrega ({', '.join(entregas)}) precisa de --veredito aprovado "
                      "ou --veredito rejeitado (rejeitado: diga no --body o que falta)")
    if veredito is not None and not entregas:
        raise Barrado("--veredito só vale em resposta a uma entrega; tire o --veredito")


def calcular_prazo(cfg, tipo, prazo, agora):
    """--prazo 30m|2h|1d (ou prazo_padrao da config) -> ISO com fuso. None se não houver prazo."""
    if prazo is not None and tipo != "pedido":
        raise Barrado("--prazo só vale em pedido; tire o --prazo")
    if tipo != "pedido":
        return None
    origem = "--prazo"
    if prazo is None:
        prazo, origem = cfg.get("prazo_padrao"), "prazo_padrao de agent-board.json"
        if prazo is None:
            return None
    m = PRAZO_RE.match(prazo) if isinstance(prazo, str) else None
    if not m or int(m.group(1)) <= 0:
        raise Barrado(f"{origem} inválido: {prazo if isinstance(prazo, str) else '(vazio)'}. "
                      "Use minutos, horas ou dias, ex.: --prazo 30m, 2h ou 1d")
    fim = agora + datetime.timedelta(**{UNIDADES[m.group(2)]: int(m.group(1))})
    return fim.isoformat(timespec="seconds")


def _limite(limites, chave):
    v = limites.get(chave)
    return v if isinstance(v, int) and not isinstance(v, bool) and v > 0 else None


def checar_pedidos_abertos(cfg, para, tipo, mensagens):
    n_max = _limite(cfg.get("limites") or {}, "pedidos_abertos_max")
    if tipo != "pedido" or n_max is None:
        return
    abertos = pedidos_abertos(para["agente"], mensagens)
    if len(abertos) >= n_max:
        raise Barrado(f"{para['agente']} já tem {len(abertos)} pedido(s) aberto(s) (limite {n_max}: "
                      f"{', '.join(l['id'] for l in abertos)}). Espere uma resposta, mande para outro agente "
                      "(--to papel:<papel> escolhe o menos ocupado) ou mande escalacao ao master")


def ping_pong(cfg, de, para, tipo, mensagens, agora):
    """Mais de ping_pong_max mensagens entre o mesmo par na janela, sem entrega no meio -> dict; senão None.

    Não barra: o hook só avisa o master. Conta a mensagem que está saindo.
    """
    limites = cfg.get("limites") or {}
    n_max, janela = _limite(limites, "ping_pong_max"), _limite(limites, "ping_pong_janela_min")
    if n_max is None or janela is None or tipo == "entrega":
        return None
    corte = agora - datetime.timedelta(minutes=janela)
    par = {de["agente"], para["agente"]}
    n = 1
    for l in mensagens:
        ts = data(l.get("ts"))
        if ts is None or ts < corte or {l.get("de"), l.get("para")} != par:
            continue
        n = 1 if l.get("tipo") == "entrega" else n + 1  # entrega no meio zera a conta
    if n <= n_max:
        return None
    return {"par": sorted(par), "n": n, "janela_min": janela}


def validar_envio(cfg, eu, para, tipo, modo, responde_a, veredito, prazo, mensagens, agora=None):
    """Todas as checagens de um envio, sobre as mensagens do log até aqui. Levanta Barrado.

    eu e para: {"agente", "papel"}. responde_a, veredito e prazo vêm como na linha de comando
    (None quando ausentes). Devolve os campos que o envio grava: {"prazo", "veredito", "ping_pong"}.
    """
    agora = agora or datetime.datetime.now().astimezone()
    checar_permissao(cfg, eu, para, tipo, modo)
    checar_ligacoes(cfg, eu, para, tipo)
    if tipo in ("resposta", "andamento") or (tipo == "entrega" and responde_a):  # na entrega é opcional
        checar_responde_a(eu["agente"], responde_a, mensagens, tipo)
    if tipo == "andamento":
        checar_destino_andamento(para, responde_a, mensagens)
    checar_veredito(tipo, responde_a, veredito, mensagens)
    fim = calcular_prazo(cfg, tipo, prazo, agora)
    checar_pedidos_abertos(cfg, para, tipo, mensagens)
    return {"prazo": fim, "veredito": veredito, "ping_pong": ping_pong(cfg, eu, para, tipo, mensagens, agora)}


# ---------------------------------------------------------------------------
# Embrulhos com leitura do log (assinaturas antigas do hook_core)
# ---------------------------------------------------------------------------
def pendentes_de(eu):
    """Mensagens recebidas por `eu` (menos respostas e andamentos) que ele ainda não respondeu."""
    return pendentes(eu["agente"], ler_log(eu["raiz"]), eu.get("cadastrado_em", ""))
