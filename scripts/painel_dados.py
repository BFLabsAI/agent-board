"""
agent-board: os dados derivados do log que a API do painel v2 serve (docs/referencia/painel-api.md).

Funções puras sobre as mensagens e o cadastro: não leem arquivo, não perguntam ao Orca e não escrevem.
"""
import datetime
import re

import painel_estado
from base import eh_maestri, papel_do_nome
from painel_estado import TIPOS_TAREFA, _ts
from politica import ids_de

ABERTAS = ("aberto", "em_andamento", "atrasado")
FECHADAS = ("concluido", "aprovado", "rejeitado")
DIAS_HEATMAP = 371
ORDEM_PAPEL = {"master": 0, "manager": 1, "researcher": 2}
RESULTADOS = ("aprovado", "rejeitado", "concluido", "em_aberto", "atrasado")
ROTULOS = {"aprovado": "Aprovado", "rejeitado": "Rejeitado", "concluido": "Concluído", "em_aberto": "Em aberto",
           "atrasado": "Atrasado", "revisao": "Revisão"}


def publica(msg):
    """A mensagem como a API entrega: a linha do log sem o hash da cadeia."""
    return {k: v for k, v in msg.items() if k != "prev"}


def _epoca(msg):
    t = _ts(msg.get("ts"))
    try:
        return t.timestamp() if t else 0.0
    except (OverflowError, OSError, ValueError):
        return 0.0


def _dia(msg, tz):
    t = _ts(msg.get("ts"))
    return t.astimezone(tz).date() if t else None


def percentil(valores, p):
    """Percentil `p` (0 a 1) com interpolação linear, em 1 casa. None se não há valores."""
    if not valores:
        return None
    v = sorted(valores)
    pos = (len(v) - 1) * p
    i = int(pos)
    j = min(i + 1, len(v) - 1)
    return round(v[i] + (v[j] - v[i]) * (pos - i), 1)


def inteiro(valor, padrao, minimo=1, maximo=1000):
    try:
        return max(minimo, min(maximo, int(valor)))
    except (TypeError, ValueError):
        return padrao


def tempos_resposta(msgs):
    """[(quem respondeu, minutos, ts da resposta)]: a primeira resposta ou andamento de quem recebeu a mensagem."""
    origem = {m.get("id"): m for m in msgs}
    vistos, out = set(), []
    for m in msgs:
        if m.get("tipo") not in ("resposta", "andamento"):
            continue
        t = _ts(m.get("ts"))
        for cid in ids_de(m.get("responde_a")):
            o = origem.get(cid)
            to = _ts(o.get("ts")) if o else None
            if cid in vistos or t is None or to is None or o.get("para") != m.get("de"):
                continue
            vistos.add(cid)
            out.append((m.get("de"), max(0.0, (t - to).total_seconds() / 60), t))
    return out


# ---------------------------------------------------------------------------
# Agentes
# ---------------------------------------------------------------------------
def harness_de(handle, nome, terminal):
    if eh_maestri(handle):
        return "maestri"
    m = re.search(r"-(cc|omp)$", nome or "")
    if m:
        return m.group(1)
    ident = (terminal or {}).get("agentIdentity")
    return {"claude": "cc", "omp": "omp", "pi": "omp"}.get(ident)


SEGREDOS = re.compile(
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)"  # chave privada PEM
    r"|\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}"                                           # OpenAI/Anthropic/Stripe
    r"|\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}"     # GitHub
    r"|\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|\bAIza[0-9A-Za-z_-]{30,}"                        # AWS, Google
    r"|\bxox[abposr]-[A-Za-z0-9-]{10,}|\bnpm_[A-Za-z0-9]{30,}"                        # Slack, npm
    r"|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"                  # JWT
    r"|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}"
    r"|(?i:\b[\w.-]*(?:password|passwd|senha|secret|token|api[_-]?key|apikey|authorization)[\w.-]*)\s*[=:]\s*(?:(?:Bearer|Basic)\s+)?\S+",
    re.S)


def mascarar(texto):
    """Troca por [oculto] o que parece segredo (token, chave, senha, Bearer) no texto do terminal."""
    return SEGREDOS.sub("[oculto]", texto)


