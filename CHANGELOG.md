# Changelog

## 1.9.2 — 2026-10-13

Documentação reestruturada para ser didática e visual. O README virou um portal curto; o conteúdo foi para guias práticos por transporte, conceitos com diagramas e uma referência em tabelas.

### Documentação
- `README.md`: portal com diagrama, setup geral, evoluções do fork e "escolha seu caminho".
- `docs/guias/orca/` e `docs/guias/maestri/`: 4 passos cada (instalar, montar o time, dia a dia, problemas).
- `docs/conceitos/` (como funciona, papéis e mensagens, regras) com 6 diagramas Mermaid.
- `docs/referencia/` (comandos, config, arquivos e estado, hooks e limites): todo o conteúdo denso do README antigo, em tabelas.
- `docs/ESTILO.md`: guia de estilo da documentação.

### Corrigido
- `painel.py remover --help` tentava remover um painel chamado "--help"; agora mostra a ajuda, recusa entrada que não é painel e avisa o que não estava no cadastro.

### Interno
- `test_docs.py`: confere na CI que todo link e toda âncora da documentação existem.

## 1.9.1 — 2026-10-12

Correções achadas no teste ponta a ponta com a CLI real do Maestri e na revisão da documentação. Para atualizar: rode `install.sh` de novo (liga o matcher novo do `board_send`) e, em cada projeto, `painel.py init … --atualizar-contrato` (o CONTRATO foi revisado: Maestri, subagent, `board_send` com `prazo`/`veredito`).

### Corrigido
- Maestri: nome do terminal em modo Maestro (`name: "X", maestro: true`) saía com os atributos colados.
- Rodapé de `resposta` e `andamento` sugeria responder (o hook barra); agora diz "Não responda a esta mensagem".
- Comando sugerido (rodapé, Stop, bloqueios) leva `AGENT_BOARD_HOME=…` quando o estado não está no padrão; `painel.py maestri rotina` também.
- Hook: um `--body` que cita `maestri ask` não desvia mais o envio da regra do time; `board.py` no shell com corpo citando `orca orchestration send` não é mais barrado.
- `painel.py reenviar` entrega pelo transporte do destino (antes só pelo orca, e falhava para destino no Maestri).
- Aviso na tela (escalação do `vigiar`, alerta de ping-pong) chega a um master no Maestri, pelo `maestri ask`.
- Subagent barrado também no `board.py` e no `board_send` do MCP (o `install.sh` liga o matcher `mcp__agent-board__board_send`).
- Entrega feita pelo `board.py`/MCP num floor do Maestri grava a `branch`; o painel web mostra a branch real do worktree.
- `board.py send --body-file` com arquivo inexistente mostra o motivo em vez de um traceback.

### Documentação
- ADR-0007 (protocolo de tarefas e regras opcionais); ADRs 0001, 0003–0006, docstrings e ajudas revisadas.

### Interno
- `test_maestri.py` com 34 testes.

## 1.9.0 — 2026-10-12

Maestri como segundo transporte: o mesmo time, as mesmas regras e o mesmo log num canvas do Maestri. Ver [ADR-0006](docs/adr/0006-maestri-como-transporte.md) e o [guia do Maestri](docs/guias/maestri/README.md). Para atualizar: rode `install.sh` de novo (o adaptador do OMP passou a encaminhar `maestri ask`) e, em cada projeto, `painel.py init --raiz … --projeto … --prefixo … --atualizar-contrato` (o CONTRATO ganhou a seção do Maestri; a chave `"maestri"` da config é opcional).

### Novo
- **Identidade Maestri:** painel `maestri:<$MAESTRI_TERMINAL_ID>`; cadastro guarda `transporte` e `nome_canvas`.
- **Cadastro em duas pontas:** `painel.py eu`, `solicitar` (no terminal do agente), `solicitacoes` (master); `cadastrar` aceita `maestri:<id>=<agente>` só com pedido feito.
- **`board.py send`:** envio do time pela linha de comando em qualquer transporte, mesmas flags do `orca orchestration send`, `--body-file` (`-` = stdin).
- **Entrega pelo Maestri** via `maestri ask` em processo separado: falha em até 3 s (sem corda, terminal não achado) marca `falhou` no log; senão, entregue sem segurar quem envia.
- **Hook:** barra `maestri ask`/`--batch` direto para agente do time; `--raw` só do master no próprio time; `orca … send` para destino Maestri aponta o `board.py`. Rodapé e cobrança do Stop mostram o comando do transporte certo. Adaptador do OMP também encaminha `maestri ask`.
- **Canvas a partir da política (Maestro, dry-run sem `--aplicar`):** `painel.py maestri conectar` (cordas), `painel.py maestri rotina` (vigiar agendado).
- **Opcionais** em `"maestri"`: `espelhar_notas` (nota `ab · <tema>` no fichário `agent-board`), `status_do_floor` (entrega põe o floor em revisão). Entrega feita de um floor grava a `branch` sozinha.
- Painel web mostra o nome no canvas dos agentes do Maestri.
- `painel.py listar` funciona sem o Orca (mostra o cadastro e os pedidos do Maestri); `board_inbox` no Maestri lista o que falta responder.

### Muda comportamento
- Envio pelo MCP (`board_send`) e pelo `board.py` aceita crase e `$( )` no corpo (nunca passa por shell). No shell, o hook continua barrando.

### Interno
- `envio.py`: o envio do MCP virou módulo compartilhado; `base.meu_handle()` substitui as leituras diretas de `$ORCA_TERMINAL_HANDLE`.
- `test_maestri.py` (25 testes) com CLI `maestri` falsa que reproduz as respostas da real; CI com 7 suítes.

## 1.8.0 — 2026-10-12

Primeira versão com protocolo de tarefas, servidor MCP e painel web. Para atualizar: rode `install.sh` de novo e, em cada projeto, `painel.py init --raiz … --projeto … --prefixo … --atualizar-contrato` (o template ganhou chaves novas, todas opcionais). Inclui o que foi numerado internamente como 1.6.0 e 1.7.0 (sem release próprio); a versão anterior publicada é a 1.5.1.

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
