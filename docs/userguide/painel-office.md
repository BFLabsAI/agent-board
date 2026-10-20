# Painel: Office

> **Em 1 minuto:** o time visto como um escritório ao vivo, em quatro modos (Hub, Mapa, Grade e Andar), com a tela de cada agente numa gaveta, o feed de mensagens por cima (Live Logs) e um modo TV para deixar numa tela da sala. Voltar: [Painel do projeto](painel.md).

**Antes:** o painel aberto ([Como abrir](painel.md#como-abrir)) e agentes cadastrados. Sem agentes, a tela avisa e não mostra nada.

## Os quatro modos
O seletor fica no topo. O modo escolhido vai para a URL (`?modo=mapa`), então o link é compartilhável. O **Andar** tem [página própria](painel-geral.md#office-modo-andar). Em Hub e Mapa, o fundo é um canvas que você **arrasta** e aproxima com os botões **+**, **−**, **Ajustar à tela** e **Travar** (trava o zoom e o arraste).

### Hub (padrão)
Um escritório isométrico. O **master** fica numa sala de vidro no centro, os **managers** em mesas ao redor e os **researchers** à parte.

| O que você vê | O que significa |
|---|---|
| Robô digitando, pensando ou parado | O status do agente ([como é decidido](painel-telas.md#como-o-status-do-agente-é-decidido)) |
| Balão "esperando você" | O terminal pede uma resposta humana |
| Cadeira vazia, mesa apagada | Offline: o terminal não está aberto |
| Post-its na mesa | Um por mensagem pendente. Ficam **vermelhos** se algum pedido desse agente passou do prazo |
| Pulso de luz correndo entre duas mesas | Uma mensagem nova, de quem enviou para quem recebeu |
| Balão de fala por 4 s no remetente | O assunto da mensagem |
| Mesa piscando | O agente recebeu uma resposta com veredito rejeitado |

Para não embolar, no máximo 4 pulsos viajam ao mesmo tempo, e os excedentes esperam numa fila. Quem pede "reduzir movimento" no sistema operacional vê as animações simplificadas.

### Mapa
Organograma do time. O botão **Hierarquia** põe o master no topo, os managers abaixo e os researchers embaixo. **Times** agrupa em colunas por **harness** (`cc`, `omp`, `maestri`) ou por **worktree**. Cada cartão mostra o agente, o status e as tarefas abertas dele.

### Grade
Um cartão rico por agente:
- avatar, status, harness e worktree;
- **atividade de 14 dias** (mensagens enviadas por dia; a última barra é hoje);
- **entregas dos últimos 7 dias** e a barra de **taxa de aprovação** (aprovadas ÷ aprovadas + rejeitadas, também em 7 dias);
- **resposta p50**: a mediana do tempo que o agente leva para responder;
- a tarefa atual.

No alto, três contadores: ativos, precisam de você e offline. Filtre por status (Todos, Trabalhando, Esperando, Pendente, Parado, Offline) e ordene por Status, Nome ou Atividade.

## Sub-agents no Office
Os sub-agents de cada agente aparecem em todos os modos ([o que são e os limites](painel.md#sub-agents)).

| Modo | O que você vê |
|---|---|
| Hub | Mini-robôs (drones) em órbita da mesa do pai, um por sub-agent rodando (até o limite de lugares ao redor da mesa) |
| Mapa | Só os rodando viram sub-card, ao lado do pai e ligados por um conector. Rodando pulsa; `perdido` é tracejado; o que passa do limite vira um chip "+N". Os terminados viram uma linha de resumo; clicar nela abre a gaveta |
| Grade | No cartão: sub-agents rodando e iniciados hoje, os últimos 7 dias e os avatares dos que rodam |

## Gaveta do agente
Clique em qualquer agente (nos três modos) para abrir uma gaveta à direita. Clique de novo, no **X** ou em `Esc` para fechar.

| Seção | O que mostra |
|---|---|
| Tela do terminal | A última tela do terminal, vinda do Orca, atualizada ao vivo. Pode estar vazia se o terminal estiver fechado |
| Tarefa atual | O pedido aberto mais recente em que ele é o destino |
| Pendentes | As mensagens que ele ainda não respondeu |
| Sub-agents | Duas listas, **Rodando** e **Terminados** (nas últimas 24 h): nome (`subagent-cc` ou `subagent-omp`), tipo, descrição, duração, última ação, tarefa de origem e a marca "em segundo plano" |
| Últimas mensagens | As trocas mais recentes dele |
| Ver conversas | Abre a tela [Conversas](painel-telas.md#conversas) filtrada por ele |

A tela do terminal é só um retrato: o painel não digita no terminal.

## Live Logs
O botão **Live Logs**, no canto da tela, abre por cima um feed com as últimas 40 mensagens do projeto; as novas entram no topo na hora. Para filtrar, agrupar ou pausar, use o [Activity Feed](painel-telas.md#activity-feed).

## Modo TV
Botão **Modo TV** no topo: a tela cheia do navegador mostra só o escritório, com o seletor de modo e o botão de sair no canto. Serve para deixar numa TV da sala. Saia pelo botão **Sair do modo TV** ou com `Esc` (que sai da tela cheia).

Dica: `?tv=1` na URL abre direto em modo TV, mas o navegador só entra em tela cheia por um clique seu.

**Voltar ao início:** [Painel do projeto](painel.md)