def tela_de(preview, linhas=12):
    """As últimas linhas não vazias do preview do Orca, com segredos mascarados (o terminal é entrada não confiável)."""
    ls = [l.rstrip()[:300] for l in mascarar(str(preview or "")).splitlines() if l.strip()]
    return "\n".join(ls[-linhas:]) or None


def _iso_ms(ms, tz):
    if not isinstance(ms, (int, float)):
        return None
    return datetime.datetime.fromtimestamp(ms / 1000, tz).isoformat(timespec="seconds")


def tarefa_atual(agente, tars):
    """A tarefa aberta mais recente em que `agente` é o destinatário."""
    abertas = [t for t in tars if t["para"] == agente and t["estado"] not in FECHADAS]
    if not abertas:
        return None
    t = max(abertas, key=lambda x: _epoca(x))
    return {"id": t["id"], "assunto": t["assunto"], "estado": t["estado"]}


def _stats(agente, msgs, tars, agora, tempos):
    tz = agora.tzinfo
    hoje = agora.date()
    dias = [hoje - datetime.timedelta(days=13 - i) for i in range(14)]
    por_dia = dict.fromkeys(dias, 0)
    corte = agora - datetime.timedelta(days=7)
    enviadas = entregas = 0
    for m in msgs:
        if m.get("de") != agente or m.get("tipo") == "nota":
            continue
        d = _dia(m, tz)
        if d in por_dia:
            por_dia[d] += 1
        t = _ts(m.get("ts"))
        if t and t >= corte:
            enviadas += 1
            entregas += m.get("tipo") == "entrega"
    fechadas = [t for t in tars if t["tipo"] == "entrega" and t["de"] == agente and t["fechada_em"]
                and (_ts(t["fechada_em"]) or corte) >= corte]
    return {"atividade_14d": [por_dia[d] for d in dias], "mensagens_7d": enviadas, "entregas_7d": entregas,
            "aprovadas_7d": sum(1 for t in fechadas if t["estado"] == "aprovado"),
            "rejeitadas_7d": sum(1 for t in fechadas if t["estado"] == "rejeitado"),
            "tempo_resposta_p50_min": percentil([mi for q, mi, t in tempos if q == agente and t >= corte], 0.5)}


def agentes(projeto, paineis, msgs, terminais, agora, tars=None):
    """Agente[] do contrato. `terminais`: {handle: terminal} do Orca, ou None se o orca não respondeu."""
    tars = tars if tars is not None else painel_estado.tarefas(msgs, agora)
    cadastro = sorted(({"handle": h, **p} for h, p in paineis.items() if p.get("projeto") == projeto),
                      key=lambda a: (ORDEM_PAPEL.get(a.get("papel"), 3), a["agente"]))
    pend = painel_estado.pendentes(msgs, cadastro)
    tempos = tempos_resposta(msgs)
    agora_ms = agora.timestamp() * 1000
    out = []
    for a in cadastro:
        nome, h = a["agente"], a["handle"]
        term = (terminais or {}).get(h)
        n_pend = len(pend.get(nome, []))
        wt = a.get("worktree")
        out.append({
            "agente": nome, "papel": a.get("papel") or papel_do_nome(nome), "handle": h,
            "harness": harness_de(h, nome, term), "worktree": wt, "branch": a.get("branch") or (f"ab/{nome}" if wt else None),
            "status": painel_estado.status_agente(term, n_pend, agora_ms, terminais is not None, eh_maestri(h)),
            "tela": tela_de(term["preview"]) if term else None,
            "ultima_saida": _iso_ms(term.get("lastOutputAt"), agora.tzinfo) if term else None,
            "pendentes": n_pend, "tarefa_atual": tarefa_atual(nome, tars),
            "stats": _stats(nome, msgs, tars, agora, tempos),
        })
    return out


# ---------------------------------------------------------------------------
# Tarefas e mensagens
# ---------------------------------------------------------------------------
def tarefas_do_periodo(tars, periodo, agora):
    """Todas as abertas, mais as fechadas dentro do período; mais recentes primeiro."""
    desde = painel_estado.inicio_do_periodo(periodo, agora)
    sel = [t for t in tars if t["estado"] not in FECHADAS or (_ts(t["fechada_em"]) or agora) >= desde]
    return sorted(sel, key=_epoca, reverse=True)


def _casa_texto(q, *campos):
    q = q.lower()
    return any(q in str(c).lower() for c in campos if c is not None)


