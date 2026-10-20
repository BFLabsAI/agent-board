# Changelog

## 1.14.2 — 2026-10-20

### Corrigido
- **Painel como serviço mostrava todos os agentes "offline":** o systemd não herda `$ORCA_CLI_BIN_DIR`, e o painel caía no `orca` do relay SSH, que não conhece os terminais do Orca server. Por isso tudo zerava: sem agentes trabalhando, sem sub-agents rodando. Três correções:
  - `achar_orca` procura o shim padrão do Orca server (`~/.config/orca/linux-orca-cli-shim/orca`) antes do PATH e do relay;
  - `painel.py servico instalar` grava o `ORCA_CLI_BIN_DIR` do terminal no unit e reinicia o serviço quando o unit muda;
  - quando o orca responde com erro (`ok: false`), os agentes ficam "desconhecido" e não "offline".

## 1.14.1 — 2026-10-20

### Corrigido
- **Federação pelo IP da tailnet:** o `tailscale serve` roteia pelo nome da máquina, então chamar `http://<ip>:8765` dava 404 e um Workspace não enxergava o outro. Os painéis agora conectam no IP descoberto, porque nem toda VPS resolve MagicDNS (`--accept-dns=false`), e mandam o `Host` com o nome da tailnet do peer. A conexão continua indo só para IPs descobertos.

## 1.14.0 — 2026-10-20

