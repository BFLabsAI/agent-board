# Painel do projeto (painel web)

Mockup: [`design-system/mockups/painel-mockup.svg`](../../design-system/mockups/painel-mockup.svg) · Decisão: [ADR-0005](../adr/0005-painel-web-local-somente-leitura.md)

## Para que serve
Mostrar, numa página só, o que o time de agentes de um projeto está fazendo: quem fala com quem, o que está pendente ou atrasado, o que espera revisão, e as notas e decisões registradas. É a resposta para "o que aconteceu enquanto eu estava fora?" sem ler `avisos.log` nem rodar `jq`.

O painel **só mostra**. Ele não envia mensagem, não cadastra painel e não muda o log. Toda ação continua no terminal (`orca`, `painel.py`) ou nas ferramentas MCP, onde as regras do time valem e tudo fica registrado.

## Quem usa
| Perfil | Uso |
|---|---|
| **CEO / humano responsável** | Acompanha o time, vê atrasos e gargalos, decide onde intervir. |
| **Master** | Usa como radar: entregas para revisar, escalações, ping-pong, painéis a recadastrar. |
| Managers e researchers | Não precisam. Os agentes usam `painel.py historico` / `tarefas` ou o MCP, que gastam menos tokens. |

Não há login: o painel escuta só em `127.0.0.1`. Quem tem acesso à máquina vê o painel; de fora, só por túnel SSH.

## Como abrir
```bash
python3 ~/.agents/skills/agent-board/scripts/painel.py servir --raiz <project-path>
# abre em http://127.0.0.1:8765
```
Servidor remoto: `ssh -L 8765:127.0.0.1:8765 <servidor>` e abra `http://127.0.0.1:8765` no seu computador. Para outra porta: `--porta 9000`. Para parar: `Ctrl+C`.

## As áreas da tela

### Barra superior
- **Projeto e versão** do agent-board.
- **Selo da cadeia de hash**: verde "Cadeia íntegra · N linhas" ou vermelho "Log adulterado" (mesmo resultado de `painel.py verificar`). Vermelho → rode `verificar` no terminal para ver as linhas e investigue antes de qualquer merge.
- **Período**: Hoje, 24 h ou 7 dias. Vale para Mensagens, Tempo médio de resposta, o mapa, a linha do tempo e as tarefas concluídas. Pendentes, Atrasados, Revisão e tarefas abertas contam o log ativo inteiro, qualquer que seja a idade.
- **Atualizado há N s**: a página se atualiza sozinha a cada 5 s. Se o número passar de ~5 s e continuar subindo, o servidor caiu ou o túnel fechou.

### Indicadores
| Indicador | Como é calculado |
|---|---|
| Mensagens hoje | Linhas de mensagem no período (sem status e notas), com a variação contra o período anterior. |
| Pendentes | Mensagens recebidas (não `resposta`) sem resposta, em quantos agentes. É o que o Stop cobra. |
| Atrasados | Pedidos com prazo vencido e sem resposta (todo o log ativo). Fica vermelho quando > 0. |
| Entregas aguardando revisão | `entrega` ao master sem `resposta --veredito`. Mostra a mais antiga. |
| Tempo médio de resposta | Entre uma mensagem e a primeira resposta ou andamento a ela, para respostas dentro do período, com o p90. |

### Mapa do time
- Um nó por agente cadastrado no projeto, em camadas: master no topo, managers no meio, researchers embaixo. Cor pelo papel (roxo, azul, verde); o código depois do nome é o runtime (`cc`, `omp`, `cx`…).
- Nos managers com worktree, a branch real aparece embaixo do nome (`ab/<agente>`, com o nome completo do agente).
- **Bolinha vermelha com número** = mensagens pendentes daquele agente (mesma regra do Stop).
- **Seta**: mensagens de um agente para outro no período; a espessura cresce com o volume.
- **Seta tracejada vermelha**: ping-pong (mais de `limites.ping_pong_max` mensagens entre o par em `ping_pong_janela_min` min, sem entrega; sem essas chaves, o painel usa 12 em 10 min, e o hook não avisa ninguém).
- **Nó cinza tracejado**: painel do cadastro que não está mais aberto no Orca → recadastrar (`painel.py listar` / `cadastrar`).
- **Agente do Maestri**: mostra `maestri · <nome no canvas>` embaixo do nome e nunca fica cinza, porque o Maestri não lista terminais por ID.
- **Clique num agente**: filtra Tarefas e Linha do tempo por ele. Clique de novo para limpar.

### Tarefas
Quadro derivado do log (o mesmo de `painel.py tarefas`), uma coluna por estado:

| Coluna | Entra quando | Sai quando |
|---|---|---|
| Aberto | `pedido` enviado | chega `andamento` ou `resposta` |
| Em andamento | destino mandou `andamento` | chega `resposta` |
| Atrasado | prazo venceu sem `resposta` | chega `resposta` |
| Revisão | `entrega` ao master | master responde com `--veredito` |
| Concluído | `resposta` (com ✓ aprovado / ✗ rejeitado nas entregas) | — (só as fechadas no período escolhido; o resto no histórico) |

Cada cartão: assunto, destino (ou remetente → master nas entregas), último andamento, prazo, issues e branch; até 6 por coluna. Abaixo do quadro: **alertas de ping-pong** e **pendências por agente** (barra proporcional).

### Linha do tempo
Mensagens do período (sem notas), da mais nova para a mais antiga, até 80 linhas: hora, tipo (cor do chip), de → para, assunto e id. Atrasos aparecem na coluna Atrasado e o ping-pong nos alertas abaixo de Tarefas. A busca filtra por assunto, agente ou id. **Clique numa linha** → abre a conversa inteira (o pedido, os andamentos e a resposta, ligados por `responde_a`).

O corpo das mensagens não aparece: ele não fica no log (só o assunto).

### Notas e decisões
Últimas notas de `docs/agent-board/notas/`, com as **Decisões** destacadas em roxo: tema, título, autor e quando. Notas são escritas só com `painel.py nota`, nunca pelo painel.

## Situações de exceção
| Você vê | Significa | O que fazer |
|---|---|---|
| "Log adulterado" em vermelho | `verificar` achou linha editada ou apagada | `painel.py verificar --raiz …` para ver quais; recupere pelo git. |
| `servir` sai com "não tem docs/agent-board/agent-board.json" | `--raiz` errada ou projeto sem `init` | Confira o caminho ou rode `painel.py init`. |
| `servir` sai com "não consegui abrir 127.0.0.1:8765" | Outro processo usa a porta | `--porta 9000`. |
| Linha "linha ilegível ignorada" no `avisos.log` | Linha corrompida no log (merge ruim, corte) | O painel segue sem ela; corrija o arquivo pelo git e rode `verificar`. |
| Mapa vazio | Nenhum painel cadastrado para o projeto | `painel.py listar` e `cadastrar`. |
| "Atualizado há N s" passando de ~5 s e subindo | Servidor caiu ou túnel SSH fechou | Reabra o `servir` / o túnel. |

## Regras de negócio visíveis
- Só aparece o que está no log ativo e no cadastro. O arquivo morto (`arquivar`) fica fora; o `arquivar` nunca move mensagem que ainda espera resposta.
- Pendente segue a mesma regra do hook: mensagem recebida, não `resposta`, sem resposta do destino, e enviada depois do cadastro do painel.
- Mensagem cujo envio falhou some do painel (não conta como pendente, tarefa nem linha do tempo) até o `painel.py reenviar`; o motivo fica em `avisos.log`.
- Textos vindos do log são exibidos como texto puro (nunca HTML).