def mensagens(msgs, antes=None, limite=100, agente=None, tipo=None, q=None):
    """({mensagens, mais}) mais recentes primeiro, paginado por `antes` (ts exclusivo)."""
    corte = _ts(antes) if antes else None
    sel = []
    for m in msgs:
        if corte and (_ts(m.get("ts")) or corte) >= corte:
            continue
        if agente and agente not in (m.get("de"), m.get("para")):
            continue
        if tipo and m.get("tipo") != tipo:
            continue
        if q and not _casa_texto(q, m.get("assunto"), m.get("id"), m.get("de"), m.get("para"), m.get("issues")):
            continue
        sel.append(m)
    sel.sort(key=_epoca, reverse=True)
    return {"mensagens": [publica(m) for m in sel[:limite]], "mais": len(sel) > limite}


# ---------------------------------------------------------------------------
# Conversas
# ---------------------------------------------------------------------------
def threads(msgs):
    """[(raiz, [mensagens da thread em ordem cronológica])]. Thread = raiz + quem responde a ela, direta ou não."""
    uteis = [m for m in msgs if m.get("tipo") != "nota" and m.get("id")]
    por_id = {m["id"]: m for m in uteis}
    ordem = {m["id"]: i for i, m in enumerate(uteis)}
    filhos = {}
    for m in uteis:
        for pid in ids_de(m.get("responde_a")):
            if pid in por_id and pid != m["id"]:
                filhos.setdefault(pid, []).append(m)
    out = []
    for r in uteis:
        if r["tipo"] not in TIPOS_TAREFA or any(p in por_id for p in ids_de(r.get("responde_a"))):
            continue
        vistos, fila = {r["id"]}, [r]
        for atual in fila:  # percorre a árvore uma vez só: custo linear no tamanho da thread
            for f in filhos.get(atual["id"], []):
                if f["id"] not in vistos:
                    vistos.add(f["id"])
                    fila.append(f)
        out.append((r, sorted(fila, key=lambda m: (_epoca(m), ordem[m["id"]]))))
    return out


def _conversa(raiz, thread, tars_por_id):
    ini, fim = _ts(thread[0].get("ts")), _ts(thread[-1].get("ts"))
    issues = sorted({i for m in thread for i in (m.get("issues") or []) if isinstance(i, int)})
    part = []
    for m in thread:
        for p in (m.get("de"), m.get("para")):
            if p and p not in part:
                part.append(p)
    branches = [m["branch"] for m in thread if m.get("branch")]
    # a entrega mais recente da thread manda no estado (aprovada/rejeitada/aguardando revisão);
    # sem entrega, vale o estado do pedido raiz
    entregas = [tars_por_id[m["id"]] for m in thread if m["id"] != raiz["id"] and m["id"] in tars_por_id
                and m.get("tipo") == "entrega"]
    estado = (entregas[-1] if entregas else tars_por_id.get(raiz["id"]) or {}).get("estado")
    return {"id": raiz["id"], "assunto": raiz.get("assunto") or "", "tipo": raiz["tipo"], "de": raiz.get("de"),
            "para": raiz.get("para"), "estado": estado,
            "inicio": thread[0].get("ts"), "fim": thread[-1].get("ts"),
            "duracao_min": round(max(0.0, (fim - ini).total_seconds() / 60), 1) if ini and fim else 0.0,
            "n_mensagens": len(thread), "participantes": part, "issues": issues,
            "branch": branches[-1] if branches else None}


def conversas(msgs, agora, tars=None):
    """[(Conversa, [mensagens])] de todas as threads, mais recentes (fim) primeiro."""
    tars = tars if tars is not None else painel_estado.tarefas(msgs, agora)
    por_id = {t["id"]: t for t in tars}
    out = [(_conversa(r, th, por_id), th) for r, th in threads(msgs)]
    out.sort(key=lambda c: _epoca({"ts": c[0]["fim"]}), reverse=True)
    return out


def filtrar_conversas(convs, periodo, agora, limite=100, agente=None, estado=None, q=None):
    desde = painel_estado.inicio_do_periodo(periodo, agora)
    out = []
    for c, _ in convs:
        if (_ts(c["fim"]) or agora) < desde:
            continue
        if agente and agente not in c["participantes"]:
            continue
        if estado and c["estado"] != estado:
            continue
        if q and not _casa_texto(q, c["assunto"], c["id"], *[f"#{i}" for i in c["issues"]]):
            continue
        out.append(c)
    return out[:limite]


