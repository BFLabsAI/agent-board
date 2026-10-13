#!/usr/bin/env python3
"""
agent-board: servidor MCP (Model Context Protocol) com as ferramentas board_*.

O agente manda mensagem com parâmetros tipados (board_send) em vez de escrever o
comando `orca orchestration send ...` no shell, que dependia de aspas certas.
A regra continua uma só: as ferramentas passam pelo hook_core.decide() (veja
mcp_ferramentas.py).

Transporte stdio do MCP: JSON-RPC 2.0, uma mensagem JSON por linha. Stdout leva
só o protocolo; logs vão para stderr. Só biblioteca padrão.

Identidade: o painel em $ORCA_TERMINAL_HANDLE (o Claude Code herda o ambiente do
painel do Orca), procurado em paineis.json, como no hook.

Registro no Claude Code (o install.sh faz isso):
  claude mcp add --scope user agent-board -- python3 <skill>/scripts/mcp_server.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from base import VERSAO, meu_handle  # noqa: E402
import mcp_ferramentas  # noqa: E402

VERSOES = ("2025-06-18", "2025-03-26", "2024-11-05")  # a primeira é a padrão
INSTRUCOES = ("Ferramentas do agent-board para falar com outros agentes do time pelo correio do Orca. "
              "Use board_send no lugar de `orca orchestration send` no shell; as regras são as mesmas do "
              "docs/agent-board/CONTRATO.md do projeto. Toda mensagem recebida precisa de resposta: veja "
              "board_pendentes antes de encerrar.")

# Códigos de erro do JSON-RPC 2.0
ILEGIVEL, INVALIDA, SEM_METODO, PARAMS_INVALIDOS, INTERNO = -32700, -32600, -32601, -32602, -32603


class ErroRpc(Exception):
    def __init__(self, codigo, mensagem):
        super().__init__(mensagem)
        self.codigo = codigo


def log(texto):
    print(f"[agent-board mcp] {texto}", file=sys.stderr, flush=True)


def initialize(params):
    pedida = params.get("protocolVersion")
    return {"protocolVersion": pedida if pedida in VERSOES else VERSOES[0],
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": "agent-board", "version": VERSAO},
            "instructions": INSTRUCOES}


def tools_call(params):
    nome, args = params.get("name"), params.get("arguments")
    ferramenta = mcp_ferramentas.POR_NOME.get(nome)
    if ferramenta is None:
        raise ErroRpc(PARAMS_INVALIDOS, f"ferramenta desconhecida: {nome}. "
                                        f"Existem: {', '.join(mcp_ferramentas.POR_NOME)}")
    args = {} if args is None else args
    motivo = mcp_ferramentas.validar(ferramenta["inputSchema"], args)
    if motivo:
        raise ErroRpc(PARAMS_INVALIDOS, f"{nome}: {motivo}")
    texto, erro = mcp_ferramentas.chamar(nome, args)
    return {"content": [{"type": "text", "text": texto}], "isError": erro}


METODOS = {
    "initialize": initialize,
    "ping": lambda params: {},
    "tools/list": lambda params: {"tools": mcp_ferramentas.FERRAMENTAS},
    "tools/call": tools_call,
}


def atender(msg):
    """Uma mensagem JSON-RPC -> resposta (dict), ou None para notificação e resposta do cliente."""
    if not isinstance(msg, dict) or msg.get("jsonrpc") != "2.0":
        return erro(None, INVALIDA, "mensagem JSON-RPC 2.0 inválida")
    if "method" not in msg:
        return None  # resposta a um pedido nosso (não fazemos pedidos): ignora
    mid = msg.get("id")
    if "id" not in msg:
        return None  # notificação (ex.: notifications/initialized): não se responde
    metodo, params = msg["method"], msg.get("params")
    if params is None:
        params = {}
    if not isinstance(params, dict):
        return erro(mid, PARAMS_INVALIDOS, "params precisa ser um objeto")
    funcao = METODOS.get(metodo)
    if funcao is None:
        return erro(mid, SEM_METODO, f"método desconhecido: {metodo}")
    try:
        return {"jsonrpc": "2.0", "id": mid, "result": funcao(params)}
    except ErroRpc as exc:
        return erro(mid, exc.codigo, str(exc))
    except Exception as exc:  # bug nosso: responde em vez de derrubar o servidor
        log(f"{metodo} falhou: {exc!r}")
        return erro(mid, INTERNO, f"erro interno do agent-board: {exc!r}")


def erro(mid, codigo, mensagem):
    return {"jsonrpc": "2.0", "id": mid, "error": {"code": codigo, "message": mensagem}}


def main():
    entrada = sys.stdin.buffer
    saida = sys.stdout.buffer
    sys.stdout = sys.stderr  # print perdido de qualquer módulo não pode sujar o protocolo
    log(f"agent-board {VERSAO}, painel {meu_handle() or '(sem handle)'}")
    for bruta in entrada:
        if not bruta.strip():
            continue
        try:
            msg = json.loads(bruta.decode("utf-8"))
        except ValueError as exc:
            resp = erro(None, ILEGIVEL, f"JSON ilegível: {exc}")
        else:
            if msg == []:
                resp = erro(None, INVALIDA, "lote vazio")
            elif isinstance(msg, list):  # lote (2025-03-26 e anteriores)
                resp = [r for r in (atender(m) for m in msg) if r is not None] or None
            else:
                resp = atender(msg)
        if resp is not None:
            saida.write(json.dumps(resp, ensure_ascii=False).encode("utf-8") + b"\n")
            saida.flush()


if __name__ == "__main__":
    main()
