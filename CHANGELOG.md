# Changelog

## 1.10.2 — 2026-10-14

### Corrigido
- `achar_orca()` procura primeiro o shim do terminal aberto por um Orca server (`$ORCA_CLI_BIN_DIR`), antes do shim SSH e do relay `~/.orca-relay`. Num servidor que ainda tinha o relay SSH, o hook podia escolher o relay, que fala com outro runtime e não conhece os painéis do servidor ("no live pane bound to a Run"). Variável vazia é ignorada.

## 1.10.1 — 2026-10-14

Corrige o ciclo de vida do pedido quando o trabalho é entregue. Ver [ADR-0009](docs/adr/0009-entrega-fecha-o-pedido.md).

### Corrigido
- `entrega --responde-a <id>` agora fecha o pedido `<id>` (antes só `resposta` fechava): o pedido sai de `em_andamento`/`aberto` no `painel.py tarefas` e no painel web, não é mais escalado como `atrasado` pelo `vigiar`, deixa de ser cobrado no Stop e de contar em `pedidos_abertos_max`. A entrega mantém o próprio ciclo (`aguardando_revisao`, `aprovado`, `rejeitado`); entrega rejeitada não reabre o pedido.
- `--responde-a` na `entrega` (opcional) passa a ser validado como na resposta.

### Alterado
- O rodapé de um pedido a um manager mostra os dois comandos prontos: `--type entrega --responde-a <id>` para trabalho feito e `--type resposta --responde-a <id>` para pergunta ou bloqueio. `CONTRATO.md` e os guias de dia a dia explicam a diferença. `resposta` a pedido de trabalho continua permitida.

### OMP

Adaptador do OMP (`scripts/omp-agent-board.ts`), conferido no OMP 18.8.6.

#### Corrigido
- O aviso digitado no destino não conferia o resultado do envio: o `tool_result` do OMP não levava o texto da saída, então um `orca send` que falhou ainda disparava o aviso. Agora o adaptador manda o texto e o `isError`.
- Subagent não era barrado no OMP: o adaptador não mandava a identidade. Agora `ctx.agent.kind === "sub"` vira `agent_id` e o core barra o envio (shell, `board.py` e `board_send`).
- `board_send` do MCP: o OMP nomeia `mcp__agent-board_board_send` (um `_`), e o core procurava `__board_send`. O adaptador reescreve o nome.
- Escrita à mão no log e no cadastro: `edit` com vários arquivos (só `paths[]`), `ast_edit` e `eval` escapavam. Agora são tratados; o `eval` que cita o log ou o cadastro é barrado.
- `board.py` e o `cwd` da sessão passam pelo core (antes o filtro do adaptador não incluía o `board.py`).

#### Novo
- `scripts/test_omp.py` (14 testes): roda o adaptador de verdade no bun, com eventos no formato do OMP e o core real. Sem o bun, a suíte é pulada.
- `AGENT_BOARD_PYTHON` escolhe o interpretador do adaptador (padrão `python3`).
- Documentado como abrir uma sessão do OMP só com um adaptador (`omp --no-extensions --hook <caminho>`), os nomes e campos reais das ferramentas e o limite do `eval`.

## 1.10.0 — 2026-10-13

A interface do time (Orca ou Maestri) passa a ser escolhida no setup, e o contrato dos agentes sai escrito só para ela. Ver [ADR-0008](docs/adr/0008-interface-escolhida-no-setup-e-contrato-adaptado.md).

### Novo
- `painel.py init --transporte orca|maestri` grava `"transporte"` no `agent-board.json` e gera o `CONTRATO.md` adaptado: a versão do Orca não fala do Maestri, e a do Maestri não fala do Orca. Trocar de interface num projeto existente refaz a config e o contrato.
- `cadastrar` recusa terminal da outra interface (só em projeto com `"transporte"`).
- Seção "Delegar: subagent ou agente do time" no contrato e no `SKILL.md` (procedimento do master): subagent interno só para tarefa curta; o que precisa de outro papel ou harness vira pedido ao time.
- `scripts/contrato.py` e `test_contrato.py` (25 testes, inclusive o que garante que nenhuma versão cita a outra interface).

### Muda comportamento
- `init` em projeto **novo** exige a interface: `--transporte`, ou a do terminal atual quando é uma só (ele avisa). Sem nenhuma das duas, falha pedindo a flag. Projeto antigo, sem `"transporte"`, continua como estava até alguém passar `--transporte`.
- Para atualizar: `painel.py init … --transporte <orca|maestri> --atualizar-contrato` em cada projeto.

### Documentação
- Guias do Orca e do Maestri, referência, README e `SKILL.md` descrevem a escolha.

## 1.9.3 — 2026-10-13

Guia do MCP e teste ao vivo. Só documentação.

### Documentação
- `docs/guias/mcp.md`: guia único do MCP para Orca e Maestri (registrar, aprovar o prompt do Claude Code, liberar a permissão, conferir com `board_status`, usar as 5 ferramentas, problemas).
- Guias do Orca e do Maestri passam a integrar o MCP: instalar, montar o time, dia a dia e problemas.
- README, CONTRATO, SKILL, referência e conceitos apontam para o guia.

### Verificado ao vivo
- No Maestri, com Claude Code real: o agente enxerga as 5 ferramentas, `board_status` devolve a identidade certa (o Claude Code repassa `$MAESTRI_TERMINAL_ID` ao servidor) e um manager respondeu a um pedido só com `board_send`. No Orca, o MCP está coberto pelo código e pelos testes, não por um teste ao vivo.

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
