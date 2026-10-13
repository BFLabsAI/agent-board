"""
agent-board: o estado do projeto que o painel web mostra (GET /api/estado).

Função pura sobre o log, o cadastro e as notas: não escreve nada. Os estados
de tarefa seguem docs/userguide/painel.md.
"""
import datetime
import glob
import os

import registro
from base import VERSAO

TIPOS_TAREFA = ("pedido", "entrega")
PERIODOS = {"hoje": None, "24h": datetime.timedelta(hours=24), "7d": datetime.timedelta(days=7)}


def _ts(texto):
    try:
        return datetime.datetime.fromisoformat(texto)
    except (TypeError, ValueError):
        return None


def _ids(valor):
    return [x.strip() for x in str(valor or "").split(",") if x.strip()]


def inicio_do_periodo(periodo, agora):
    if periodo == "hoje":
        return agora.replace(hour=0, minute=0, second=0, microsecond=0)
    return agora - PERIODOS.get(periodo, PERIODOS["24h"])


def tarefas(msgs, agora):
    """Uma tarefa por pedido/entrega, com o estado derivado das respostas e andamentos."""
    respostas, andamentos = {}, {}
    for m in msgs:
        for cid in _ids(m.get("responde_a")):
            if m.get("tipo") == "resposta":
                respostas.setdefault(cid, m)
            elif m.get("tipo") == "andamento":
                andamentos[cid] = m  # o último vale
    out = []
    for m in msgs:
        if m.get("tipo") not in TIPOS_TAREFA:
            continue
        r, a = respostas.get(m["id"]), andamentos.get(m["id"])
        prazo = _ts(m.get("prazo"))
        if m["tipo"] == "entrega":
            if r is None:
                estado = "aguardando_revisao"
            else:
                estado = {"aprovado": "aprovado", "rejeitado": "rejeitado"}.get(r.get("veredito"), "concluido")
        elif r is not None:
            estado = "concluido"
        elif prazo and prazo < agora:
            estado = "atrasado"
        elif a is not None:
            estado = "em_andamento"
        else:
            estado = "aberto"
        out.append({"id": m["id"], "ts": m.get("ts"), "tipo": m["tipo"], "de": m.get("de"), "para": m.get("para"),
                    "assunto": m.get("assunto"), "estado": estado, "prazo": m.get("prazo"),
                    "issues": m.get("issues") or [], "branch": m.get("branch"),
                    "andamento": (a or {}).get("assunto"), "andamento_ts": (a or {}).get("ts"),
                    "fechada_em": (r or {}).get("ts")})
    return out


def pendentes(msgs, agentes):
    """Mesma regra do Stop: recebida, não resposta, sem resposta do destino, depois do cadastro."""
    respondidas = {}
    for m in msgs:
        if m.get("responde_a") and m.get("tipo") in ("resposta", "andamento"):
            for cid in _ids(m["responde_a"]):
                respondidas.setdefault(m.get("de"), set()).add(cid)
    out = {}
    for ag in agentes:
        nome, desde = ag["agente"], ag.get("cadastrado_em") or ""
        out[nome] = [m["id"] for m in msgs
                     if m.get("para") == nome and m.get("tipo") not in ("resposta", "andamento", "nota")
                     and m["id"] not in respondidas.get(nome, set()) and (m.get("ts") or "") >= desde]
    return out


def _tempo_resposta(msgs, desde):
    """Minutos entre a mensagem e a primeira resposta/andamento, no período."""
    origem = {m["id"]: _ts(m.get("ts")) for m in msgs}
    vistos, minutos = set(), []
    for m in msgs:
        if m.get("tipo") not in ("resposta", "andamento"):
            continue
        t = _ts(m.get("ts"))
        for cid in _ids(m.get("responde_a")):
            o = origem.get(cid)
            if cid in vistos or o is None or t is None or t < desde:
                continue
            vistos.add(cid)
            minutos.append(max(0.0, (t - o).total_seconds() / 60))
    if not minutos:
        return None
    minutos.sort()
    return {"media": round(sum(minutos) / len(minutos), 1),
            "p90": round(minutos[min(len(minutos) - 1, int(len(minutos) * 0.9))], 1)}


def ping_pong(msgs, limite=12, janela_min=10):
    """Pares com mais de `limite` mensagens (nos dois sentidos) dentro de `janela_min`, sem entrega no meio."""
    por_par = {}
    for m in msgs:
        if m.get("de") and m.get("para") and _ts(m.get("ts")):
            por_par.setdefault(tuple(sorted((m["de"], m["para"]))), []).append(m)
    out = []
    for (a, b), ms in sorted(por_par.items()):
        ini = 0
        for fim, m in enumerate(ms):
            if m.get("tipo") == "entrega":
                ini = fim + 1
                continue
            t = _ts(m["ts"])
            while ini < fim and (t - _ts(ms[ini]["ts"])).total_seconds() > janela_min * 60:
                ini += 1
            if fim - ini + 1 > limite:
                out.append({"de": a, "para": b, "n": fim - ini + 1, "janela_min": janela_min, "ate": m["ts"]})
                break
    return out


