# Changelog

## 1.9.0 — 2026-10-12

Maestri como segundo transporte: o mesmo time, as mesmas regras e o mesmo log num canvas do Maestri. Ver [ADR-0006](docs/adr/0006-maestri-como-transporte.md) e a seção "No Maestri" do README.

### Novo
- **Identidade Maestri:** painel `maestri:<$MAESTRI_TERMINAL_ID>`; cadastro guarda `transporte` e `nome_canvas`.
- **Cadastro em duas pontas:** `painel.py eu`, `solicitar` (no terminal do agente), `solicitacoes` (master); `cadastrar` aceita `maestri:<id>=<agente>` só com pedido feito.
- **`board.py send`:** envio do time pela linha de comando em qualquer transporte, mesmas flags do `orca orchestration send`, `--body-file` (`-` = stdin).
- **Entrega pelo Maestri** via `maestri ask` em processo separado: falha em até 3 s (sem corda, terminal não achado) marca `falhou` no log; senão, entregue sem segurar quem envia.
- **Hook:** barra `maestri ask`/`--batch` direto para agente do time; `--raw` só do master no próprio time; `orca … send` para destino Maestri aponta o `board.py`. Rodapé e cobrança do Stop mostram o comando do transporte certo. Adaptador do OMP também encaminha `maestri ask`.
- **Canvas a partir da política (Maestro, dry-run sem `--aplicar`):** `painel.py maestri conectar` (cordas), `painel.py maestri rotina` (vigiar agendado).
- **Opcionais** em `"maestri"`: `espelhar_notas` (nota `ab · <tema>` no fichário `agent-board`), `status_do_floor` (entrega põe o floor em revisão). Entrega feita de um floor grava a `branch` sozinha.
- Painel web mostra o nome no canvas dos agentes do Maestri.

### Muda comportamento
- Envio pelo MCP (`board_send`) e pelo `board.py` aceita crase e `$( )` no corpo (nunca passa por shell). No shell, o hook continua barrando.

### Interno
- `envio.py`: o envio do MCP virou módulo compartilhado; `base.meu_handle()` substitui as leituras diretas de `$ORCA_TERMINAL_HANDLE`.
- `test_maestri.py` (25 testes) com CLI `maestri` falsa que reproduz as respostas da real; CI com 7 suítes.

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
