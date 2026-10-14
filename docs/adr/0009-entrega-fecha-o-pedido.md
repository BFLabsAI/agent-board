# 0009. Entrega com `--responde-a` fecha o pedido

- **Status:** aceita
- **Data:** 2026-10-14
- **Complementa:** [ADR-0007](0007-protocolo-de-tarefas-e-regras-opcionais.md)

## Contexto
Num teste real (1 master e 3 managers), o manager respondeu o pedido `c-1` com `andamento` e depois com `entrega --responde-a c-1`, e o master aprovou a entrega. Mesmo assim `painel.py tarefas` mostrava `c-1` como `em_andamento`, e o `vigiar` iria escalá-lo como `atrasado`. A causa: `politica.respostas()`, a fonte única do "pedido fechado", só olhava mensagens do tipo `resposta`. A entrega já gravava o `responde_a` no log, mas nada o lia. Dois dos três managers também fecharam o trabalho com `resposta`, e o master não tinha onde dar o veredito.

## Decisão
1. **`respostas()` conta `resposta` e `entrega`.** Uma `entrega` com `--responde-a <id>` fecha o pedido `<id>`, desde que quem entrega seja quem recebeu o pedido. Como o quadro, o `vigiar`, `pedidos_abertos` (limite e roteamento) e o painel web já usam essa função, todos passam a concordar.
2. **A entrega segue o próprio ciclo:** `aguardando_revisao`, depois `aprovado` ou `rejeitado` pelo veredito do master.
3. **Entrega rejeitada não reabre o pedido.** O pedido conta como cumprido pela entrega; a rejeição mora na entrega, e o manager corrige mandando uma nova `entrega` (com o mesmo `--responde-a`). Reabrir o pedido faria o `vigiar` e a cobrança do Stop dispararem de novo sobre um trabalho que já voltou ao master.
4. **`--responde-a` na entrega é opcional** (entrega espontânea continua valendo), mas, se vier, passa pelas mesmas checagens da resposta: a mensagem existe, foi recebida por quem entrega, não é resposta nem andamento. Andamento depois da entrega é barrado, pois o pedido já está fechado.
5. **Não se barra `resposta` a pedido de trabalho.** Um pedido pode ser uma pergunta ("quantos arquivos há em `src/`?"). Em vez de bloquear, o rodapé do pedido a um manager mostra os dois comandos prontos (`--type entrega --responde-a <id>` para trabalho feito; `--type resposta --responde-a <id>` para pergunta ou bloqueio), e o `CONTRATO.md` ensina a diferença.

## Alternativas descartadas
- **Barrar `resposta` a pedido com `--modo`:** quebraria a pergunta legítima e o bloqueio.
- **Reabrir o pedido na rejeição:** ver o item 3.
- **Dica extra no hook quando manager manda `resposta` a pedido `executar`/`orquestrar`:** o hook não tem um canal limpo de contexto não bloqueante nesse ponto; o rodapé e o contrato já cobrem o caminho.

## Consequências
- Config e log antigos continuam válidos: entregas antigas sem `responde_a` não fecham nada.
- Pedido já entregue deixa de aparecer como atrasado e de contar no limite `pedidos_abertos_max`.
