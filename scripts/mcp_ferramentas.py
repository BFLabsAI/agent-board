"""
agent-board: ferramentas do servidor MCP (board_send, board_inbox, board_pendentes,
board_historico, board_status).

A regra não mora aqui. board_send monta o mesmo comando `orca orchestration send`
que o agente escreveria e passa por hook_core.decide() com eventos PreToolUse e
PostToolUse sintéticos, como o hook faria. Precisa ser assim porque ferramenta MCP
não passa pelo PreToolUse do hook (o matcher é só Bash, Edit/Write e SendMessage).

Cada ferramenta devolve (texto, erro?). Erro de regra ou de envio é resultado com
isError, não erro de protocolo: o agente lê o motivo e corrige.
"""
import os
import re
import secrets
import shlex
import subprocess
import sys

import cmd_log
import hook_core
import registro
import toon
from base import VERSAO, Barrado, achar_orca, carregar_paineis

VEREDITOS = ("aprovado", "rejeitado")
CID_RE = re.compile(r"\[(c-\d{8}-\d{6}-[0-9a-f]+) ")

_ID = {"type": "string", "description": "id de mensagem do agent-board (c-AAAAMMDD-HHMMSS-xxxx)"}

FERRAMENTAS = [
    {"name": "board_send",
     "description": (
         "Envia uma mensagem a outro agente do time pelo correio do Orca, com as mesmas regras do hook "
         "(papel, projeto, tipo, log). Use no lugar de `orca orchestration send` no shell. `para` é o nome "
         "do agente (o nome curto vale: manager01-cc). Pedido a manager exige `modo`. Resposta exige "
         "`responde_a` com o id da mensagem recebida, e resposta não se responde. escalacao e entrega vão "
         "só para o master. O corpo não pode ter crase nem $( ). Devolve o id da mensagem (c-...)."),
     "inputSchema": {
         "type": "object",
         "properties": {
             "para": {"type": "string", "description": "nome do agente de destino, ex.: alpha-manager01-cc"},
             "tipo": {"type": "string", "enum": list(hook_core.TIPOS), "description": "tipo da mensagem do time"},
             "assunto": {"type": "string", "minLength": 1, "description": "assunto curto"},
             "corpo": {"type": "string", "description": "texto da mensagem; conteúdo longo vai na Issue"},
             "modo": {"type": "string", "enum": list(hook_core.MODOS),
                      "description": "obrigatório em pedido para manager: orquestrar (com subagents) ou executar"},
             "issues": {"type": "array", "items": {"type": "integer"}, "description": "Issues do GitHub ligadas"},
             "responde_a": {"type": "string",
                            "description": "obrigatório em resposta: id(s) da mensagem original, separados por vírgula"},
             "prazo": {"type": "string", "description": "prazo da entrega (repassado como --prazo)"},
             "veredito": {"type": "string", "enum": list(VEREDITOS),
                          "description": "veredito de uma revisão (repassado como --veredito)"},
         },
         "required": ["para", "tipo", "assunto"],
         "additionalProperties": False}},
    {"name": "board_inbox",
     "description": "Lê o correio do seu painel (orca orchestration check --format): as mensagens inteiras, "
                    "não só o assunto. Use quando aparecer o aviso [agent-board] Nova mensagem.",
     "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}},
    {"name": "board_pendentes",
     "description": "Mensagens que você recebeu e ainda não respondeu (menos respostas, que não se respondem). "
                    "Responda cada uma com board_send tipo resposta e responde_a. Saída em TOON.",
     "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}},
    {"name": "board_historico",
     "description": "Últimas mensagens do log do seu projeto, em TOON (mesmo filtro do painel.py historico).",
     "inputSchema": {
         "type": "object",
         "properties": {
             "agente": {"type": "string", "description": "só mensagens de ou para este agente"},
             "sobre": {"type": "string", "description": "trecho do assunto (sem diferenciar maiúsculas)"},
             "n": {"type": "integer", "minimum": 0, "default": 20, "description": "últimas N mensagens (0 = todas)"},
             "tudo": {"type": "boolean", "default": False, "description": "inclui o arquivo morto"},
         },
         "additionalProperties": False}},
    {"name": "board_status",
     "description": "Quem você é no time (agente, papel, projeto, raiz), quantas mensagens pendentes, a versão "
                    "do agent-board e os agentes do seu projeto. Saída em TOON.",
     "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}},
]
POR_NOME = {f["name"]: f for f in FERRAMENTAS}


# ---------------------------------------------------------------------------
# Validação dos argumentos (erro aqui vira -32602 no protocolo)
# ---------------------------------------------------------------------------
TIPOS_JSON = {"string": str, "integer": int, "boolean": bool, "array": list, "object": dict}


def validar(schema, args):
    """Confere args contra o inputSchema (só o que as nossas ferramentas usam). Devolve o motivo ou None."""
    if not isinstance(args, dict):
        return "arguments precisa ser um objeto"
    props = schema.get("properties", {})
    faltam = [k for k in schema.get("required", []) if k not in args]
    if faltam:
        return f"faltam parâmetros obrigatórios: {', '.join(faltam)}"
    for k, v in args.items():
        p = props.get(k)
        if p is None:
            return f"parâmetro desconhecido: {k}. Aceitos: {', '.join(props) or 'nenhum'}"
        tipo = TIPOS_JSON[p["type"]]
        if not isinstance(v, tipo) or (tipo is int and isinstance(v, bool)):
            return f"{k} precisa ser {p['type']}"
        if "enum" in p and v not in p["enum"]:
            return f"{k} inválido: {v}. Use um de: {', '.join(p['enum'])}"
        if p["type"] == "array" and not all(isinstance(x, int) and not isinstance(x, bool) for x in v):
            return f"{k} precisa ser uma lista de inteiros"
        if (p.get("minLength") and not v.strip()) or (p["type"] == "integer" and v < p.get("minimum", v)):
            return f"{k} inválido: {v!r}"
    return None


# ---------------------------------------------------------------------------
# Ferramentas
# ---------------------------------------------------------------------------
def quem_sou():
    """(handle, cadastro) do painel deste servidor. Sem cadastro, explica e para."""
    handle = os.environ.get("ORCA_TERMINAL_HANDLE")
    eu = carregar_paineis().get(handle)
    if eu is None:
        raise Barrado(f"este painel ({handle or 'sem $ORCA_TERMINAL_HANDLE'}) não está cadastrado no "
                       "agent-board. Peça ao master para cadastrar o painel com painel.py cadastrar")
    return handle, eu


def evento(nome, cmd, tid, resposta=None):
    """Evento do hook como o Claude Code mandaria para uma chamada do Bash."""
    p = {"hook_event_name": nome, "tool_name": "Bash", "tool_input": {"command": cmd}, "tool_use_id": tid}
    if resposta is not None:
        p["tool_response"] = resposta
    return hook_core.normalize(p, "claude")


def board_send(a):
    handle, eu = quem_sou()
    argv = ["orca", "orchestration", "send", "--to", a["para"], "--type", a["tipo"], "--subject", a["assunto"]]
    if a.get("corpo"):
        argv += ["--body", a["corpo"]]
    for chave, flag in (("modo", "--modo"), ("responde_a", "--responde-a"), ("prazo", "--prazo"),
                        ("veredito", "--veredito")):
        if a.get(chave):
            argv += [flag, a[chave]]
    if a.get("issues"):
        argv += ["--issues", ",".join(str(i) for i in a["issues"])]
    cmd = shlex.join(argv)
    tid = "mcp_" + secrets.token_hex(8)
    try:
        d = hook_core.decide(evento("PreToolUse", cmd, tid))
    except Exception as exc:  # a política quebrou: barra, como o FAIL_CLOSED do hook
        return f"Barrado: o hook agent-board falhou ({exc!r}); avise o master.", True
    if d is None or d.get("action") != "allow":
        motivo = d["reason"] if d else f"{a['para']} não é um agente do time; board_send é só para o time"
        return motivo, True
    traduzido = d["updated_input"]["command"]
    final = shlex.split(traduzido)
    final[0] = achar_orca()
    try:
        r = subprocess.run(final, capture_output=True, text=True, timeout=60, stdin=subprocess.DEVNULL)
        saida, codigo = (r.stdout or "") + (r.stderr or ""), r.returncode
    except (OSError, subprocess.TimeoutExpired) as exc:
        saida, codigo = f"error: {exc}", -1
    if codigo != 0 and not re.search(r"\berror\b", saida, re.I):
        saida += f"\nerror: orca saiu com código {codigo}"  # para o post_send marcar a falha no log
    try:  # aviso na tela do destino, ou a marca de falha no log
        hook_core.decide(evento("PostToolUse", traduzido, tid, saida))
    except Exception as exc:
        print(f"[agent-board] decide() pós-envio falhou: {exc!r}", file=sys.stderr)
    m = CID_RE.search(traduzido)
    cid = m.group(1) if m else "?"
    # quem decide se falhou é o post_send do hook: mensagem que falhou some do log ativo
    if codigo != 0 or cid not in {l["id"] for l in registro.ler_log(eu["raiz"])}:
        return f"{cid} NÃO entregue (o log marca como falhou; o master pode reenviar).\n{saida.strip()}", True
    return f"{cid} enviada para {a['para']} ({a['tipo']}).\n{saida.strip()}", False


def board_inbox(a):
    handle, _ = quem_sou()
    try:
        r = subprocess.run([achar_orca(), "orchestration", "check", "--terminal", handle, "--format"],
                           capture_output=True, text=True, timeout=60, stdin=subprocess.DEVNULL)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return f"não consegui ler o correio: {exc}", True
    return ((r.stdout or "") + (r.stderr or "")).strip() or "(correio vazio)", r.returncode != 0


CAMPOS_PENDENTES = ["id", "ts", "de", "tipo", "modo", "assunto", "issues"]


def board_pendentes(a):
    _, eu = quem_sou()
    return toon.tabela("pendentes", hook_core.pendentes_de(eu), CAMPOS_PENDENTES), False


def board_historico(a):
    _, eu = quem_sou()
    msgs = cmd_log.filtrar(eu["raiz"], a.get("agente"), a.get("sobre"), a.get("n", 20), a.get("tudo", False))
    return toon.tabela("mensagens", msgs, list(cmd_log.CAMPOS)), False


def board_status(a):
    handle, eu = quem_sou()
    agentes = sorted(({"agente": p.get("agente"), "papel": p.get("papel"), "handle": h}
                      for h, p in carregar_paineis().items() if p.get("projeto") == eu.get("projeto")),
                     key=lambda x: x["agente"] or "")
    return toon.objeto({"agente": eu.get("agente"), "papel": eu.get("papel"), "projeto": eu.get("projeto"),
                        "raiz": eu.get("raiz"), "handle": handle, "pendentes": len(hook_core.pendentes_de(eu)),
                        "versao": VERSAO, "agentes": agentes}), False


EXECUTAR = {"board_send": board_send, "board_inbox": board_inbox, "board_pendentes": board_pendentes,
            "board_historico": board_historico, "board_status": board_status}


def chamar(nome, args):
    """Roda a ferramenta. Barrado (regra ou falta de cadastro) volta como (motivo, True)."""
    try:
        return EXECUTAR[nome](args)
    except Barrado as exc:
        return f"Barrado pelo agent-board: {exc}", True
