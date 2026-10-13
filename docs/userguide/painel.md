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
- **Período**: Hoje, 24 h ou 7 dias. Vale para os números, o mapa e a linha do tempo. Tarefas abertas aparecem sempre, qualquer que seja a idade.
- **Atualizado há N s**: a página se atualiza sozinha a cada 5 s. Se o número parar de mudar, o servidor caiu.

### Indicadores
| Indicador | Como é calculado |
|---|---|
| Mensagens hoje | Linhas de mensagem no período (sem status e notas), com a variação contra o período anterior. |
| Pendentes | Mensagens recebidas (não `resposta`) sem resposta, em quantos agentes. É o que o Stop cobra. |
| Atrasados | Pedidos com prazo vencido e sem resposta. Fica vermelho quando > 0 e mostra quando foi escalado. |
| Entregas aguardando revisão | `entrega` ao master sem `resposta --veredito`. Mostra a mais antiga. |
| Tempo médio de resposta | Entre o pedido/aviso e a primeira resposta ou andamento, no período, com o p90. |

### Mapa do time
- Um nó por agente cadastrado no projeto, em camadas: master no topo, managers no meio, researchers embaixo. Cor pelo papel (roxo, azul, verde); o código depois do nome é o runtime (`cc`, `omp`, `cx`…).
- Nos managers com worktree, a branch aparece embaixo do nome (`ab/<agente>`).
- **Bolinha vermelha** = pendentes daquele agente; **laranja** = só pendentes dentro do prazo.
- **Seta**: mensagens de um agente para outro no período; a espessura cresce com o volume.
- **Seta tracejada vermelha**: ping-pong detectado (muitas mensagens entre o par, sem entrega).
- **Nó cinza tracejado**: painel do cadastro que não está mais aberto no Orca → recadastrar (`painel.py listar` / `cadastrar`).
- **Clique num agente**: filtra Tarefas e Linha do tempo por ele. Clique de novo para limpar.

### Tarefas
Quadro derivado do log (o mesmo de `painel.py tarefas`), uma coluna por estado:

| Coluna | Entra quando | Sai quando |
|---|---|---|
| Aberto | `pedido` enviado | chega `andamento` ou `resposta` |
| Em andamento | destino mandou `andamento` | chega `resposta` |
| Atrasado | prazo venceu sem `resposta` | chega `resposta` |
| Revisão | `entrega` ao master | master responde com `--veredito` |
| Concluído | `resposta` (com ✓ aprovado / ✗ rejeitado nas entregas) | — (só hoje; o resto no histórico) |

Cada cartão: assunto, destino (ou remetente → master nas entregas), prazo, issues e branch. Abaixo do quadro: **alertas de ping-pong** e **pendências por agente** (barra proporcional).

### Linha do tempo
Mensagens do período, da mais nova para a mais antiga: hora, tipo (cor do chip), de → para, assunto e id. Inclui eventos do sistema (atrasado, ping-pong, envio que falhou, reenvio). A busca filtra por assunto, agente ou id. **Clique numa linha** → abre a conversa inteira (o pedido, os andamentos e a resposta, ligados por `responde_a`).

O corpo das mensagens não aparece: ele não fica no log (só o assunto).

### Notas e decisões
Últimas notas de `docs/agent-board/notas/`, com as **Decisões** destacadas em roxo: tema, título, autor e quando. Notas são escritas com `painel.py nota` ou pela ferramenta MCP, nunca pelo painel.

## Situações de exceção
| Você vê | Significa | O que fazer |
|---|---|---|
| "Log adulterado" em vermelho | `verificar` achou linha editada ou apagada | `painel.py verificar --raiz …` para ver quais; recupere pelo git. |
| Página em branco com "projeto sem docs/agent-board" | `--raiz` errada ou projeto sem `init` | Confira o caminho ou rode `painel.py init`. |
| "Porta em uso" ao abrir | Outro processo usa 8765 | `--porta 9000`. |
| Linha "linha ilegível ignorada" | Linha corrompida no log (merge ruim, corte) | O painel segue; corrija o arquivo pelo git e rode `verificar`. |
| Mapa vazio | Nenhum painel cadastrado para o projeto | `painel.py listar` e `cadastrar`. |
| Atualização parada | Servidor caiu ou túnel SSH fechou | Reabra o `servir` / o túnel. |

## Regras de negócio visíveis
- Só aparece o que está no log ativo e no cadastro. O arquivo morto (`arquivar`) fica fora, exceto quando uma conversa aberta aponta para ele.
- Pendente segue a mesma regra do hook: mensagem recebida, não `resposta`, sem resposta do destino, e enviada depois do cadastro do painel.
- Mensagem cujo envio falhou não conta como pendente nem como tarefa; aparece na linha do tempo como "falhou" até ser reenviada.
- Textos vindos do log são exibidos como texto puro (nunca HTML).
