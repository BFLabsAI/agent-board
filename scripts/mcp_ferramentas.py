"""
agent-board: ferramentas do servidor MCP (board_send, board_inbox, board_pendentes,
board_historico, board_status).

A regra não mora aqui. board_send (envio.enviar) monta o mesmo comando `orca orchestration send`
que o agente escreveria e passa por hook_core.decide() com eventos PreToolUse e
PostToolUse sintéticos, como o hook faria, e entrega pelo transporte do destino
(Orca ou Maestri). Precisa ser assim porque a regra do envio não roda no PreToolUse
de uma ferramenta MCP: o matcher mcp__agent-board__board_send do install.sh só barra
subagent.

Cada ferramenta devolve (texto, erro?). Erro de regra ou de envio é resultado com
isError, não erro de protocolo: o agente lê o motivo e corrige.
"""
import subprocess

import cmd_log
import envio
import hook_core
import toon
from base import VERSAO, Barrado, achar_orca, carregar_paineis, eh_maestri
from envio import quem_sou

VEREDITOS = ("aprovado", "rejeitado")

_ID = {"type": "string", "description": "id de mensagem do agent-board (c-AAAAMMDD-HHMMSS-xxxx)"}

FERRAMENTAS = [
    {"name": "board_send",
     "description": (
         "Envia uma mensagem a outro agente do time pelo transporte do destino (Orca ou Maestri), com as mesmas regras do hook "
         "(papel, projeto, tipo, log). Use no lugar de `orca orchestration send` no shell. `para` é o nome "
         "do agente (o nome curto vale: manager01-cc). Pedido a manager exige `modo`. Resposta exige "
         "`responde_a` com o id da mensagem recebida, e resposta não se responde. escalacao e entrega vão "
         "só para o master. O corpo é texto puro (crase e $( ) não são executados). Devolve o id da mensagem (c-...)."),
     "inputSchema": {
         "type": "object",
         "properties": {
             "para": {"type": "string",
                      "description": "nome do agente de destino (ex.: alpha-manager01-cc; o nome curto vale) "
                                     "ou papel:<papel> para o agente desse papel com menos pedidos abertos"},
             "tipo": {"type": "string", "enum": list(hook_core.TIPOS), "description": "tipo da mensagem do time"},
             "assunto": {"type": "string", "minLength": 1, "description": "assunto curto"},
             "corpo": {"type": "string", "description": "texto da mensagem; conteúdo longo vai na Issue"},
             "modo": {"type": "string", "enum": list(hook_core.MODOS),
                      "description": "obrigatório em pedido para manager: orquestrar (com subagents) ou executar"},
             "issues": {"type": "array", "items": {"type": "integer"}, "description": "Issues do GitHub ligadas"},
             "responde_a": {"type": "string",
                            "description": "obrigatório em resposta: id(s) da mensagem original, separados por vírgula"},
             "prazo": {"type": "string", "pattern": "^[0-9]+[mhd]$",
                       "description": "só em pedido: tempo para responder, ex.: 30m, 2h ou 1d"},
             "veredito": {"type": "string", "enum": list(VEREDITOS),
                          "description": "obrigatório em resposta a uma entrega: aprovado ou rejeitado"},
         },
         "required": ["para", "tipo", "assunto"],
         "additionalProperties": False}},
    {"name": "board_inbox",
     "description": "Lê o correio do seu painel. No Orca: orca orchestration check --format (as mensagens "
                    "inteiras, não só o assunto). No Maestri as mensagens já chegam digitadas no terminal: "
                    "devolve as que ainda estão sem resposta. Use quando aparecer o aviso [agent-board] Nova "
                    "mensagem.",
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
def board_send(a):
    return envio.enviar(a)


def board_inbox(a):
    handle, _ = quem_sou()
    if eh_maestri(handle):  # no Maestri a mensagem chega digitada no terminal; o que falta é responder
        texto, erro = board_pendentes(a)
        return "No Maestri as mensagens chegam direto neste terminal. Ainda sem resposta:\n" + texto, erro
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