Workspaces federados. Um **Workspace** é uma máquina (VPS) com o agent-board; a hierarquia fica Workspace › Squad › Agente › Sub-agent. Não há hub: todo painel enxerga todos os Workspaces da tailnet. Tudo continua só leitura. Ver o [guia de Workspaces](docs/userguide/painel-workspaces.md) e a [ADR-0012](docs/adr/0012-workspaces-federados.md). Épico [#29](https://github.com/BFLabsAI/agent-board/issues/29) e issue [#30](https://github.com/BFLabsAI/agent-board/issues/30).

### Novo
- **Servidor** (`scripts/painel_federacao.py`, `cmd_web.py`):
  - `GET /api/versao` (versão, contrato, identidade do Workspace e projetos);
  - Host e Origin aceitam o endereço da tailnet do próprio nó (e `hosts_extras`);
  - `workspace.json` opcional, com `nome`, `porta_federacao`, `hosts_extras` e `ignorar`;
  - descoberta automática por `tailscale status --json`, com probe em `/api/versao` (cache de 30 s);
  - `GET /api/workspaces`, com `offline_desde`;
  - proxy `GET /api/w/<id>/api/...`, só para Workspaces descobertos (anti-SSRF; `X-AgentBoard-Federado` evita laço);
  - stream `GET /api/stream?workspace=*`, com 1 vaga das 16 e o evento novo `workspace`. Contrato em [painel-api.md](docs/referencia/painel-api.md#workspaces-federados-114).
- **`painel.py servico instalar|status|remover [--porta] [--dry-run]`** (`scripts/cmd_servico.py`): cria o unit systemd `agent-board-painel.service` (`Restart=always`) e o `tailscale serve` (HTTPS no 443 para o navegador e http no 8765 para os outros painéis). Idempotente.
- **Tela Workspaces** (`/workspaces`): vira a abertura quando há mais de 1 Workspace online. Cards com versão, latência, totais e squads; offline e "atualize o agent-board" quando a versão é mais antiga.
- **Seletor Workspace › Squad** na barra lateral. Todas as telas de squad funcionam com um Workspace remoto.
- **Office modo Prédio** (`/office?modo=predio`): um andar por Workspace, com as salas dos squads, pulsos ao vivo e modo TV.
- **ADR-0012** e o guia [Workspaces](docs/userguide/painel-workspaces.md).

### Atualizar
- `git pull` na pasta da skill, como sempre.
- **Em cada VPS, uma vez:** `python3 ~/.agents/skills/agent-board/scripts/painel.py servico instalar`. Esse comando deixa o painel sempre ligado (systemd) e visível para os outros painéis na tailnet. Pré-requisitos: Tailscale na mesma tailnet e HTTPS habilitado nela (para o `tailscale serve`). Use `--dry-run` para ver antes o que será feito.
- Pare um `painel.py servir` antigo (ex.: aberto com `nohup`) antes: ele ocupa a porta 8765.
- Não precisa rodar o `install.sh` de novo. Sem o `servico instalar`, o painel segue funcionando como antes, só com o Workspace local.

### Testes
- **507 testes Python em 12 suítes:** `test_agent_board` 101, `test_contrato` 26, `test_docs` 2, `test_federacao` 63, `test_maestri` 35, `test_mcp` 15, `test_omp` 14, `test_politica` 35, `test_registro` 23, `test_subagentes` 25 (1 pulado), `test_time` 19 e `test_web` 149. Rode com `env -u ORCA_CLI_BIN_DIR` dentro de um terminal do Orca server.
- **307 testes Vitest** do front, em 21 arquivos (`cd web && npx vitest run`). Em máquina carregada, 1 ou 2 testes de renderização do Office estouram os 5 s padrão; com `--testTimeout=30000` os 307 passam.
- A CI roda 10 das 12 suítes Python; `test_omp.py` (precisa do `bun`), `test_subagentes.py` e o Vitest rodam à mão.

## 1.13.1 — 2026-10-20

### Alterado
- **Sub-agents no processo (Workflows):** o grafo passa a ser Master → Agentes → **Sub-agents de cada agente** → Issues → Revisão → Resultado. Cada agente tem um nó "N sub-agents" ligado às issues em que eles trabalharam. A ligação direta agente → issue só fica quando nenhum sub-agent daquele agente tocou a issue. Saíram a faixa lateral, os selos e os trilhos tracejados da 1.13.0. O KPI de sub-agents mostra quantos % estão ligados a issues.
- **Sub-agents ligados a issues:** campo novo `issues`, com os `#NNN` da descrição mais as issues da tarefa do pai. O master liga pelo pedido aberto que enviou.
- **Kanban, Dashboard e Office:** mesmas regras em todas as telas. Só os sub-agents rodando aparecem por inteiro; os terminados viram um resumo agrupado por issue ("✓ 8 concluídos em #587 · 2 sem issue"). Os chips das issues levam à conversa. Nenhuma tela mostra mais "sem descrição", "sem atividade" ou "0s".

## 1.13.0 — 2026-10-20

Painel multi-squad e sub-agents mais claros. Um **squad** é um projeto do cadastro. Ver o [guia da Visão geral e do Andar](docs/userguide/painel-geral.md). Issues [#20](https://github.com/BFLabsAI/agent-board/issues/20) e [#25](https://github.com/BFLabsAI/agent-board/issues/25) a [#28](https://github.com/BFLabsAI/agent-board/issues/28).

### Novo
- **Visão geral** (`/geral`, #27): fica no topo do menu e abre sozinha quando o cadastro tem mais de um projeto. Mostra os totais de todos os squads, um card por squad com selo de saúde (ok, atenção ou crítico) e um feed unificado de mensagens.
- **Office modo Andar** (`/office?modo=andar`, #28): uma sala isométrica por squad, com pulsos ao vivo e modo TV. Clicar na placa entra no Office do squad.
- **API multi-squad** (#26): `GET /api/geral`, `GET /api/geral/mensagens` e `GET /api/stream?projeto=*` (todos os projetos numa conexão, 1 vaga das 16). Um projeto que não dá para ler entra como `critico`, com `erro`, sem derrubar os outros. Contrato em [painel-api.md](docs/referencia/painel-api.md#visão-geral-e-multi-squad-113).

### Alterado
- **Sub-agents (#20):** o sub-agent se chama `subagent-cc` ou `subagent-omp`, conforme o harness do pai, e o `tipo` virou detalhe secundário. A API ganhou `nome` e `inicio_aproximado`; sub-agent sem início conhecido não mostra duração.
- **Office, Mapa:** só os sub-agents rodando viram card; os terminados viram uma linha de resumo e o layout ficou equilibrado. A gaveta separa **Rodando** e **Terminados**.
- **Workflows:** os sub-agents saem do fluxo principal e vão para uma faixa própria, com o selo `⑂ N` por agente. O contador tem espaço fixo e o tooltip segue o cursor.
- **Dashboard e Kanban** usam o novo nome do sub-agent.

### Testes
- **435 testes Python em 11 suítes:** `test_agent_board` 101, `test_contrato` 26, `test_docs` 2, `test_maestri` 35, `test_mcp` 15, `test_omp` 14, `test_politica` 35, `test_registro` 23, `test_subagentes` 25 (1 pulado), `test_time` 19 e `test_web` 140. Rode com `env -u ORCA_CLI_BIN_DIR` dentro de um terminal do Orca server.
- **254 testes Vitest** do front, em 18 arquivos (`cd web && npx vitest run`).
- A CI continua rodando 10 suítes Python; `test_omp.py` (precisa do `bun`) e o Vitest rodam à mão.

### Corrigido
- **Leitor de sub-agents:** um arquivo do dia apagado e recriado no mesmo caminho podia reaproveitar o inode e ser lido como continuação do antigo, misturando eventos. Agora o leitor confere o começo e o trecho logo antes de onde parou; se mudaram, relê do zero.

## 1.12.1 — 2026-10-20

### Corrigido
- **Status piscando no painel:** os managers do Claude Code e do OMP parados alternavam entre parado e trabalhando, porque o terminal ocioso redesenha a barra de status e a regra "saída nos últimos 10 s" contava isso como trabalho. Quando o título é do Claude Code (`✳`) ou do OMP (`π`), vale só o spinner do título; a saída recente fica para terminais de outros tipos.
- **Sub-agents sumidos:** sessões abertas antes da 1.12.0 não mandam `inicio` nem `spawn` até reiniciar, só `atividade` e `fim`, e o painel exigia o `inicio`. Agora o sub-agent nasce no primeiro evento visto dele.

## 1.12.0 — 2026-10-20

Sub-agents no painel: cada master e manager mostra os sub-agents que lançou, com o que fazem agora. Ver [ADR-0011](docs/adr/0011-subagentes-no-painel.md), o [plano](docs/planos/subagentes.md) e o [guia do painel](docs/userguide/painel.md#sub-agents). Épico [#20](https://github.com/BFLabsAI/agent-board/issues/20).

### Novo
- **Coletor de sub-agents** (`scripts/subagentes.py`, chamado pelo `hook_core`): grava o ciclo de vida em cinco eventos, `spawn`, `inicio`, `atividade`, `fim` e `retorno`. O sub-agent não entra no cadastro nem no log de mensagens.
- **Hooks novos** no `install.sh`: `SubagentStart`, `SubagentStop`, `PostToolUseFailure` e `PreToolUse`/`PostToolUse` com matcher `Agent|Task`. Nenhum `PreToolUse *`: a `atividade` (Bash, Edit e Write) pega carona nos `PreToolUse` que o hook já recebe.
- **Arquivo do coletor** em `~/.agent-hooks/agent-board/subagentes/<projeto>/AAAA-MM-DD.jsonl`: fora do git, sem cadeia de hash, só append, retenção de 14 dias (limpeza no máximo 1 vez por dia).
- **Privacidade:** o prompt, a saída das ferramentas e a última mensagem do sub-agent nunca são gravados. `descricao` e `resumo` passam pela máscara de segredos, extraída para `base.mascarar` (compilada só no primeiro uso, para não pesar no boot do hook).
- **OMP:** o adaptador emite `inicio`, `atividade` e `fim` (o `fim` vem do `agent_end` do sub ou do resultado da ferramenta `task` do pai). Ficam de fora o `spawn` e o `retorno` (a ferramenta `task` não traz descrição nem tipo) e o advisor. **Codex e Maestri não têm** coleta de sub-agents.
- **API:** `GET /api/subagentes?periodo&agente&status&limite`, o campo `subagentes` em agentes, tarefas, analytics e workflows, `indicadores.subagentes_rodando` e o evento SSE `subagente`. Leitura incremental em `scripts/painel_subagentes.py`. Contrato em [painel-api.md](docs/referencia/painel-api.md#sub-agents-112-issue-20).
- **Telas:**
  - **Office:** o Mapa mostra sub-cards ligados ao pai, o Hub põe drones em órbita da mesa, a Grade ganha o resumo de sub-agents e a gaveta lista os sub-agents do agente.
  - **Kanban:** os cartões de agente trazem os sub-agents aninhados e os de tarefa mostram os ligados a ela.
  - **Dashboard:** cartão "Sub-agents rodando" e chips nos cartões dos agentes.
  - **Analytics:** aba "Sub-agents", com por agente, por tipo e por dia.
  - **Workflows:** coluna SUB-AGENTS no grafo e KPI novo.
- Status do sub-agent: `rodando`, `concluido`, `erro` e `perdido` (rodando sem nenhum evento há mais de 2 h).

### Alterado
- **Status do agente:** quem tem sub-agent rodando passa a contar como `trabalhando`, mesmo com o terminal parado.
- **ADR-0010 reaberta em parte:** a regra "sem telemetria nova" deixa de valer só para o ciclo de vida de sub-agents. Continua valendo para transcript, saída de ferramenta e prompt.
- **Custo:** cada execução de hook leva cerca de 110 ms, quase tudo boot do Python; a gravação do coletor leva cerca de 0,1 ms. Cada sub-agent gera 4 execuções (`spawn`, `inicio`, `fim`, `retorno`). A `atividade` não gera execução extra.

### Limites
- Com `run_in_background`, o `retorno` diz que o sub-agent subiu, não que terminou. O fim real é o `fim`.
- Terminal sem cadastro não grava nada; hook que falhou e retenção deixam pontas faltando, e a leitura tolera.
- O painel passa a mostrar, mascaradas, linhas de comando e caminhos que antes só existiam no terminal do agente.

### Atualização
- Quem atualiza a skill **precisa rodar o `install.sh` de novo** (`bash ~/.agents/skills/agent-board/scripts/install.sh`) para registrar os hooks novos. Ele preserva os seus outros hooks e faz backup do settings. Sem isso, o painel continua funcionando, mas não mostra sub-agents.

### Testes
- **414 testes Python em 11 suítes:** `test_agent_board` 101, `test_contrato` 26, `test_docs` 2, `test_maestri` 35, `test_mcp` 15, `test_omp` 14, `test_politica` 35, `test_registro` 23, `test_subagentes` 25 (1 pulado), `test_time` 19 e `test_web` 119. Rode com `env -u ORCA_CLI_BIN_DIR` dentro de um terminal do Orca server.
- **211 testes Vitest** do front, em 16 arquivos (`cd web && npx vitest run`).
- A CI roda 10 suítes Python (entrou a `test_subagentes.py`); `test_omp.py` (precisa do `bun`) e o Vitest rodam à mão.

## 1.11.0 — 2026-10-20

Painel web v2: uma SPA com sete telas, atualizada por push. Ver [ADR-0010](docs/adr/0010-painel-v2-spa-com-build-e-sse.md) e o [guia do painel](docs/userguide/painel.md).

### Novo
- **Painel v2** (`painel.py servir`): Dashboard, Kanban (tarefas e agentes), Conversas (lista e detalhe), Activity Feed, Analytics, Workflows e Office (modos Hub, Mapa e Grade, gaveta do agente, Live Logs e modo TV). Continua só leitura, em 127.0.0.1.
- **Tempo real por SSE** (`/api/stream`): o servidor vigia o log (1 s) e o Orca (2 s) e empurra `mensagem`, `agente` e `tarefa`. No lugar do polling de 5 s. Heartbeat de 15 s e no máximo 16 conexões.
- **Multi-projeto:** um servidor atende todos os projetos do cadastro; todas as rotas aceitam `?projeto=`. `--raiz` virou opcional.
- **API nova:** `/api/projetos`, `/api/resumo`, `/api/agentes`, `/api/tarefas`, `/api/conversas`, `/api/mensagens`, `/api/analytics` e `/api/workflows`, mais o status do agente (trabalhando, esperando, pendente, parado, offline) lido do `orca terminal list`. Contrato em [painel-api.md](docs/referencia/painel-api.md).
- **Build commitado** em `scripts/painel_web/`: quem instala não precisa de Node. O código-fonte fica em `web/` (React, Vite, TypeScript, Tailwind). Módulos novos: `painel_dados.py`, `painel_orca.py` e `painel_stream.py`.
- **Base de conhecimento** do produto em [`docs/PRODUTO.md`](docs/PRODUTO.md), com a lista de divergências entre a documentação e o código.
- Guia do painel reescrito e dividido em quatro páginas; plano do v2 em [docs/planos/painel-v2.md](docs/planos/painel-v2.md).

### Alterado
- **CSP sem script inline:** `default-src 'self'; script-src 'self'`, mais `object-src 'none'`, `base-uri 'none'` e `frame-ancestors 'none'`. O `'unsafe-inline'` de script só vale para a página antiga (`painel_web.html`), usada se não houver build.
- **`HEAD` e `OPTIONS` respondem 405**, com os cabeçalhos de segurança (antes caíam no 501 do `http.server`). Só `GET` é aceito.
- Documentação alinhada ao código: a trava de subagent vale também no OMP (desde a 1.10.1); `agents/openai.yaml` cita o Maestri; `SKILL.md` lista todos os subcomandos do `painel.py`; URL de clone `BFLabsAI/agent-board`; números do README e do MELHORIAS atualizados.

### Testes
- **324 testes Python em 10 suítes:** `test_agent_board` 101, `test_contrato` 26, `test_docs` 2, `test_maestri` 35, `test_mcp` 15, `test_omp` 14, `test_politica` 35, `test_registro` 23, `test_time` 19 e `test_web` 54. Rode com `env -u ORCA_CLI_BIN_DIR` dentro de um terminal do Orca server.
- **159 testes Vitest** do front, em 14 arquivos (`cd web && npx vitest run`).
- A CI continua rodando 9 suítes Python; `test_omp.py` (precisa do `bun`) e o Vitest rodam à mão.

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
