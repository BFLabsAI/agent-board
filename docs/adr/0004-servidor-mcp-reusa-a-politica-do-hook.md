# 0004. Servidor MCP em stdlib que reusa a política do hook

- **Status:** aceita; o envio foi extraído para `envio.py` pela [ADR-0006](0006-maestri-como-transporte.md)
- **Data:** 2026-10-12

## Contexto
O agente fala com o time escrevendo um comando de shell, e o hook interpreta a string com `shlex`/regex. Isso gerou bugs de aspas (ex.: `--body "--- resumo"`) e deixa brechas. Ferramentas MCP têm parâmetros tipados, e funcionam em qualquer harness que fale MCP.

## Decisão
- `scripts/mcp_server.py`: JSON-RPC 2.0 sobre stdio escrito com a biblioteca padrão (o protocolo stdio é pequeno). Sem o SDK `mcp`, para manter o repo sem dependências.
- **A regra não é duplicada:** `board_send` monta o comando `orca` equivalente e o passa por `hook_core.decide()` como um PreToolUse sintético, executa o comando traduzido e chama o PostToolUse. Qualquer regra nova do hook vale automaticamente para o MCP. Desde a ADR-0006 esse caminho mora em `scripts/envio.py`, que entrega pelo transporte do destino (orca ou `maestri ask`) e serve também ao `board.py send`.
- Identidade: `base.meu_handle()` (Orca ou Maestri), herdada pelo processo do servidor e procurada no cadastro, igual ao hook.
- O hook continua valendo para o shell. As ferramentas MCP não passam pelo PreToolUse (matcher só Bash, Edit|Write|MultiEdit|NotebookEdit e SendMessage), por isso o servidor chama a política ele mesmo. Desde a 1.9.1 o `install.sh` liga também o matcher `mcp__agent-board__board_send`, mas só para barrar subagent; a regra do envio continua no `envio.py`.

## Consequências
- Dois canais válidos (shell e MCP), um só conjunto de regras e um só log.
- Mudanças de versão do protocolo MCP exigem manutenção manual da negociação de `protocolVersion`.