def conversa_por_id(convs, cid):
    for c, th in convs:
        if c["id"] == cid:
            return {"conversa": c, "mensagens": [publica(m) for m in th]}
    return None


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------
def analytics(msgs, agora):
    """Heatmap de 371 dias e os agregados de 30 dias, sobre o log ativo + arquivo."""
    tz = agora.tzinfo
    hoje = agora.date()
    reais = [m for m in msgs if m.get("tipo") != "nota"]
    heat = dict.fromkeys((hoje - datetime.timedelta(days=DIAS_HEATMAP - 1 - i) for i in range(DIAS_HEATMAP)), 0)
    dias30 = dict.fromkeys((hoje - datetime.timedelta(days=29 - i) for i in range(30)), None)
    for d in dias30:
        dias30[d] = {"dia": d.isoformat(), "mensagens": 0, "entregas": 0, "aprovadas": 0, "rejeitadas": 0}
    horas, tipos, ag = [0] * 24, {}, {}
    corte = agora - datetime.timedelta(days=30)
    recentes = []
    for m in reais:
        d = _dia(m, tz)
        if d in heat:
            heat[d] += 1
        t = _ts(m.get("ts"))
        if d not in dias30 or t is None or t < corte:
            continue
        recentes.append(m)
        linha = dias30[d]
        linha["mensagens"] += 1
        linha["entregas"] += m.get("tipo") == "entrega"
        linha["aprovadas"] += m.get("veredito") == "aprovado"
        linha["rejeitadas"] += m.get("veredito") == "rejeitado"
        horas[t.astimezone(tz).hour] += 1
        tipos[m.get("tipo")] = tipos.get(m.get("tipo"), 0) + 1
        for nome, campo in ((m.get("de"), "enviadas"), (m.get("para"), "recebidas")):
            if nome:
                a = ag.setdefault(nome, dict.fromkeys(("enviadas", "recebidas", "entregas", "aprovadas", "rejeitadas"), 0))
                a[campo] += 1
        if m.get("de") and m.get("tipo") == "entrega":
            ag[m["de"]]["entregas"] += 1
        if m.get("para") and m.get("veredito") in ("aprovado", "rejeitado"):
            ag[m["para"]]["aprovadas" if m["veredito"] == "aprovado" else "rejeitadas"] += 1
    tempos = [(q, mi) for q, mi, t in tempos_resposta(reais) if t >= corte]
    por_agente = [dict(agente=nome, **a,
                       p50_min=percentil([mi for q, mi in tempos if q == nome], 0.5),
                       p90_min=percentil([mi for q, mi in tempos if q == nome], 0.9))
                  for nome, a in ag.items()]
    por_agente.sort(key=lambda a: (-a["enviadas"], a["agente"]))
    return {"heatmap": [{"dia": d.isoformat(), "n": n} for d, n in heat.items()],
            "ultimos_30d": list(dias30.values()), "horas": horas, "por_agente": por_agente,
            "tipos": [{"tipo": t, "n": n} for t, n in sorted(tipos.items(), key=lambda x: (-x[1], str(x[0])))],
            "alertas": painel_estado.ping_pong(recentes)}


# ---------------------------------------------------------------------------
# Workflows
# ---------------------------------------------------------------------------
def _resultado(estado_entrega, estado_raiz):
    """Onde a conversa termina: o veredito da entrega ou, sem entrega, o estado do pedido."""
    est = estado_entrega or estado_raiz
    if est in ("aprovado", "rejeitado", "concluido", "atrasado"):
        return est
    return "em_aberto"


def sequencia_de(thread):
    """Tipos da conversa em ordem; repetições seguidas viram uma (ex.: andamento, andamento)."""
    seq = []
    for m in thread:
        t = m.get("tipo") or "?"
        if t == "resposta" and m.get("veredito"):
            t = "resposta:" + m["veredito"]
        if not seq or seq[-1] != t:
            seq.append(t)
    return seq


