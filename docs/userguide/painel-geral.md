# Painel: Visão geral e Office modo Andar

> **Em 1 minuto:** quando você tem mais de um projeto, a Visão geral mostra todos de uma vez, com a saúde de cada um, e o modo Andar do Office dá uma sala animada a cada projeto. Voltar: [Painel do projeto](painel.md).

**Antes:** o painel aberto ([Como abrir](painel.md#como-abrir)) e dois ou mais projetos cadastrados. Com um só, tudo funciona, mas há pouco a comparar.

## O que é um squad
Um **squad** é um projeto do cadastro: o master, os managers, os researchers e os [sub-agents](painel.md#sub-agents) dele. O mesmo servidor já atendia todos os projetos; a Visão geral e o Andar só os mostram juntos. Continua só leitura.

## Visão geral
Fica no **topo do menu**. Abre sozinha quando você entra no painel sem escolher projeto e o cadastro tem mais de um. Com um projeto só, o painel abre no Dashboard dele.

O **período** da barra lateral vale aqui como nas outras telas. O seletor de projeto mostra "Todos os squads"; escolher um projeto leva ao Dashboard dele.

### Totais
Oito cartões, somando todos os squads:

| Cartão | O que soma |
|---|---|
| Squads e Agentes | Projetos do cadastro e agentes deles |
| Trabalhando agora | Agentes com status `trabalhando` |
| Esperando você | Agentes parados numa pergunta para o humano |
| Sub-agents rodando | Sub-agents com status `rodando` |
| Pedidos abertos | Tarefas `aberto`, `em andamento` ou `atrasado` |
| Atrasados | Pedidos com prazo vencido e sem resposta |
| Entregas p/ revisar | Entregas ao master sem veredito |

### Um card por squad
Cada card traz o nome, o selo de saúde, os números do squad, os agentes (com status), os sub-agents rodando, a última mensagem e dois botões: **Abrir squad** (o Dashboard dele) e **Office**. O card pulsa quando chega mensagem nova.

| Selo | Quando |
|---|---|
| **Crítico** | A cadeia de hash do log não está íntegra, ou há pedido atrasado. Também aparece para um projeto que o servidor não consegue ler (raiz sumida ou configuração ilegível), com o motivo no card |
| **Atenção** | Há agente esperando você, mensagem pendente ou ping-pong |
| **Saudável** | Nenhuma das anteriores |

Os cards ficam em ordem: críticos, atenção, saudáveis; dentro de cada grupo, por nome. Um projeto quebrado não derruba os outros.

### Feed unificado
À direita, as mensagens de todos os squads intercaladas, da mais nova para a mais antiga, cada uma com o nome do projeto. As notas ficam de fora. Dá para filtrar por squad e carregar mais. Para filtros finos, use o [Activity Feed](painel-telas.md#activity-feed) de um projeto.

A tela atualiza sozinha por um único stream para todos os projetos. Ele conta uma das 16 conexões do servidor.

## Office modo Andar
Abra pelo botão **Office do andar** da Visão geral, ou pelo seletor de modo do Office (`/office?modo=andar`). O endereço é compartilhável.

Cada squad ganha **uma sala isométrica**, com o master no centro, os managers e os researchers ao redor e os sub-agents rodando em volta dos pais. O fundo é o mesmo canvas do Hub: arraste e use os botões de zoom.

| O que você vê | O que significa |
|---|---|
| Placa sob a sala | Nome do squad e selo de saúde. Clicar entra no [Office](painel-office.md) do squad |
| Pulso de luz entre duas mesas | Mensagem nova, de quem enviou para quem recebeu, ao vivo |
| Robô, balão, post-its | O mesmo do [Hub](painel-office.md#hub-padrão) |
| Sala "Sem agentes cadastrados" | O squad existe, mas nenhum painel dele está cadastrado |
| Sala com o aviso "Não foi possível ler este squad" | Raiz sumida ou configuração ilegível |

Cada sala mostra no máximo alguns pulsos ao mesmo tempo, para não embolar. Clicar num agente abre a [gaveta](painel-office.md#gaveta-do-agente) dele, com as tarefas do squad dele.

### Modo TV
O botão **Modo TV** do Office funciona aqui também: tela cheia só com as salas, para deixar numa TV da sala. Saia com o botão ou `Esc`. `?tv=1` na URL abre direto em modo TV.

## Se der errado
| Você vê | Faça |
|---|---|
| A Visão geral não abre sozinha | Só abre sozinha com mais de um projeto e sem `?projeto=` na URL. Use o item **Visão geral** do menu |
| Squad crítico com o aviso de raiz ou configuração | Confira o caminho no cadastro (`painel.py listar`) e o `docs/agent-board/agent-board.json` do projeto |
| Squad novo não aparece | O servidor relê o cadastro a cada 5 s; um projeto sem painel cadastrado não entra |
| Feed vazio | Nenhum squad trocou mensagens ainda, ou só há notas |

Contrato das rotas: [Visão geral e multi-squad](../referencia/painel-api.md#visão-geral-e-multi-squad-113).

**Voltar ao início:** [Painel do projeto](painel.md)
