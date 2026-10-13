# 3. Dia a dia (Maestri)

> **Em 1 minuto:** todo agente envia com `board.py send` e responde do mesmo jeito. A mensagem chega digitada no terminal do destino. O master acompanha pelo quadro de tarefas, pelo resumo e pelo painel web.

**Antes:** [2. Montar o time](2-montar-o-time.md) feito. `S=~/.agents/skills/agent-board/scripts`. O que cada tipo significa: [Papéis e mensagens](../../conceitos/papeis-e-mensagens.md).

## Passo 1 — Enviar
Use o nome do destino (o curto vale: `manager01-cc`) ou `papel:<papel>`. Um exemplo por tipo:
```bash
python3 $S/board.py send --to manager01-cc --type pedido --modo executar --prazo 2h --issues 12 --subject 'Migrar login' --body 'Detalhes na Issue 12.'
python3 $S/board.py send --to master --type resposta --responde-a <id> --subject 'Login migrado' --body 'Feito, testes passando.'
python3 $S/board.py send --to papel:researcher --type aviso --subject 'API nova no ar' --body 'Endpoint /v2/login.'
python3 $S/board.py send --to master --type escalacao --subject 'Build travado' --body 'Lock do banco há 10 min.'
python3 $S/board.py send --to master --type entrega --issues 12 --subject 'Login pronto' --body-file relatorio.md
python3 $S/board.py send --to master --type andamento --responde-a <id> --subject 'Login 50%' --body 'Falta o OAuth.'
```
- `pedido` para manager exige `--modo orquestrar|executar`. `--prazo` (`30m`, `2h`, `1d`) só vale em `pedido`.
- **Aspas simples sempre.** Entre aspas duplas, o shell roda `$( )` e crase antes de o `board.py` ver o texto. Texto longo ou com aspas: `--body-file <arquivo>` (ou `--body-file -` para a entrada padrão).

✅ **Deu certo se:** a saída diz `c-… enviada para <destino> (<tipo>)` e `entregue a <nome> pelo Maestri`. Barrado ou não entregue sai com código 1 e o motivo.

## Passo 2 — Receber e responder
A mensagem inteira chega digitada no seu terminal:
```
[agent-board] [c-20261013-101256-ab68 pedido·executar] Migrar login
De: app-master

Detalhes na Issue 12.

---
[agent-board c-20261013-101256-ab68] de app-master para app-manager01-cc. Para responder: python3 …/board.py send --to app-master --type resposta --responde-a c-20261013-101256-ab68 --subject "..." --body "..."
Pedido longo: mande antes --type andamento --responde-a c-20261013-101256-ab68 com o progresso
```
- **Responda sempre pelo `board.py`**, como mostra o rodapé. Resposta só no chat não entra no log nem fecha a pendência.
- `pedido`: responda com o resultado ou o bloqueio, nunca "Recebido". `aviso`: uma resposta curta. `resposta` não se responde.
- No Claude Code, o hook segura o fim do turno até 3 vezes enquanto houver mensagem sem resposta.

✅ **Deu certo se:** `python3 $S/painel.py tarefas --raiz <projeto> --agente <você>` mostra o pedido como `concluido`.

## Passo 3 — Avisar o andamento de um pedido longo
Mande `--type andamento --responde-a <id>` para quem pediu (exemplo no passo 1). O fim de turno para de cobrar, e o pedido segue aberto até a `resposta`.

✅ **Deu certo se:** o pedido aparece como `em_andamento` no `tarefas`.

## Passo 4 — Entregar e dar o veredito
Manager manda `entrega` ao master. O master revisa e responde com veredito; se rejeitar, diz no corpo o que falta.
```bash
python3 $S/board.py send --to manager01-cc --type resposta --responde-a <id> --veredito aprovado --subject 'Login aprovado' --body 'Pode seguir.'
```
✅ **Deu certo se:** a entrega passa de `aguardando_revisao` para `aprovado` ou `rejeitado`.

## Passo 5 — Acompanhar o time
```bash
python3 $S/painel.py tarefas --raiz <projeto>                      # um pedido/entrega por linha, com estado e prazo
python3 $S/painel.py historico --raiz <projeto> --agente <agente>  # últimas mensagens, em TOON
python3 $S/painel.py resumo --raiz <projeto> --desde 8h            # o que houve no período
```
Pedido com prazo vencido aparece como `atrasado`. Quem escala ao master é o `vigiar` (passo 8).

## Passo 6 — Registrar decisões em notas
```bash
python3 $S/painel.py nota --raiz <projeto> --tema pagamentos --decisao 'Gateway: Stripe.'
python3 $S/painel.py notas --raiz <projeto> --tema pagamentos
```
A nota vai para `docs/agent-board/notas/<tema>.md` e para o log, com você como autor. Com `"maestri": {"espelhar_notas": true}` no `agent-board.json`, ela também aparece no canvas como a nota `ab · <tema>`, no fichário (grupo de notas) `agent-board`.

## Passo 7 — Trabalhar num floor
Um **floor** é um workspace isolado do Maestri (um git worktree). Agente num floor usa a mesma `--raiz` do checkout principal: o log fica lá.
- A `entrega` feita de dentro do floor grava a `branch` na linha do log sozinha.
- Com `"maestri": {"status_do_floor": true}`, a `entrega` também posta `maestri floor status … --state review`, e o Maestri avisa você.

## Passo 8 — Vigiar os prazos com uma routine
O master agenda o `vigiar` como routine do canvas. Veja antes; aplique num terminal em modo Maestro, de preferência um Shell (a routine digita o comando no terminal).
```bash
python3 $S/painel.py maestri rotina --raiz <projeto> --a-cada 10m
python3 $S/painel.py maestri rotina --raiz <projeto> --a-cada 10m --aplicar
```
✅ **Deu certo se:** `maestri routine list` mostra `agent-board vigiar <projeto>`.

> O aviso de atraso sai do terminal onde o `vigiar` roda (pelo `maestri ask`). Se não for o terminal do master, ligue os dois com uma corda; sem ela, o atraso fica marcado no log e no `painel.py tarefas`, mas o aviso não chega à tela.

## Passo 9 — Ver no navegador ou usar o MCP
- Painel web, só leitura: `python3 $S/painel.py servir --raiz <projeto>` e abra `http://127.0.0.1:8765`. Guia: [Painel web](../../userguide/painel.md).
- No Claude Code, a ferramenta MCP `board_send(para, tipo, assunto, corpo, …)` faz o mesmo que o `board.py`, sem problema de aspas. No Maestri, `board_inbox` mostra o que falta responder.

Todos os comandos e flags: [Comandos](../../referencia/comandos.md).

**Próximo:** [4. Problemas](4-problemas.md)
