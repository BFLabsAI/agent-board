# Changelog

## 1.8.0 — 2026-10-12

Primeira versão com protocolo de tarefas, servidor MCP e painel web. Para atualizar: rode `install.sh` de novo e, em cada projeto, `painel.py init --raiz … --projeto … --prefixo … --atualizar-contrato` (o template ganhou chaves novas, todas opcionais).

### ⚠️ Muda comportamento
- **Resposta a uma `entrega` exige `--veredito aprovado|rejeitado`.** Antes passava sem. O rodapé da mensagem de entrega já traz o comando pronto.
- **Tipo novo `andamento`** liberado para qualquer papel (resposta parcial a um pedido longo; para de cobrar no Stop sem fechar o pedido).
- O log passa a ter `"prev"` (cadeia de hash) em cada linha nova e linhas de status (`falhou`, `reenviado`, `atrasado`). Quem lê o log com `jq` deve filtrar `select(.status == null)` para ver só mensagens.

### Novo
- **Tarefas e prazos:** `--prazo 30m|2h|1d` em pedido (ou `prazo_padrao`), `painel.py tarefas`, `vigiar` (escala atrasados ao master), `simular` (testa uma config nova contra o log).
- **Regras opcionais** no `agent-board.json`: `limites.pedidos_abertos_max`, alerta de ping-pong (`ping_pong_max`, `ping_pong_janela_min`), `ligacoes` (quem pode pedir/avisar a quem).
- **Roteamento:** `--to papel:researcher` escolhe o agente desse papel com menos pedidos abertos.
- **Servidor MCP** (`mcp_server.py`): ferramentas `board_send`, `board_inbox`, `board_pendentes`, `board_historico`, `board_status`, com as mesmas regras do hook. O `install.sh` registra no Claude Code.
- **Painel web** (`painel.py servir`): mapa do time, tarefas, linha do tempo e notas; só leitura, em 127.0.0.1.
- **Time:** `painel.py nota`/`notas` (memória compartilhada e decisões), `resumo` (o que aconteceu no período), `cadastrar --worktree` (branch isolada por manager; `entrega` grava a branch).
- **Notificações:** webhook (`AGENT_BOARD_WEBHOOK`) para escalação/entrega e comentário em Issue do GitHub (`github.comentar_entregas`).
- **Log:** `historico` em TOON, `verificar` (cadeia de hash), `arquivar` (arquivo morto mensal), `reenviar`.
- Documentação: ADRs 0001–0005 em `docs/adr/`, guia do painel em `docs/userguide/painel.md`.

### Corrigido
- Envio recusado pelo Orca continuava cobrado no Stop do destino.
- Uma linha corrompida no log barrava todas as respostas do projeto.
- `--body "--- texto"` (começando com `--`) saía com o corpo vazio e uma flag solta.
- `install.sh` gravava o `settings.json` sem atomicidade (e trocava um symlink por arquivo).
- Versão do código (`1.5.0`) divergia de `scripts/VERSION` (`1.5.1`); agora vem só do arquivo.

### Interno
- `hook_core.py` dividido em `base`, `registro`, `politica`, `protecao`, `avisos`, `toon`; trava em arquivo próprio com fallback para Windows.
- CI: testes em Python 3.8 e 3.12 (6 suítes) e `ruff`.