def workflows(msgs, convs, periodo, agora, papeis, estados):
    """Grafo em colunas, comunicação por par, fluxos mais comuns e KPIs. `papeis`: {agente: papel}; `estados`: {id da tarefa: Tarefa}."""
    desde = painel_estado.inicio_do_periodo(periodo, agora)
    no_periodo = [m for m in msgs if m.get("tipo") != "nota" and (_ts(m.get("ts")) or agora) >= desde]
    sel = [(c, th) for c, th in convs if (_ts(c["fim"]) or agora) >= desde]
    arestas, colunas, rotulos = {}, {}, {}

    def aresta(a, b):
        arestas[(a, b)] = arestas.get((a, b), 0) + 1

    def agente(nome, padrao):
        colunas.setdefault(nome, papeis.get(nome) or papel_do_nome(nome) or padrao)

    for m in no_periodo:
        if m.get("tipo") == "pedido" and m.get("de") and m.get("para"):
            agente(m["de"], "master")
            agente(m["para"], "manager")
            aresta(m["de"], m["para"])
    aprov = rej = 0
    ate_entrega, tamanhos, fluxos = [], [], {}
    for c, th in sel:
        ex = (c["para"] if c["tipo"] == "pedido" else c["de"]) or "desconhecido"  # log torto pode não ter de/para
        agente(ex, "manager")
        entregas = [m for m in th if m.get("tipo") == "entrega"]
        est_ent = (estados.get(entregas[-1]["id"]) or {}).get("estado") if entregas else None
        res = _resultado(est_ent, c["estado"])
        aprov += est_ent == "aprovado"
        rej += est_ent == "rejeitado"
        for i in c["issues"]:
            colunas[f"#{i}"], rotulos[f"#{i}"] = "issue", f"#{i}"
            aresta(ex, f"#{i}")
            aresta(f"#{i}", "revisao" if entregas else res)
        if entregas:
            if not c["issues"]:
                aresta(ex, "revisao")
            aresta("revisao", res)
        elif not c["issues"]:
            aresta(ex, res)
        if entregas:
            ini, ent = _ts(th[0].get("ts")), _ts(entregas[0].get("ts"))
            if ini and ent:
                ate_entrega.append(max(0.0, (ent - ini).total_seconds() / 60))
        tamanhos.append(c["n_mensagens"])
        seq = tuple(sequencia_de(th))
        fluxos[seq] = fluxos.get(seq, 0) + 1
    entrada, saida = {}, {}
    for (a, b), n in arestas.items():
        saida[a] = saida.get(a, 0) + n
        entrada[b] = entrada.get(b, 0) + n
    ids = set(entrada) | set(saida)
    for no in ids:
        if no in RESULTADOS:
            colunas[no], rotulos[no] = "resultado", ROTULOS[no]
        elif no == "revisao":
            colunas[no], rotulos[no] = "revisao", ROTULOS[no]
    ordem_col = ("master", "manager", "researcher", "issue", "revisao", "resultado")
    nos = sorted(ids, key=lambda i: (ordem_col.index(colunas[i]) if colunas.get(i) in ordem_col else 1, i))
    comunicacao = {}
    for m in no_periodo:
        if m.get("de") and m.get("para"):
            comunicacao[(m["de"], m["para"])] = comunicacao.get((m["de"], m["para"]), 0) + 1
    top = sorted(fluxos.items(), key=lambda x: (-x[1], x[0]))[:10]
    return {
        "nos": [{"id": i, "coluna": colunas.get(i) if colunas.get(i) in ordem_col else "manager",
                 "rotulo": rotulos.get(i, i), "n": max(entrada.get(i, 0), saida.get(i, 0))} for i in nos],
        "arestas": [{"de": a, "para": b, "n": n} for (a, b), n in sorted(arestas.items())],
        "comunicacao": [{"de": a, "para": b, "n": n} for (a, b), n in sorted(comunicacao.items(), key=lambda x: (-x[1], x[0]))],
        "fluxos": [{"sequencia": list(s), "n": n} for s, n in top],
        "kpis": {"conversas": len(sel), "taxa_aprovacao": round(aprov / (aprov + rej), 3) if aprov + rej else None,
                 "tempo_ate_entrega_p50_min": percentil(ate_entrega, 0.5),
                 "fluxo_mais_comum": " > ".join(top[0][0]) if top else None,
                 "msgs_por_conversa": round(sum(tamanhos) / len(tamanhos), 1) if tamanhos else None},
    }

