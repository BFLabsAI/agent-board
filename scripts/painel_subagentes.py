"""
agent-board: os sub-agents que o coletor grava em $AGENT_BOARD_HOME/subagentes/<projeto>/AAAA-MM-DD.jsonl (contrato em
docs/referencia/painel-api.md, "Sub-agents"), lidos e ligados para o painel web.

Só leitura: nada aqui escreve (nem em avisos.log). O arquivo é entrada não confiável, como o log: linha torta é
ignorada, texto é limitado e a saída leva a máscara de segredos de `mascarar`. A leitura é
incremental e fica em cache por arquivo, compartilhada por todas as requisições e conexões SSE.
"""
import datetime
import itertools
import json
import os
import re
import threading

import base
from base import mascarar
import painel_estado
from painel_estado import _ts

DIAS_LEITURA = 31                 # arquivos lidos (a retenção do coletor é de 14 dias)
JANELA_SPAWN_S = 60               # o inicio consome um spawn de até 60 s antes
PERDIDO_S = 2 * 3600              # rodando sem nenhum evento há mais de 2 h
MAX_LINHA = 16384
MAX_ARQUIVO = 32 * 1024 * 1024    # arquivo maior que isto: só o final
MAX_TEXTO, MAX_DESCRICAO, MAX_RESUMO = 200, 300, 300
EVENTOS = ("spawn", "inicio", "atividade", "fim", "retorno")
NOME_ARQUIVO = re.compile(r"^(\d{4}-\d{2}-\d{2})\.jsonl$")
STATUS = ("rodando", "concluido", "erro", "perdido")

_lock = threading.RLock()
_geracao = itertools.count(1)
_arquivos = {}   # caminho -> {ino, head, pos, mtime, gen, eventos}
_ligados = {}    # (projeto, assinatura dos arquivos) -> registros ligados


def pasta(projeto):
    """Pasta do projeto, com o mesmo nome que o coletor usa (subagentes.pasta_segura); None se o nome não é texto."""
    if not isinstance(projeto, str):
        return None
    return os.path.join(base.HOME, "subagentes", re.sub(r"[^\w.-]", "_", projeto).lstrip(".") or "_")


# --- leitura incremental ---------------------------------------------------------------------------
def _texto(v, limite):
    return v[:limite] if isinstance(v, str) else None


def sanear(linha):
    """O evento com tipos previsíveis (e `t` como datetime), ou None se não serve."""
    if not isinstance(linha, dict) or linha.get("ev") not in EVENTOS:
        return None
    t = _ts(linha.get("ts")) if isinstance(linha.get("ts"), str) else None
    agente = _texto(linha.get("agente"), MAX_TEXTO)
    if t is None or not agente:
        return None
    return {"ev": linha["ev"], "ts": linha["ts"][:60], "t": t, "agente": agente,
            "id": _texto(linha.get("id"), MAX_TEXTO) or None, "tipo": _texto(linha.get("tipo"), 100) or None,
            "descricao": _texto(linha.get("descricao"), MAX_DESCRICAO), "fundo": linha.get("fundo") is True,
            "ferramenta": _texto(linha.get("ferramenta"), 60) or "", "resumo": _texto(linha.get("resumo"), MAX_RESUMO) or "",
            "ok": linha["ok"] if isinstance(linha.get("ok"), bool) else None}


def _reiniciar():
    return {"ino": None, "head": b"", "cauda": b"", "pos": 0, "mtime": None, "gen": 0, "eventos": []}


def _atualizar(caminho):
    """Lê só o que cresceu no arquivo (e só até a última linha completa). Devolve o cache dele, ou None se sumiu."""
    try:
        st = os.stat(caminho)
    except OSError:
        _arquivos.pop(caminho, None)
        return None
    c = _arquivos.get(caminho)
    if c is not None and (st.st_ino != c["ino"] or st.st_size < c["pos"]
                          or (st.st_size == c["pos"] and st.st_mtime_ns != c["mtime"])):
        c = None  # o arquivo foi trocado ou reescrito
    novo = c is None
    if novo:
        c = _reiniciar()
    if st.st_size == c["pos"] and not novo:
        return c
    try:
        with open(caminho, "rb") as f:
            # mesmo inode e maior não basta (o inode é reaproveitado quando o arquivo é recriado):
            # o começo e o trecho logo antes de onde parei têm que ser os mesmos
            if not novo and c["head"] and f.read(len(c["head"])) != c["head"]:
                c, novo = _reiniciar(), True
            if not novo and c["cauda"]:
                f.seek(c["pos"] - len(c["cauda"]))
                if f.read(len(c["cauda"])) != c["cauda"]:
                    c, novo = _reiniciar(), True
            inicio = c["pos"]
            if novo:
                c["head"] = f.read(64) if f.seek(0) == 0 else b""
                inicio = max(0, st.st_size - MAX_ARQUIVO)
            f.seek(inicio)
            bloco = f.read(max(0, st.st_size - inicio))
    except OSError:
        return c
    fim = bloco.rfind(b"\n") + 1
    linhas = bloco[:fim].split(b"\n")
    if novo and inicio:
        linhas = linhas[1:]  # começo no meio de uma linha
    eventos = c["eventos"]
    for bruto in linhas:
        if not bruto.strip() or len(bruto) > MAX_LINHA:
            continue
        try:
            e = sanear(json.loads(bruto.decode("utf-8", "replace")))
        except (ValueError, RecursionError):
            continue
        if e:
            eventos.append(e)
    cauda = (c["cauda"] + bloco[:fim])[-64:]
    c.update(ino=st.st_ino, pos=inicio + fim, cauda=cauda, mtime=st.st_mtime_ns, gen=next(_geracao))
    _arquivos[caminho] = c
    return c


