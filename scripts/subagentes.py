"""
agent-board: coletor de sub-agents (ADR 0011, issue #21).

O hook_core chama coletar(ev) depois de responder ao harness. Cada evento vira uma linha JSON em
$AGENT_BOARD_HOME/subagentes/<projeto>/AAAA-MM-DD.jsonl (contrato em docs/referencia/painel-api.md).
O hook roda no terminal do PAI: o handle dele (base.meu_handle) acha projeto e nome no cadastro.
Terminal sem cadastro não grava nada.

Nunca levanta exceção, nunca bloqueia e nunca muda a decisão do hook: erro de I/O é engolido.
"""
import datetime
import json
import os
import re

import base

RETENCAO_DIAS = 14
LIMITE_DESCRICAO = 120
LIMITE_RESUMO = 160
TOOLS_AGENT = {"Agent", "Task"}  # Task é o nome antigo da ferramenta Agent
TOOLS_ATIVIDADE = {"bash", "edit", "write", "multiedit", "notebookedit"}
ERRO_RE = re.compile(r"^\s*(?:error|erro|failed|falha)\b", re.I)
STATUS_ERRO = {"error", "errored", "failed", "failure", "erro", "falhou"}


def curto(texto, limite):
    """Texto de uma linha só, com segredos mascarados, em no máximo `limite` caracteres."""
    t = " ".join(base.mascarar(str(texto or "")).split())
    return t if len(t) <= limite else t[:limite - 1] + "…"


def indica_erro(resposta):
    """Heurística: o tool_response do Agent indica erro?

    Objeto: is_error/isError verdadeiro, "error" preenchido ou status de falha. Texto: começa com
    Error/Erro/Failed. Qualquer outra coisa conta como sucesso (a falha dura chega como PostToolUseFailure).
    """
    if isinstance(resposta, dict):
        if resposta.get("is_error") or resposta.get("isError") or resposta.get("error"):
            return True
        return str(resposta.get("status") or "").lower() in STATUS_ERRO
    if isinstance(resposta, str):
        return bool(ERRO_RE.match(resposta))
    return False


def eh_evento_de_sub(ev):
    """Evento que só serve à coleta: o hook responde {} sem passar pela política."""
    nativo = ev["native_event"]
    if nativo in ("SubagentStart", "SubagentStop"):
        return True
    return nativo in ("PreToolUse", "PostToolUse", "PostToolUseFailure") and ev["tool_name"] in TOOLS_AGENT


def linha_do_evento(ev):
    """Dict do evento (sem ts e agente) ou None se o hook não tem o que coletar."""
    raw, nativo = ev["raw"], ev["native_event"]
    entrada = ev["tool_input"]
    sessao = raw.get("session_id")
    if nativo == "SubagentStart":
        return {"ev": "inicio", "sessao": sessao, "id": raw.get("agent_id"), "tipo": raw.get("agent_type")}
    if nativo == "SubagentStop":
        return {"ev": "fim", "sessao": sessao, "id": raw.get("agent_id"), "tipo": raw.get("agent_type")}
    if ev["tool_name"] in TOOLS_AGENT:
        if raw.get("agent_id"):  # sub-agent chamando Agent: o contrato só liga o que o pai lança
            return None
        tipo = entrada.get("subagent_type")
        if nativo == "PreToolUse":
            return {"ev": "spawn", "sessao": sessao, "id": None, "tipo": tipo,
                    "descricao": curto(entrada.get("description"), LIMITE_DESCRICAO),
                    "fundo": bool(entrada.get("run_in_background"))}
        ok = nativo != "PostToolUseFailure" and not indica_erro(raw.get("tool_response"))
        return {"ev": "retorno", "sessao": sessao, "id": None, "tipo": tipo, "ok": ok}
    if nativo == "PreToolUse" and raw.get("agent_id") and (ev["tool_name"] or "").lower() in TOOLS_ATIVIDADE:
        alvo = ev["command"] if ev["tool"] == "shell" else ev["file_path"]
        return {"ev": "atividade", "sessao": sessao, "id": raw.get("agent_id"), "tipo": raw.get("agent_type"),
                "ferramenta": ev["tool_name"], "resumo": curto(alvo, LIMITE_RESUMO)}
    return None


def pasta_segura(projeto):
    return re.sub(r"[^\w.-]", "_", str(projeto)).lstrip(".") or "_"


def anexar(caminho, linha):
    """Uma linha por evento, só append, arquivo 600 (um write só: atômico para linhas pequenas)."""
    os.makedirs(os.path.dirname(caminho), mode=0o700, exist_ok=True)
    fd = os.open(caminho, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
    try:
        os.write(fd, (linha + "\n").encode("utf-8"))
    finally:
        os.close(fd)


def limpar_velhos(raiz, hoje):
    """Apaga arquivos de dia com mais de RETENCAO_DIAS, no máximo 1 vez por dia (marcador .limpeza)."""
    marcador = os.path.join(raiz, ".limpeza")
    try:
        with open(marcador) as f:
            if f.read().strip() == hoje.isoformat():
                return
    except OSError:
        pass
    corte = (hoje - datetime.timedelta(days=RETENCAO_DIAS)).isoformat()
    for projeto in os.listdir(raiz):
        pasta = os.path.join(raiz, projeto)
        if not os.path.isdir(pasta):
            continue
        for nome in os.listdir(pasta):
            if re.fullmatch(r"\d{4}-\d{2}-\d{2}\.jsonl", nome) and nome[:10] < corte:
                os.remove(os.path.join(pasta, nome))
    with open(marcador, "w") as f:
        f.write(hoje.isoformat())


def coletar(ev):
    """Grava o evento de sub-agent, se houver e se o terminal estiver cadastrado. Nunca levanta exceção."""
    try:
        linha = linha_do_evento(ev)
        if linha is None:
            return
        painel = base.carregar_paineis().get(base.meu_handle())
        if not painel or not painel.get("projeto") or not painel.get("agente"):
            return
        agora = base.agora()
        completa = {"ts": agora.isoformat(timespec="milliseconds"), "agente": painel["agente"]}
        completa.update(linha)
        raiz = os.path.join(base.HOME, "subagentes")
        caminho = os.path.join(raiz, pasta_segura(painel["projeto"]), agora.date().isoformat() + ".jsonl")
        anexar(caminho, json.dumps(completa, ensure_ascii=False))
        limpar_velhos(raiz, agora.date())
    except Exception:  # coletar é acessório: nunca derruba o agente
        pass
