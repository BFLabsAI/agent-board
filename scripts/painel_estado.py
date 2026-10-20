"""
agent-board: o estado do projeto que o painel web mostra (GET /api/estado).

Função pura sobre o log, o cadastro e as notas: não escreve nada. Os estados
de tarefa seguem docs/userguide/painel.md.
"""
import datetime
import glob
import json
import os

import cmd_tarefas
import politica
import registro
from base import LOG_REL, VERSAO, eh_maestri

TIPOS_TAREFA = ("pedido", "entrega")
PERIODOS = {"hoje": None, "24h": datetime.timedelta(hours=24), "7d": datetime.timedelta(days=7)}


ANO_MIN, ANO_MAX = 2000, 2100


def _ts(texto):
    """ISO -> datetime com fuso (sem fuso = hora local); None se ilegível ou fora de 2000-2100.

    Sempre com fuso: comparar naive com aware levanta TypeError, e datas absurdas estouram no astimezone/timestamp.
    """
    try:
        t = datetime.datetime.fromisoformat(texto)
        if not ANO_MIN <= t.year <= ANO_MAX:
            return None
        return t if t.tzinfo else t.astimezone()
    except (TypeError, ValueError, OverflowError, OSError):
        return None


# --- Entrada não confiável: o log vem de agentes de IA (e de merges) ---------------------------------
MAX_TEXTO = 2000       # tamanho máximo de qualquer texto que a API devolve
MAX_ID = 200
MAX_ISSUES = 50
TEXTOS = ("ts", "de", "para", "tipo", "assunto", "branch", "prazo", "modo", "veredito", "tema", "titulo", "trecho",
          "responde_a", "andamento", "id")


def _texto(valor):
    return valor[:MAX_TEXTO] if isinstance(valor, str) else str(valor)[:MAX_TEXTO]


def sanear(linha):
    """A mensagem com tipos previsíveis e tamanho limitado, ou None se não serve (sem id texto, não é objeto).

    Os campos de texto viram str (ou None), `issues` vira lista de inteiros, `responde_a` vira texto, valores
    aninhados e números não finitos saem. Assim uma linha torta no log não derruba a API nem o SSE.
    """
    if not isinstance(linha, dict) or "status" in linha:
        return None
    cid = linha.get("id")
    if not isinstance(cid, str) or not cid or len(cid) > MAX_ID:
        return None
    out = {}
    for k, v in linha.items():
        if not isinstance(k, str):
            continue
        k = k[:60]
        if k == "issues":
            v = [i for i in v if isinstance(i, int) and not isinstance(i, bool) and abs(i) < 2 ** 53][:MAX_ISSUES] \
                if isinstance(v, list) else []
        elif k == "responde_a" and isinstance(v, list):
            v = ", ".join(x for x in v if isinstance(x, str))
        elif isinstance(v, (dict, list)):
            continue
        elif isinstance(v, float) and (v != v or v in (float("inf"), float("-inf"))):
            v = None
        elif k in TEXTOS and v is not None:
            v = _texto(v)
        elif isinstance(v, str):
            v = v[:MAX_TEXTO]
        out[k] = v
    out.setdefault("tipo", None)  # o código do painel indexa m["tipo"]
    for k in ("de", "para", "assunto"):  # o contrato da API (e a SPA) tratam como texto, nunca null
        out[k] = out.get(k) or ""
    out["ts"] = out.get("ts") or ""  # politica.pendentes compara o ts como texto
    if out.get("prazo") is not None and _ts(out["prazo"]) is None:
        out["prazo"] = None  # prazo ilegível não vale (e datas absurdas estouram a conta do atraso)
    return out


def _linhas(caminho):
    """(texto, objeto JSON) de cada linha legível. Não escreve nada: o registro.ler_log anota cada linha ruim em
    avisos.log a cada leitura, e o painel lê o log a cada requisição e a cada tique do SSE."""
    out = []
    try:
        with open(caminho, encoding="utf-8", errors="replace") as f:
            for texto in f:
                if texto.strip():
                    try:
                        out.append((texto, json.loads(texto)))
                    except (ValueError, RecursionError):
                        pass
    except OSError:
        pass
    return out


def _mensagens(pares):
    """Só as saneadas; uma linha de status `falhou` tira a mensagem (como registro.ler_log)."""
    pares = [(t, d) for t, d in pares if isinstance(d, dict) and isinstance(d.get("id", ""), str)]
    return [s for s in map(sanear, registro._mensagens(pares)) if s]


def ler_log(raiz):
    """registro.ler_log, mas à prova de linha torta: só mensagens saneadas (ver `sanear`) e sem escrever."""
    return _mensagens(_linhas(os.path.join(raiz, LOG_REL)))


def verificar(raiz):
    """registro.verificar sem estourar: linha torta vira um problema da cadeia, e o texto dos problemas é limitado."""
    try:
        r = registro.verificar(raiz)
    except (TypeError, AttributeError, ValueError, RecursionError):
        return {"linhas": 0, "problemas": ["log com linhas fora do formato (não são objetos JSON)"], "bifurcacoes": 0}
    return dict(r, problemas=[str(x)[:300] for x in r["problemas"][:50]])


def ler_tudo(raiz):
    """registro.ler_tudo (arquivo morto + log ativo) com o mesmo saneamento."""
    pares = []
    for a in registro.arquivos(raiz) + [os.path.join(raiz, LOG_REL)]:
        pares += _linhas(a)
    return _mensagens(pares)


def _ids(valor):
    return [x.strip() for x in str(valor or "").split(",") if x.strip()]


def inicio_do_periodo(periodo, agora):
    if periodo == "hoje":
        return agora.replace(hour=0, minute=0, second=0, microsecond=0)
    return agora - PERIODOS.get(periodo, PERIODOS["24h"])


