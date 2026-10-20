# Painel: Dashboard, Kanban, Conversas e Activity Feed

> **Em 1 minuto:** o que cada uma das quatro telas do dia a dia mostra e como cada número é calculado. Voltar: [Painel do projeto](painel.md).

**Antes:** o painel aberto ([Como abrir](painel.md#como-abrir)). O **período** da barra lateral (Hoje, 24 h, 7 dias) vale onde o texto disser "no período".

## Dashboard
A visão geral do projeto, ao vivo.

**Faixa de alertas** (só aparece se houver algo):
- cadeia de hash não íntegra (mesmo resultado de `painel.py verificar`);
- ping-pong: um par que trocou mais de `limites.ping_pong_max` mensagens em `ping_pong_janela_min` min sem entrega (sem essas chaves, o painel usa 12 em 10 min, e o hook não avisa ninguém);
- tarefas atrasadas, com link para o Kanban.

**Cartões de números:**
| Cartão | Como é calculado |
|---|---|
| Agentes trabalhando | Agentes com status `trabalhando` ([heurística](#como-o-status-do-agente-é-decidido)). Abaixo, quantos estão esperando você. |
| Pedidos abertos | Tarefas em `aberto`, `em andamento` ou `atrasado`, no log ativo inteiro. Abaixo, quantas atrasaram. |
| Pendentes | Soma das mensagens recebidas e sem resposta de todos os agentes (a regra que o Stop cobra). Abaixo, em quantos agentes. |
| Atrasados | Pedidos com prazo vencido e sem resposta. Fica vermelho acima de zero. |
| Aguardando revisão | `entrega` ao master ainda sem `resposta --veredito`. |
| Tempo de resposta | Média, em minutos, entre uma mensagem e a primeira `resposta` ou `andamento` a ela, só para respostas dadas no período. Abaixo, o p90 (9 em cada 10 respostas saíram em menos que isso). |
| Mensagens | Mensagens no período (sem notas e sem linhas de status). Abaixo, a contagem do período anterior. |
| Entregas | `entrega` enviadas no período. |

**Agentes:** um cartão por agente, com status, tarefa atual (o pedido aberto mais recente em que ele é o destino), as últimas linhas da tela do terminal e o número de pendentes.
**Atividade recente:** as 12 últimas mensagens; as novas entram no topo na hora.

## Kanban
Dois modos, no botão do topo. Busca e filtro por agente valem nos dois.

### Modo Tarefas
O quadro derivado do log (o mesmo de `painel.py tarefas`). Um cartão por pedido ou entrega: assunto, de → para, último andamento, prazo, issues e branch.

| Coluna | Entra quando | Sai quando |
|---|---|---|
| Atrasado | O prazo venceu e ainda não chegou resposta. | Chega a resposta do destino. |
| Aberto | Um pedido foi enviado. | Chega um andamento ou uma resposta. |
| Em andamento | O destino mandou um andamento. | Chega a resposta. |
| Aguardando revisão | Uma entrega foi enviada ao master. | O master responde com veredito. |
| Aprovado | O master respondeu a entrega com veredito aprovado. | Não sai: fica enquanto estiver no período escolhido. |
| Rejeitado | O master respondeu a entrega com veredito rejeitado. | Não sai: fica enquanto estiver no período escolhido. |
| Concluído | Chegou a resposta do pedido, sem veredito. | Não sai: só aparecem as fechadas no período escolhido; o resto fica no histórico. |

Uma `entrega --responde-a <pedido>` também fecha o pedido. Passe o mouse no "?" ao lado do título de cada coluna para ver essas regras na tela.

### Modo Agentes
Uma coluna por status do agente:

| Coluna | Entra quando | Sai quando |
|---|---|---|
| Trabalhando | A tela do terminal mostra atividade em andamento. | A tela para de mudar ou pede uma resposta sua. |
| Esperando você | O terminal está parado numa pergunta ou confirmação para o humano. | Você responde no terminal. |
| Com pendente | Recebeu mensagem que ainda não respondeu. | Responde a todas as mensagens. |
| Parado | Terminal aberto, sem atividade e sem pendência. | Volta a trabalhar ou recebe uma mensagem. |
| Offline | O painel cadastrado não está mais aberto no Orca, ou o estado é desconhecido (agentes do Maestri). | O terminal volta a abrir ou é recadastrado. |

### Como o status do agente é decidido
É uma **heurística** sobre o que o `orca terminal list` informa, e vale a primeira regra que bater:

1. **Desconhecido:** o agente é do Maestri, ou o `orca` não respondeu. Aparece na coluna Offline.
2. **Offline:** o handle não está aberto no Orca.
3. **Esperando você:** nas últimas 15 linhas não vazias da tela aparece `Do you want`, `[y/n]`, `Allow`, `❯ 1.` ou `permission`.
4. **Trabalhando:** o título do terminal começa com um spinner (braille, `◐◓◑◒` ou `✻✽✶·`; o `✳` do Claude parado não conta) **ou** houve saída há menos de 10 s.
5. **Com pendente:** tem mensagem recebida sem resposta.
6. **Parado:** o resto.

Como depende do formato do título e da tela, uma versão nova do Orca ou do agente pode errar o status. Nesse caso o agente cai em "Parado".

## Conversas
Cada pedido (ou entrega) com a sua **thread**: ele mais tudo que responde a ele, direta ou indiretamente.

**Lista:** busca por assunto, id ou issue; filtros de estado e de agente; colunas ordenáveis (assunto, estado, mensagens, duração, início, fim). Só entram conversas cuja última mensagem cai no período. Duração é do início ao fim da thread.

**Detalhe** (clique numa linha): quatro etapas do ciclo (pedido, andamento, entrega, revisão ou veredito), com o tempo entre uma e outra, e a timeline de todas as mensagens, com participantes, issues, branch e prazo. O endereço da conversa pode ser compartilhado.

## Activity Feed
As mensagens do board ao vivo, da mais nova para a mais antiga, notas incluídas.

- **Filtros:** agente (casa com quem enviou ou recebeu), tipo, issue, datas "de" e "até" e busca em assunto, id e issue. Sem datas, vale o período da barra lateral. Os filtros ficam na URL: o link é compartilhável.
- **Agrupar por conversa** (padrão) junta as mensagens da mesma thread sob o pedido que a originou. **Lista** mostra uma linha por mensagem.
- **Pausar:** congela a tela para você ler. As mensagens novas esperam e entram quando você clica em **Retomar**.
- **Clique numa mensagem** para ver todos os campos do log (sem o `prev`).
- O bloco "Sobre mensagens, filtros e agrupamento" explica os tipos (`pedido`, `andamento`, `entrega`, `resposta`, `nota`).

**Próximo:** [Analytics e Workflows](painel-analise.md)
