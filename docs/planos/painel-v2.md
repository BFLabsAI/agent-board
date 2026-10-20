# Plano: painel v2 (branch `feat/painel-v2`)

Referência visual: [7P3ng/Claude-Code-Agent-Monitor](https://github.com/7P3ng/Claude-Code-Agent-Monitor), com sidebar escura e as telas Dashboard, Kanban, Sessions, Activity Feed, Analytics e Workflows. Mantemos a linguagem visual e trocamos o conteúdo pelo que o agent-board sabe: o time, as mensagens, as tarefas e o terminal de cada agente. Também entra uma tela nova, o **Office**.

## Decisões (CEO, 2026-10-20)

- **Front**: React + Vite + TypeScript + Tailwind, código em `web/` e build commitado em `scripts/painel_web/`. O runtime da skill segue só Python stdlib, e quem instala não precisa de Node.
- **Acesso**: continua em 127.0.0.1 com túnel SSH (`ssh -L`).
- **Sem telemetria nova**: nenhum hook novo e nada de transcript. O painel usa só o que já existe.
- **Office**: canvas com zoom no estilo das referências (hub com robôs/avatares e linhas de conexão, organograma tipo ClawPort, cards ricos tipo Trinity/Manager Workspace).

## 1. Fontes de dado (só as que já existem)

| Fonte | O que dá |
|---|---|
| `docs/agent-board/comunicacoes.jsonl` (+ `arquivo/`) | mensagens, pedidos, andamentos, entregas, revisões, notas, issues, branch, prazos |
| `~/.agent-hooks/agent-board/paineis.json` | agente, papel, projeto, worktree, quando foi cadastrado |
| `orca terminal list --json` | terminal aberto, spinner no `title` (trabalhando ou parado), `preview` (o que está na tela), `lastOutputAt`, `agentIdentity` (claude/omp), `incarnationId` (sessão do terminal) |
| `avisos.log`, `pendentes/`, `cobrancas/` | avisos digitados e cobranças do Stop |
| `docs/agent-board/notas/` | notas e decisões |

Fica de fora, porque exigiria telemetria: custo, tokens, ferramenta por ferramenta e subagentes.

## 2. Arquitetura

```
comunicacoes.jsonl ─┐
paineis.json ───────┤
avisos/pendentes ───┼─► cmd_web.py (stdlib) ──► /api/*       JSON para a carga inicial
orca terminal list ─┘   (vigia arquivos 1 s,  └► /api/stream  SSE: push de deltas
                         Orca a cada 2 s)              │
                                   SPA React (scripts/painel_web/, build commitado)
```

- **Push, não polling**: quem vigia o log e o Orca é o servidor, e ele empurra os eventos `mensagem`, `status_agente` e `tarefa` por SSE. A página só reconecta se a conexão cair.
- **Multi-projeto**: um servidor só para todos os projetos do cadastro, com seletor de projeto na sidebar e `--raiz` opcional.
- **Continua valendo da ADR 0005**: só leitura, 127.0.0.1, checagem de Host, CSP `'self'` sem CDN, e conteúdo do log tratado como não confiável (`dangerouslySetInnerHTML` proibido por lint). A ADR **0010** substitui só o "sem build" e o polling de 5 s.
- **Status do agente** (heurística isolada e testada): `trabalhando` quando há spinner no título ou saída há menos de 10 s; `esperando você` quando a preview pede confirmação; `com pendente` quando há mensagem sem resposta; `parado`; `offline` quando não há terminal.

## 3. Telas

| Tela | Conteúdo |
|---|---|
| **Dashboard** | KPIs: agentes trabalhando, pedidos abertos, pendentes, atrasados, aguardando revisão, tempo de resposta p50/p90, mensagens hoje, entregas hoje. Depois, cards dos agentes (status, tarefa atual, tela do terminal) e atividade recente. |
| **Kanban** | Toggle **Tarefas**: Pedido → Em andamento → Aguardando revisão → Aprovado / Rejeitado, com raia de Atrasado. Toggle **Agentes**: Trabalhando / Esperando você / Com pendente / Parado / Offline. |
| **Sessions** | Vira **Conversas**: cada pedido com sua thread (andamentos, respostas, entrega, revisão), mais a duração, os participantes, as issues e a branch. A lista é filtrável, e o detalhe tem uma timeline igual à da referência. |
| **Activity Feed** | Stream das mensagens do board ao vivo, com filtros (agente, tipo, issue), busca, pausa, agrupamento por tarefa, e os avisos e cobranças entrando como eventos de sistema. |
| **Analytics** | Heatmap de 52 semanas, mensagens e entregas por dia, tempo de resposta por agente, taxa de rejeição, entregas por manager, alertas de ping-pong, horários de pico. |
| **Workflows** | Mesma view (grafo em colunas e Sankey). Colunas: Master → Managers → Issues → Revisão → Resultado. Também tem o grafo de comunicação (espessura = volume) e os fluxos mais comuns. |
| **Office** (nova) | Ver a seção 4. |

## 4. Office

Canvas com zoom e arraste (botões + / − / ajustar, como no ClawPort e no Trinity), modo TV em tela cheia, e três modos no mesmo canvas:

1. **Hub** (padrão, referência do robô isométrico): o master fica numa plataforma central iluminada, a "sala" dele isolada por um anel. Os managers ficam em mesas ao redor, e o researcher num ponto à parte. Cada agente é um avatar/robô cujo estado aparece na animação: digitando, pensando, balão "esperando você", cadeira vazia quando está offline. **Cada mensagem vira um pulso de luz** que corre pela linha de uma mesa até a outra, com cor por tipo (pedido, andamento, entrega, rejeição), e um balão mostra o assunto por alguns segundos. Os post-its na mesa são as pendentes e ficam vermelhos quando atrasam. Feito em SVG com animação CSS e Framer Motion, em perspectiva isométrica.
2. **Mapa** (ClawPort): organograma com o master no topo, os managers abaixo e as tarefas abertas penduradas em cada um, com um toggle Times / Hierarquia.
3. **Grade** (Trinity / Manager Workspace): um card rico por agente, com avatar, status, harness (CC/OMP), worktree, sparkline de atividade de 14 dias, entregas, taxa de aprovação, tempo de resposta e tarefa atual.

Clicar em qualquer agente abre uma gaveta com o trabalho dele: a tela do terminal (preview do Orca, ao vivo), a tarefa atual, as últimas mensagens e um link para Conversas. No canto fica o botão **Live Logs**, que abre o feed por cima.

## 5. Fases

| Fase | Entrega | Trilhas paralelas |
|---|---|---|
| 0. Desenho | ADR 0010; tokens do design system; mockups de Dashboard e Office (Hub/Mapa/Grade) para aprovar | — |
| 1. Fundações | API nova (`/api/agentes`, `/api/tarefas`, `/api/mensagens`, `/api/analytics`) + SSE `/api/stream` + leitura de status do Orca; casca da SPA (sidebar, rotas, tema, seletor de projeto, indicador Live, cliente SSE) | 2 (back, front) |
| 2. Telas base | Dashboard, Kanban, Activity Feed | 3 |
| 3. Profundidade | Conversas + detalhe, Analytics | 2 |
| 4. Workflows | grafo em colunas, Sankey, grafo de comunicação | 1 |
| 5. Office | Hub isométrico com pulsos, Mapa, Grade, gaveta, modo TV | 2 (Hub; Mapa+Grade) |
| 6. Fechamento | `test_web.py` (API + SSE), Vitest, Playwright de fumaça, `userguide/painel.md`, CHANGELOG, versão 1.11.0, merge na `main` e atualização do clone da skill | — |

Cada trilha roda em worktree própria a partir de `feat/painel-v2` e volta por merge nessa branch. A `main` só recebe tudo no final.

## 6. Riscos

- **Status vindo do Orca é heurístico**: o formato do título e da preview pode mudar. Fica numa função com teste e cai para `parado` quando não reconhece.
- **Peso do build no repo**: o alvo é menos de 600 KB gzip, com chunk separado para Workflows e Office.
- **SSE no `http.server`**: precisa de `ThreadingHTTPServer` com threads daemon e heartbeat a cada 15 s. O teste cobre reconexão e o limite de conexões.