def tarefas(msgs, agora):
    """Uma tarefa por pedido/entrega. O estado é o mesmo do painel.py tarefas (cmd_tarefas.estado_de)."""
    fechados, andam = politica.respostas(msgs), politica.andamentos(msgs)
    out = []
    for m in msgs:
        if m.get("tipo") not in TIPOS_TAREFA:
            continue
        r, a = fechados.get(m["id"]), andam.get(m["id"])
        out.append({"id": m["id"], "ts": m.get("ts"), "tipo": m["tipo"], "de": m.get("de"), "para": m.get("para"),
                    "assunto": m.get("assunto"), "estado": cmd_tarefas.estado_de(m, fechados, andam, agora),
                    "prazo": m.get("prazo"), "issues": m.get("issues") or [], "branch": m.get("branch"),
                    "andamento": (a or {}).get("assunto"), "andamento_ts": (a or {}).get("ts"),
                    "fechada_em": (r or {}).get("ts")})
    return out


SPINNERS = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏◐◓◑◒✻✽✶·"  # o ✳ do Claude parado fica de fora
PEDE_ACAO = ("Do you want", "[y/n]", "Allow", "❯ 1.")
SAIDA_RECENTE_MS = 10000


def pede_acao(tela):
    """A tela (últimas linhas do terminal) pede confirmação humana."""
    fim = "\n".join([l for l in str(tela or "").splitlines() if l.strip()][-15:])
    return any(p in fim for p in PEDE_ACAO) or "permission" in fim.lower()


def status_agente(terminal, pendentes, agora_ms, orca_ok=True, maestri=False, subs_rodando=0):
    """Status do agente (heurística do contrato, docs/referencia/painel-api.md).

    `terminal`: dict do Orca (title, preview, lastOutputAt) ou None se o handle não está aberto.
    `orca_ok`: False quando o orca não respondeu. Maestri não lista terminais: desconhecido.
    `subs_rodando`: sub-agents dele em execução; com o terminal aberto, conta como trabalhando
    (o pai fica parado na tela esperando o sub-agent).
    """
    if maestri or not orca_ok:
        return "desconhecido"
    if terminal is None:
        return "offline"
    if pede_acao(terminal.get("preview")):
        return "esperando"
    titulo = terminal.get("title") or ""
    ultima = terminal.get("lastOutputAt")
    if titulo[:1] and titulo[0] in SPINNERS:
        return "trabalhando"
    # Claude Code (✳) e OMP (π) dizem no título se estão trabalhando; a saída recente não conta,
    # porque um terminal ocioso redesenha a barra de status de tempos em tempos e o status piscava.
    titulo_fala = titulo[:1] == "✳" or "π" in titulo[:6]
    if not titulo_fala and isinstance(ultima, (int, float)) and 0 <= agora_ms - ultima < SAIDA_RECENTE_MS:
        return "trabalhando"
    if subs_rodando > 0:
        return "trabalhando"
    return "pendente" if pendentes > 0 else "parado"


def pendentes(msgs, agentes):
    """Mesma regra do Stop (politica.pendentes), a partir do cadastro de cada agente."""
    return {ag["agente"]: [m["id"] for m in politica.pendentes(ag["agente"], msgs, ag.get("cadastrado_em") or "")]
            for ag in agentes}


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
            "p50": round(minutos[(len(minutos) - 1) // 2], 1),
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


def _trechos(raiz, tema):
    """{id da nota: primeira linha de texto} do arquivo do tema (cabeçalho do painel.py nota)."""
    caminho = os.path.join(raiz, "docs", "agent-board", "notas", f"{tema}.md")
    out, atual = {}, None
    try:
        with open(caminho, errors="replace") as f:
            for linha in f:
                linha = linha.strip()
                if linha.startswith("## ") and " · n-" in linha:
                    atual = linha.rsplit(" · ", 1)[-1]
                elif linha and atual and atual not in out and not linha.startswith("#"):
                    out[atual] = linha[:240]
    except (FileNotFoundError, TypeError):
        pass
    return out


def notas(raiz, msgs, limite=12):
    """Notas do log (tipo nota) e arquivos em docs/agent-board/notas/, mais recentes primeiro."""
    do_log = [m for m in msgs if m.get("tipo") == "nota"]
    trechos = {}
    for tema in {m.get("tema") for m in do_log if m.get("tema")}:
        trechos.update(_trechos(raiz, tema))
    out = [{"tema": m.get("tema"), "de": m.get("de"), "ts": m.get("ts"), "decisao": bool(m.get("decisao")),
            "titulo": m.get("assunto") or m.get("titulo") or ("Decisão" if m.get("decisao") else "Nota"),
            "trecho": m.get("trecho") or trechos.get(m.get("id"))}
           for m in do_log]
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
    msgs = ler_log(raiz)
    no_periodo = [m for m in msgs if (_ts(m.get("ts")) or agora) >= desde and m.get("tipo") != "nota"]
    anterior = [m for m in msgs if desde - duracao <= (_ts(m.get("ts")) or agora) < desde and m.get("tipo") != "nota"]

    agentes = sorted(({"handle": h, **p} for h, p in paineis.items() if p.get("projeto") == projeto),
                     key=lambda a: ({"master": 0, "manager": 1}.get(a.get("papel"), 2), a["agente"]))
    for a in agentes:
        # o Maestri não lista terminais por ID: sem como saber, fica None (nem aberto nem fechado)
        a["aberto"] = None if abertos is None or eh_maestri(a["handle"]) else a["handle"] in abertos
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
    cadeia = cadeia if cadeia is not None else verificar(raiz)
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