def arquivos(projeto, agora, dias=DIAS_LEITURA):
    """Caminhos AAAA-MM-DD.jsonl dos últimos `dias` dias (até hoje), do mais antigo ao mais novo."""
    p = pasta(projeto)
    if p is None:
        return []
    corte = (agora.date() - datetime.timedelta(days=dias)).isoformat()
    try:
        nomes = sorted(n for n in os.listdir(p) if NOME_ARQUIVO.match(n) and n[:10] >= corte)
    except OSError:
        return []
    return [os.path.join(p, n) for n in nomes]


def assinatura(projeto, agora, dias=2):
    """(nome, tamanho, mtime) dos arquivos dos últimos `dias` dias: muda quando o coletor grava. Sem ler o conteúdo."""
    p = pasta(projeto)
    out = []
    for i in range(dias):
        nome = (agora.date() - datetime.timedelta(days=i)).isoformat() + ".jsonl"
        try:
            st = os.stat(os.path.join(p, nome)) if p else None
        except OSError:
            st = None
        out.append((nome, st.st_size, st.st_mtime_ns) if st else (nome, 0, 0))
    return tuple(out)


# --- ligação spawn -> sub-agent --------------------------------------------------------------------
def ligar(eventos):
    """Registros de sub-agent a partir dos eventos (qualquer ordem; ordena por ts). Regras do contrato.

    Sem `inicio` (sessão aberta antes dos hooks novos, ou OMP sem evento de início), o sub-agent
    nasce no primeiro evento visto dele (`atividade` ou `fim`)."""
    eventos = sorted(eventos, key=lambda e: e["t"])  # estável: no mesmo instante vale a ordem de gravação
    por_pai = {}
    regs = []
    for e in eventos:
        pai = por_pai.setdefault(e["agente"], {"spawns": [], "subs": {}, "ordem": []})
        ev = e["ev"]
        if ev == "spawn":
            pai["spawns"].append({"e": e, "dono": False})
        elif ev in ("inicio", "atividade", "fim"):
            if e["id"] is None:
                continue
            reg = pai["subs"].get(e["id"])
            if reg is None:
                reg = _novo(pai, e)
                regs.append(reg)
            elif ev == "inicio":
                continue
            if not reg["tipo"] and e["tipo"]:
                reg["tipo"] = e["tipo"]
            if ev == "atividade":
                reg["n"] += 1
                reg["ultima"] = {"ts": e["ts"], "ferramenta": e["ferramenta"], "resumo": e["resumo"]}
            elif ev == "fim" and reg["fim"] is None:
                reg["fim"], reg["fim_ts"] = e["t"], e["ts"]
            reg["ultimo_evento"] = max(reg["ultimo_evento"], e["t"])
        else:  # retorno: fecha o mais antigo do tipo ainda sem ok
            alvo = next((r for r in pai["ordem"] if r["ok"] is None and (e["tipo"] is None or r["tipo"] == e["tipo"])), None)
            if alvo is not None:
                alvo["ok"] = e["ok"] is not False
    return regs


def _novo(pai, e):
    sp = _spawn_para(pai["spawns"], e)
    reg = {"id": e["id"], "agente": e["agente"], "tipo": e["tipo"] or (sp["e"]["tipo"] if sp else None),
           "descricao": sp["e"]["descricao"] if sp else None, "fundo": bool(sp and sp["e"]["fundo"]),
           "inicio": e["t"], "inicio_ts": e["ts"], "fim": None, "fim_ts": None, "ultima": None,
           "n": 0, "ok": None, "ultimo_evento": e["t"],
           # nasceu sem `inicio`: o começo real é desconhecido (sessão anterior aos hooks novos)
           "aprox": e["ev"] != "inicio"}
    if sp:
        sp["dono"] = True
    pai["subs"][e["id"]] = reg
    pai["ordem"].append(reg)
    return reg


