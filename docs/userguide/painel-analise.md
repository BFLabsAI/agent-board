# Painel: Analytics e Workflows

> **Em 1 minuto:** as duas telas de análise: Analytics olha os últimos 30 dias e mostra volume e qualidade; Workflows olha o período escolhido e mostra por onde o trabalho passa. Voltar: [Painel do projeto](painel.md).

**Antes:** o painel aberto ([Como abrir](painel.md#como-abrir)).

## Analytics
Números dos **últimos 30 dias**, de **todo** o histórico (log ativo mais arquivo morto). O período da barra lateral não muda esta tela, e o heatmap cobre 371 dias (cerca de 53 semanas).

**Cartões do topo:**
| Cartão | Como é calculado |
|---|---|
| Mensagens | Soma dos 30 dias. Abaixo, a média por dia. |
| Entregas | `entrega` enviadas nos 30 dias. Abaixo, quantas foram aprovadas. |
| Aprovação | Aprovadas ÷ (aprovadas + rejeitadas). Traço enquanto ninguém julgou nada. Abaixo, o número de rejeitadas. |
| Tempo de resposta | O mesmo número do Dashboard (portanto segue o período da barra lateral), com o p90 abaixo. Se ele faltar, usa a mediana dos tempos por agente nos 30 dias. |
| Agentes ativos | Agentes que enviaram ou receberam alguma mensagem nos 30 dias, do total do projeto. |

**Heatmap:** um quadrado por dia, mais intenso quanto mais mensagens. O tom vai de 0 a 4 pela fração do dia mais movimentado (acima de 75%, 50%, 25%). Uma linha por dia da semana, uma coluna por semana.

**Quatro abas:**
| Aba | Gráficos |
|---|---|
| **Atividade** | Mensagens e entregas por dia; tipos de mensagem; mensagens por hora do dia (mostra o horário de pico). |
| **Agentes** | Mensagens por agente (enviadas, recebidas, entregas); ranking de tempo de resposta pela mediana (p50), com o p90 marcado; tabela de detalhe por agente. |
| **Qualidade** | Taxa de rejeição por agente (rejeitadas ÷ julgadas; a barra fica amarela a partir de 15% e vermelha a partir de 30%); alertas de ping-pong; aprovadas × rejeitadas por dia. |
| **Sub-agents** | Sub-agents por agente (total, rodando, com erro e duração média), por tipo e por dia nos 30 dias |

A rejeição conta no agente que **recebeu** o veredito, isto é, o manager que fez a entrega. O botão **Exportar** baixa os dados da tela em JSON.

## Workflows
Por onde o trabalho passa no período escolhido. Cada **conversa** é um pedido com tudo que responde a ele.

**Números do topo** (passe o mouse no "?" de cada um):
| Cartão | Como é calculado |
|---|---|
| Conversas | Conversas iniciadas no período. |
| Taxa de aprovação | Das entregas revisadas pelo master, a fração aprovada. Traço se ninguém revisou. |
| Tempo até entrega (p50) | Mediana do tempo entre o pedido e a primeira entrega. |
| Mensagens por conversa | Média de mensagens por conversa. Número alto indica muito vai e vem. |
| Fluxo mais comum | A sequência de tipos de mensagem que mais se repete. |
| Agentes envolvidos | Agentes que aparecem em alguma conversa do período. |

**Três blocos:**
1. **Grafo de orquestração:** colunas Master → Managers e researchers → Issues → Revisão → Resultado (aprovado, rejeitado, concluído, em aberto ou atrasado). A espessura da linha é o número de conversas que passou por ali. **Clique num nó** para filtrar o resto da página; clique de novo para limpar.
2. **Comunicação:** quem fala com quem. A seta mostra o sentido e a espessura, o volume no período. Passe o mouse num agente para destacar as conversas dele.
3. **Fluxos mais comuns:** os 10 caminhos mais repetidos, por exemplo `pedido → andamento → entrega → resposta:aprovado`, com uma barra comparada ao mais frequente. Tipos repetidos em sequência viram um só.

Uma conversa sem issue liga o executor direto à Revisão; sem entrega, liga direto ao Resultado.

## Sub-agents
Os dados vêm do coletor dos hooks ([como funciona](painel.md#sub-agents)).
- **Analytics:** a aba "Sub-agents" cobre os 30 dias, como o resto da tela.
- **Workflows:** o grafo ganha a coluna **SUB-AGENTS**, com um nó por tipo (`Explore`, `general-purpose`…) e uma linha do agente até ele. O cartão **Sub-agents** conta os disparados no período.

**Próximo:** [Office](painel-office.md)
