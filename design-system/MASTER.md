# Design system do painel v2

Fonte única dos tokens do painel web (`web/`). O mesmo conjunto vive em `web/tailwind.config.js`: mudou aqui, muda lá. Referência de linguagem visual: painel escuro, sidebar com item ativo em índigo, cards com borda sutil, rótulos em caixa alta espaçada, ícones Lucide, badges com bolinha.

## Princípios

- Escuro por padrão e só escuro (`color-scheme: dark`). Contraste mínimo AA no texto.
- Português do Brasil em toda a UI. Datas e números com `pt-BR`.
- Cor carrega significado: papel, status e tipo de mensagem têm paleta própria e não se misturam.
- Conteúdo vindo do log é texto: nunca HTML (`react/no-danger` é erro de lint).
- Telas novas usam os componentes de `web/src/components/ui/`. Não recrie card, badge ou cabeçalho.

## Cores: superfície e texto

| Token Tailwind | Hex | Uso |
|---|---|---|
| `surface-0` | `#06060a` | fundo da página |
| `surface-1` | `#0c0c14` | sidebar, trilhos |
| `surface-2` | `#13131e` | inputs, blocos internos |
| `surface-3` | `#1a1a28` | cards |
| `surface-4` | `#222233` | hover de card, chips |
| `surface-5` | `#2a2a3d` | tooltip, realces |
| `border` / `border-light` | `#2a2a3d` / `#363650` | bordas |
| `accent` / `accent-hover` | `#6366f1` / `#818cf8` | item ativo, foco, ações |
| `accent-muted` | `rgba(99,102,241,.15)` | fundo do item ativo |
| `texto` | `#e4e4ed` | texto principal |
| `texto-suave` | `#9ca3af` | subtítulos, rótulos |
| `texto-fraco` | `#6b7280` | metadados, placeholders |

## Cor por papel

| Papel | Token | Hex |
|---|---|---|
| master | `papel-master` | `#f59e0b` (âmbar) |
| manager | `papel-manager` | `#6366f1` (índigo) |
| researcher | `papel-researcher` | `#10b981` (esmeralda) |

O avatar (`AgentAvatar`) e os nós do Office usam essa cor. Papel desconhecido cai em manager.

## Cor por status do agente (`StatusAgente`)

| Status | Token | Hex | Rótulo |
|---|---|---|---|
| trabalhando | `status-trabalhando` | `#34d399` | Trabalhando (bolinha pulsa) |
| esperando | `status-esperando` | `#fbbf24` | Esperando você |
| pendente | `status-pendente` | `#fb923c` | Com pendente |
| parado | `status-parado` | `#94a3b8` | Parado |
| offline | `status-offline` | `#64748b` | Offline |
| desconhecido | `status-desconhecido` | `#475569` | Desconhecido |

## Cor por estado da tarefa (`EstadoTarefa`)

| Estado | Token | Hex | Rótulo |
|---|---|---|---|
| aberto | `tarefa-aberto` | `#60a5fa` | Aberto |
| em_andamento | `tarefa-em_andamento` | `#818cf8` | Em andamento |
| atrasado | `tarefa-atrasado` | `#f87171` | Atrasado |
| concluido | `tarefa-concluido` | `#2dd4bf` | Concluído |
| aguardando_revisao | `tarefa-aguardando_revisao` | `#fbbf24` | Aguardando revisão |
| aprovado | `tarefa-aprovado` | `#34d399` | Aprovado |
| rejeitado | `tarefa-rejeitado` | `#fb7185` | Rejeitado |

## Cor por tipo de mensagem

| Tipo | Token | Hex | Observação |
|---|---|---|---|
| pedido | `msg-pedido` | `#60a5fa` | |
| andamento | `msg-andamento` | `#a78bfa` | |
| entrega | `msg-entrega` | `#34d399` | |
| resposta | `msg-resposta` | `#2dd4bf` | resposta com `veredito: aprovado` |
| rejeição | `msg-rejeicao` | `#fb7185` | resposta com `veredito: rejeitado` |
| nota | `msg-nota` | `#94a3b8` | nota e tipos desconhecidos |

A regra está em `web/src/lib/cores.ts` (`chaveTipoMsg`). Os pulsos do Office usam esses mesmos hex.

## Tipografia

| Uso | Fonte | Tamanho / peso |
|---|---|---|
| UI | Inter Variable (empacotada, sem CDN) | base 14 px; nav 15 px; título de página 20 px / 600 |
| Valor de KPI | Inter | 30 px / 600 |
| Rótulo de card | Inter | 12 px / 500, caixa alta, `tracking-[0.12em]`, `texto-suave` |
| Rótulo de seção na sidebar | Inter | 10 px / 500, caixa alta, `tracking-[0.14em]`, `texto-fraco` |
| Código, ids, tela do terminal | JetBrains Mono 400/500 | 12 a 13 px |

## Espaçamento, raio e sombras

- Gutter da página: `px-10 py-8`. Grade de cards: `gap-4`, três colunas no Dashboard. Padding de card: `p-5` (StatCard `p-6`).
- Escala de 4 px do Tailwind. Seções separadas por `mb-6` a `mb-8`.
- Raio: card `rounded-xl` (12 px), botão e input `rounded-lg` (8 px), badge `rounded-full`, avatar `rounded-[11px]`.
- Sombras: `shadow-card` (brilho interno de 1 px mais queda suave) em cards; `shadow-glow` para foco/seleção no Office.
- Sidebar: 256 px aberta, 76 px recolhida. Item ativo: `border-accent/25 bg-accent-muted text-accent-hover`.

## Animações

| Nome | Efeito | Uso |
|---|---|---|
| `animate-pulse-dot` | opacidade 1 → 0,4 em 2 s | bolinha de "trabalhando" |
| `animate-fade-in` | opacidade 0 → 1 em 0,3 s | estados vazios, entrada de tela |
| `animate-slide-up` | sobe 8 px e aparece em 0,3 s | itens novos no feed |
| `animate-shimmer` | gradiente deslizante em 1,6 s | `Skeleton` |
| `animate-pulse-slow` | pulse em 3 s | halos do Office |

Transições de cor e borda: 150 a 200 ms. Com `prefers-reduced-motion`, todas as durações caem para ~0 (regra global em `index.css`). Animações complexas (Office) usam Framer Motion.

## Componentes compartilhados (`web/src/components/ui/`)

| Componente | Para quê |
|---|---|
| `PageHeader` | ícone + título + subtítulo + ações à direita |
| `StatCard` | KPI: rótulo em caixa alta, valor grande, ícone colorido, subtexto |
| `Card` | contêiner padrão; `interativo` realça a borda no hover |
| `Badge`, `StatusBadge`, `TipoMsgBadge` | rótulos com bolinha, coloridos pelos tokens acima |
| `StatusDot` | bolinha de status isolada |
| `AgentAvatar` | robô SVG determinístico por nome, cor por papel, bolinha de status opcional |
| `Segmented` | toggle tipo "Agentes / Tarefas" |
| `EmptyState`, `Skeleton` | vazio e carregando |
| `TempoRelativo` | "há 4 min", atualiza sozinho |
| `Tooltip` | dica ao passar o mouse ou focar |

Navegação entre telas: use `LinkPainel` (`web/src/components/LinkPainel.tsx`), que preserva `?projeto=`, `?periodo=` e `?tv=1`.