def _spawn_para(spawns, inicio):
    """O spawn mais antigo sem dono, de até 60 s antes do inicio: do mesmo tipo e, senão, de qualquer tipo."""
    elegiveis = [s for s in spawns if not s["dono"] and 0 <= (inicio["t"] - s["e"]["t"]).total_seconds() <= JANELA_SPAWN_S]
    return next((s for s in elegiveis if s["e"]["tipo"] == inicio["tipo"]), None) or (elegiveis[0] if elegiveis else None)


def _status(reg, agora):
    if reg["ok"] is False:
        return "erro"
    if reg["fim"] is not None:
        return "concluido"
    return "perdido" if (agora - reg["ultimo_evento"]).total_seconds() > PERDIDO_S else "rodando"


def _tarefa_de(reg, tars_do_pai):
    """A tarefa aberta mais recente do pai (ele é `para`) no momento do inicio."""
    melhor = None
    for t in tars_do_pai:
        ts = _ts(t.get("ts"))
        if ts is None or ts >= reg["inicio"]:
            continue
        fechada = _ts(t.get("fechada_em")) if t.get("fechada_em") else None
        if fechada is not None and fechada <= reg["inicio"]:
            continue
        if melhor is None or ts > melhor[0]:
            melhor = (ts, t)
    return {"id": melhor[1]["id"], "assunto": melhor[1]["assunto"]} if melhor else None


def publico(reg, agora, tars_do_pai=()):
    """O SubAgente do contrato, com a máscara de segredos em descricao e ultima_atividade.resumo."""
    ult = reg["ultima"]
    dur = round(max(0.0, (reg["fim"] - reg["inicio"]).total_seconds()), 1) if reg["fim"] and not reg["aprox"] else None
    desc = reg["descricao"]
    return {"id": reg["id"], "agente": reg["agente"], "nome": nome_de(reg["agente"]), "tipo": reg["tipo"],
            "descricao": mascarar(desc) if desc is not None else None,
            "status": _status(reg, agora), "fundo": reg["fundo"], "inicio": reg["inicio_ts"], "fim": reg["fim_ts"],
            "inicio_aproximado": reg["aprox"], "duracao_s": dur,
            "ultima_atividade": dict(ult, resumo=mascarar(ult["resumo"])) if ult else None,
            "n_atividades": reg["n"], "tarefa": _tarefa_de(reg, tars_do_pai)}


def nome_de(pai):
    """Nome do sub-agent no painel, no padrão dos agentes: subagent-cc ou subagent-omp (harness do pai).
    O coletor só existe no Claude Code e no OMP; pai sem sufixo (o master) é Claude Code."""
    return "subagent-omp" if str(pai or "").endswith("-omp") else "subagent-cc"


def listar(projeto, agora=None, tars=None, dias=DIAS_LEITURA):
    """SubAgente[] dos últimos `dias` dias, mais recentes (inicio) primeiro. Projeto sem coleta: []."""
    agora = agora or datetime.datetime.now().astimezone()
    with _lock:
        caminhos = arquivos(projeto, agora, dias)
        p = pasta(projeto)
        for k in [k for k in _arquivos if p and k.startswith(p + os.sep) and k not in caminhos]:
            del _arquivos[k]
        caches = [c for c in (_atualizar(cam) for cam in caminhos) if c is not None]
        chave = (projeto, tuple(c["gen"] for c in caches))
        regs = _ligados.get(chave)
        if regs is None:
            for k in [k for k in _ligados if k[0] == projeto]:
                del _ligados[k]
            regs = _ligados[chave] = ligar([e for c in caches for e in c["eventos"]])
    por_pai = {}
    for t in tars or []:
        if t.get("para"):
            por_pai.setdefault(t["para"], []).append(t)
    out = [publico(r, agora, por_pai.get(r["agente"], ())) for r in regs]
    out.sort(key=lambda s: (_ts(s["inicio"]) or agora), reverse=True)
    return out


def rodando(subs):
    return sum(1 for s in subs if s["status"] == "rodando")


def filtrar(subs, periodo, agora, limite=200, agente=None, status=None):
    """Rota /api/subagentes: `periodo` filtra pelo inicio, mas os `rodando` entram sempre."""
    desde = painel_estado.inicio_do_periodo(periodo, agora)
    out = []
    for s in subs:
        if s["status"] != "rodando" and (_ts(s["inicio"]) or agora) < desde:
            continue
        if agente and s["agente"] != agente:
            continue
        if status and s["status"] != status:
            continue
        out.append(s)
    return out[:limite]


def anexar_tarefas(tars, subs):
    """Cópia das tarefas com `subagentes: [{id, tipo, descricao, status}]` (os ligados a cada uma)."""
    por_tarefa = {}
    for s in subs:
        if s["tarefa"]:
            por_tarefa.setdefault(s["tarefa"]["id"], []).append(
                {"id": s["id"], "tipo": s["tipo"], "descricao": s["descricao"], "status": s["status"]})
    return [dict(t, subagentes=por_tarefa.get(t["id"], [])) for t in tars]
