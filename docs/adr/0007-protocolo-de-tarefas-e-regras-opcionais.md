# 0007. Protocolo de tarefas e regras opcionais numa política pura

- **Status:** aceita
- **Data:** 2026-10-12

## Contexto
Até a 1.5.1 o time tinha papéis, tipos e a cobrança no Stop, mas um pedido não tinha ciclo de vida: não havia como dizer "ainda estou nisso" sem fechar o pedido, nem como o master aprovar ou rejeitar uma entrega, nem prazo. Times diferentes também pediam regras diferentes (quem fala com quem, quantos pedidos abertos por agente, conversa que vira ping-pong). E toda regra morava no `hook_core.py`, misturada com leitura de comando e I/O, o que impedia testar uma config nova contra o log antes de adotá-la.

## Decisão
1. **Regras numa função pura.** `scripts/politica.py` concentra as checagens em `validar_envio(cfg, eu, para, tipo, modo, responde_a, veredito, prazo, mensagens, agora)`: recebe a lista de mensagens, levanta `Barrado` e não lê arquivo, não grava log, não chama o orca. O hook (`pre_send`) e o `painel.py simular` chamam a mesma função.
2. **Protocolo de tarefas** (sobre o log, sem estado novo):
   - **`andamento`**: resposta parcial a um pedido ainda aberto, de quem o recebeu para quem pediu. Vale para qualquer papel. Tira o pedido da cobrança do Stop, mas não o fecha: só uma `resposta` fecha. Andamento e resposta não se respondem.
   - **`--veredito aprovado|rejeitado`**: obrigatório na resposta a uma `entrega` e inválido em qualquer outro caso. O quadro mostra a entrega como `aguardando_revisao`, `aprovado` ou `rejeitado`.
   - **`--prazo 30m|2h|1d`**: só em pedido; sem a flag, vale `prazo_padrao` da config (se houver). O log guarda o fim do prazo em ISO.
   - **`painel.py tarefas`**: estado de cada pedido/entrega derivado do log (aberto, em_andamento, concluido, atrasado, aguardando_revisao, aprovado, rejeitado).
   - **`painel.py vigiar`** (master, para cron ou routine): pedido vencido e sem resposta ganha uma linha de status `atrasado` (uma vez cada) e um aviso na tela do master.
   - **`painel.py simular --config <novo.json>`**: reexecuta cada mensagem do log contra a config nova, com o log até aquele ponto, e lista o que seria barrado (e se a config atual barraria). Sai com 1 se algo seria. O prazo não é rechecado.
3. **Regras opcionais, só quando a chave existe.** Config antiga, sem as chaves, se comporta como antes.
   - `ligacoes`: lista de pares `[de, para]` (papel ou nome de agente, com direção). Com ela, `pedido` e `aviso` só passam nos pares listados; resposta, andamento, escalação e entrega ao master sempre passam.
   - `limites.pedidos_abertos_max`: barra um novo pedido a quem já tem esse número de pedidos sem resposta.
   - `limites.ping_pong_max` + `ping_pong_janela_min`: mais mensagens que o limite entre o mesmo par na janela, sem `entrega` no meio, **não barra**: o hook só avisa o master.
4. **Roteamento `--to papel:<papel>`**: o hook escolhe, no projeto, o agente desse papel com menos pedidos abertos (empate: ordem alfabética).

## Alternativas descartadas
- **Estado de tarefa num arquivo próprio:** duplicaria o log e quebraria o `merge=union`. O estado é sempre derivado das mensagens.
- **Barrar o ping-pong:** uma conversa longa pode ser legítima; quem decide é o master.
- **Regras novas ligadas por padrão:** quebrariam times já em uso. Cada uma só vale quando a chave aparece em `agent-board.json`.

## Consequências
- Muda comportamento: resposta a `entrega` sem `--veredito` passa a ser barrada (1.8.0).
- O log ganha campos opcionais (`prazo`, `veredito`) e linhas de status `atrasado`.
- Uma regra nova entra em `politica.py` e vale ao mesmo tempo para o hook, o MCP, o `board.py` e o `simular`.
- `painel.py simular` permite testar uma mudança de config contra o histórico real antes de adotá-la.