def notas(raiz, msgs, limite=12):
    """Notas do log (tipo nota) e arquivos em docs/agent-board/notas/, mais recentes primeiro."""
    out = [{"tema": m.get("tema"), "de": m.get("de"), "ts": m.get("ts"), "decisao": bool(m.get("decisao")),
            "titulo": m.get("assunto") or m.get("titulo") or m.get("tema"), "trecho": m.get("trecho")}
           for m in msgs if m.get("tipo") == "nota"]
    temas = {n["tema"] for n in out}
    for caminho in glob.glob(os.path.join(raiz, "docs", "agent-board", "notas", "*.md")):
        tema = os.path.splitext(os.path.basename(caminho))[0]
        if tema in temas:
            continue
        with open(caminho, errors="replace") as f:
            linhas = [l.strip() for l in f.read(4000).splitlines() if l.strip()]
        quando = datetime.datetime.fromtimestamp(os.path.getmtime(caminho)).astimezone()
        out.append({"tema": tema, "de": None, "ts": quando.isoformat(timespec="seconds"), "decisao": False,
                    "titulo": next((l.lstrip("# ") for l in linhas if l.startswith("#")), tema),
                    "trecho": next((l for l in linhas if not l.startswith("#")), "")})
    out.sort(key=lambda n: n.get("ts") or "", reverse=True)
    return out[:limite]


def montar(raiz, projeto, paineis, periodo="hoje", agora=None, abertos=None, cadeia=None, limites=None):
    """Tudo o que a página precisa, num dict serializável.

    `abertos`: handles abertos no Orca agora (None = não deu para perguntar).
    `cadeia`: resultado de registro.verificar (None = calcula).
    """
    agora = agora or datetime.datetime.now().astimezone()
    desde = inicio_do_periodo(periodo, agora)
    duracao = agora - desde
    msgs = registro.ler_log(raiz)
    no_periodo = [m for m in msgs if (_ts(m.get("ts")) or agora) >= desde and m.get("tipo") != "nota"]
    anterior = [m for m in msgs if desde - duracao <= (_ts(m.get("ts")) or agora) < desde and m.get("tipo") != "nota"]

    agentes = sorted(({"handle": h, **p} for h, p in paineis.items() if p.get("projeto") == projeto),
                     key=lambda a: ({"master": 0, "manager": 1}.get(a.get("papel"), 2), a["agente"]))
    for a in agentes:
        a["aberto"] = None if abertos is None else a["handle"] in abertos
        a.pop("raiz", None)
    pend = pendentes(msgs, agentes)
    tar = tarefas(msgs, agora)
    arestas = {}
    for m in no_periodo:
        if m.get("de") and m.get("para"):
            chave = (m["de"], m["para"])
            arestas[chave] = arestas.get(chave, 0) + 1
    atrasados = [t for t in tar if t["estado"] == "atrasado"]
    revisao = [t for t in tar if t["estado"] == "aguardando_revisao"]
    cadeia = cadeia if cadeia is not None else registro.verificar(raiz)
    limites = limites or {}
    return {
        "projeto": projeto,
        "versao": VERSAO,
        "agora": agora.isoformat(timespec="seconds"),
        "periodo": periodo,
        "cadeia": {"linhas": cadeia["linhas"], "integra": not cadeia["problemas"],
                   "problemas": cadeia["problemas"][:5]},
        "indicadores": {
            "mensagens": len(no_periodo), "mensagens_antes": len(anterior),
            "pendentes": sum(len(v) for v in pend.values()),
            "agentes_com_pendente": sum(1 for v in pend.values() if v),
            "atrasados": len(atrasados), "revisao": len(revisao),
            "revisao_mais_antiga": min((t["ts"] for t in revisao if t["ts"]), default=None),
            "tempo_resposta": _tempo_resposta(msgs, desde),
        },
        "agentes": [dict(a, pendentes=len(pend.get(a["agente"], []))) for a in agentes],
        "arestas": [{"de": d, "para": p, "n": n} for (d, p), n in sorted(arestas.items())],
        "tarefas": [t for t in tar if t["estado"] not in ("concluido", "aprovado", "rejeitado")
                    or (_ts(t["fechada_em"]) or agora) >= desde],
        "linha_do_tempo": list(reversed(no_periodo))[:200],
        "notas": notas(raiz, msgs),
        "alertas": ping_pong(no_periodo, limites.get("ping_pong_max") or 12, limites.get("ping_pong_janela_min") or 10),
    }
