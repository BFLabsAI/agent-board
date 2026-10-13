# Hooks e limites

> Os hooks que o `install.sh` liga, tudo o que eles barram e os limites conhecidos. O porquê das regras está em [regras](../conceitos/regras.md).

## Hooks instalados

### Claude Code (`~/.claude/settings.json`)

Toda entrada roda `python3 <skill>/scripts/hook_core.py --dialect claude`, com timeout de 10 s.

| Evento | Matcher | Para quê |
|---|---|---|
| `PreToolUse` | `Bash` | Confere e traduz `orca orchestration send`, barra os desvios (`maestri ask`, `orca … reply/ask`, `orca terminal send`), barra subagent no `board.py` e escrita à mão no log ou no cadastro |
| `PreToolUse` | `Edit\|Write\|MultiEdit\|NotebookEdit` | Barra edição do log e do cadastro |
| `PreToolUse` | `SendMessage` | Barra `SendMessage` entre agentes do time |
| `PreToolUse` | `mcp__agent-board__board_send` | Só barra subagent. A regra do envio roda no `envio.py` |
| `PostToolUse` | `Bash` | Digita o aviso na tela do destino (Orca), marca `falhou` no log se a entrega falhou e dispara as notificações |
| `Stop` | (todos) | Cobra mensagens recebidas sem resposta |

O `Bash` não usa filtro `if`: o filtro do Claude Code não pega redirecionamentos (ex.: `echo x >> log`). O core descarta em milissegundos o que não interessa.

O `install.sh` também:

- cria `$AGENT_BOARD_HOME` com um cadastro vazio;
- guarda um backup do settings em `$AGENT_BOARD_HOME/settings.json.bak-<data>`;
- troca as entradas antigas do agent-board pelas atuais, sem mexer nos seus outros hooks, e grava o settings de uma vez (segue symlink);
- registra o servidor MCP `agent-board` com `claude mcp add --scope user`, se o `claude` estiver no `PATH`. Já registrado com o mesmo caminho: não faz nada. Com outro caminho: remove e registra de novo. Sem o `claude`: mostra o comando.

### OMP (`~/.omp/agent/hooks/pre/agent-board.ts`)

O adaptador chama o mesmo core. Ele só repassa comandos que citam `orca orchestration|terminal send|ask|reply`, `maestri ask` (ou `$MAESTRI_CLI ask`), `comunicacoes.jsonl` ou `paineis.json`.

| Evento do OMP | Vira | Observação |
|---|---|---|
| `tool_call` | `PreToolUse` | Se o core falhar, o comando é barrado |
| `tool_result` | `PostToolUse` | |
| `session_stop` | `Stop` | Cobrança de resposta |

Confira com `/extensions` numa sessão **aberta depois** da instalação.

### Quando o hook falha

O core sempre sai com código 0. Se a política quebrar num comando `orca` do time, o envio é **barrado** com "o hook agent-board falhou; avise o master". O `envio.py` (board.py e MCP) faz o mesmo.

## O que o hook barra

O motivo vem na própria mensagem de erro, com a correção sugerida. Coluna **Onde**: Orca, Maestri ou ambos.

| Bloqueio | Onde | Por quê |
|---|---|---|
| Painel não cadastrado tentando falar com o time | ambos | Peça ao master para cadastrar ou recadastrar |
| Destino fora do time ou de outro projeto | ambos | Só cadastrados do mesmo projeto. A mensagem lista os nomes válidos |
| Mensagem para si mesmo | ambos | Não faz sentido |
| Nome cadastrado em mais de um painel | ambos | Peça ao master para recadastrar |
| `--to papel:<papel>` sem ninguém desse papel além de você | ambos | Mande `--to <nome>` ou peça o cadastro |
| `--type` fora dos 6 tipos, ou `--subject` vazio | ambos | Tipos: `pedido`, `resposta`, `aviso`, `escalacao`, `entrega`, `andamento` |
| Tipo não permitido ao papel | ambos | Ex.: researcher não faz `pedido` |
| `pedido` a um papel fora de `pode_pedir_a` | ambos | Ex.: researcher não pede a ninguém |
| `escalacao` ou `entrega` para quem não é master | ambos | Só o master recebe |
| `pedido` para manager sem `--modo`, ou `--modo` inválido | ambos | O manager precisa saber se orquestra ou executa |
| `resposta` sem `--responde-a`, ou apontando para mensagem que não existe ou que você não recebeu | ambos | Toda resposta aponta para algo que você recebeu |
| Responder a uma `resposta` ou a um `andamento` | ambos | Resposta fecha a conversa |
| `andamento` para algo que não é pedido, para pedido já respondido, ou para outro que não quem pediu | ambos | Andamento é progresso de um pedido aberto, devolvido a quem pediu |
| `resposta` a `entrega` sem `--veredito`, ou `--veredito` fora dela | ambos | A revisão termina em aprovado ou rejeitado |
| `--prazo` inválido ou fora de `pedido` (ou `prazo_padrao` inválido) | ambos | Use `30m`, `2h` ou `1d` |
| `pedido` a quem já está no `limites.pedidos_abertos_max` | ambos | Espere, use `--to papel:<papel>` ou escale ao master |
| `pedido`/`aviso` fora das `ligacoes` (quando a config tem) | ambos | A mensagem lista para quem você pode mandar |
| `orca` encadeado com outro comando (`&&`, `;`, `\|`, redirecionamento) | Orca | Para o hook validar e registrar o envio |
| Crase ou `$( )` no comando `orca` | Orca | Escreva o texto direto. No `board.py`/MCP isso não é barrado |
| Comando `orca` ilegível (aspas quebradas, argumento solto) | Orca | Confira as aspas |
| `orca orchestration reply` / `ask` entre agentes do time | Orca | Ficam fora do registro. Use `send --type resposta` / `pedido` |
| `orca terminal send` no painel de outro agente | Orca | Só o master pode, e só nos painéis do próprio time |
| `orca orchestration send` para um agente que está no Maestri | Orca | O `orca` não entrega lá. A mensagem aponta o `board.py send` |
| `maestri ask` (ou `--batch`) direto para um agente do time | Maestri | Fica sem registro, regra e cobrança. Use `board.py send` ou `board_send` |
| `maestri ask` ilegível (aspas, JSON do `--batch`), vindo de um painel cadastrado | Maestri | Confira e rode sozinho |
| `maestri ask --raw` no terminal de outro agente | Maestri | Só o master pode, e só nos terminais do próprio time |
| `SendMessage` nativo do Claude Code para agente do time | ambos | Fica sem registro e pode travar esperando aprovação |
| Subagent mandando mensagem (`orca`, `board.py` ou `board_send`) | ambos | Só a sessão principal fala com outros agentes. `board.py` e `board_send`: só no Claude Code |
| Escrita direta no log ou no cadastro (`>>`, `sed -i`, `rm`, `mv`, `cp`, `tee`, `python -c open(…,'w')`, Edit/Write…), inclusive `rm -r docs/agent-board` | ambos | Vale para agente cadastrado. O log é escrito só pelo agent-board, e o cadastro só pelo `painel.py`. Ler é livre |
| Encerrar o turno com mensagem sem resposta | ambos | O hook segura até 3 vezes, com o comando pronto. Depois libera e registra no `avisos.log` |

### O que passa sem opinião

- Painel **sem cadastro** que não fala com o time. Com o cadastro vazio, os hooks não agem sobre ninguém.
- `maestri ask` para ajudantes fora do time, e `maestri check`.
- `orca orchestration send --to run:…` ou `dispatch:…` (orquestração própria do agente).
- Leitura do log e do cadastro (`cat`, `jq`, `grep`).

### Cobrança e aviso, em detalhe

| Mecanismo | Como funciona |
|---|---|
| Cobrança (`Stop`) | Cobra o que você recebeu (menos `resposta` e `andamento`) e não respondeu. Qualquer mensagem sua com `--responde-a` conta como retorno, inclusive `andamento`. Só conta mensagens recebidas depois do cadastro atual do painel. Subagent não é cobrado |
| Limite da cobrança | 3 vezes para as mesmas pendências. Depois, libera e grava "encerrou com N mensagem(ns) sem resposta" no `avisos.log` |
| Aviso na tela (Orca) | No máximo 1 por destino a cada 60 s (`AGENT_BOARD_JANELA_AVISO`). Dentro da janela, espera e só digita se ainda houver mensagem não lida. Não digita se a tela tem um diálogo aberto |
| Aviso no Maestri | Não há aviso extra: o `maestri ask` digita a mensagem inteira. Avisos do `vigiar` e do ping-pong vão pelo `maestri ask` |

## Limites conhecidos

- O hook só vê o que passa pelas ferramentas de shell, de edição, pelo `SendMessage` e pelo `board_send` (neste, só para barrar subagent). Um script que chama o `orca` por dentro escapa da checagem, e o contrato proíbe isso.
- No OMP, o hook só vê o shell (comandos `orca`, `maestri ask`) e o que cita o log ou o cadastro. A trava de subagent no `board.py` não vale lá.
- Os hooks valem para Claude Code e OMP. Outros harnesses seguem o contrato sem trava automática.
- O correio do Orca por terminal não sobrevive se o painel fechar antes de ler. A linha no log fica, e `painel.py reenviar` manda de novo.
- A cadeia de hash acusa linha editada ou apagada no meio do log, mas não a remoção da **última** linha. Torna a adulteração visível, não impossível.
- O aviso na tela é digitado como se fosse texto do usuário. Por isso o hook não digita quando há um diálogo aberto no destino.
- Num pedido longo, o fim de turno cobra até o agente mandar um `andamento` (ou a resposta). Quem esquece é cobrado 3 vezes e depois liberado.
- `vigiar` só olha pedidos com `prazo`. Duas execuções ao mesmo tempo podem escalar o mesmo pedido duas vezes: rode uma por projeto.
- `simular` não revalida o texto de `--prazo` (o log guarda só a hora calculada) nem os nomes e painéis: confere só as regras de `validar_envio`.
- No Maestri, a entrega só confirma que o `maestri ask` não falhou nos primeiros 3 s (sem corda, nome errado). A saída fica em `$AGENT_BOARD_HOME/maestri-ask/`.
- No Maestri, a mensagem é **digitada** no terminal do destino. Se um humano estiver escrevendo ali, os textos se misturam.
- A CLI `maestri` sai com código 0 mesmo quando recusa. O agent-board detecta a falha pelo texto da saída; se a CLI mudar essas frases, a detecção precisa acompanhar.
- Time misto (parte no Orca, parte no Maestri) não é suportado: o hook barra `orca` para destino no Maestri, e do Maestri para o Orca não há `--from` válido.
- `board.py send` roda num shell: `$( )` e crase entre aspas duplas no `--body` são expandidos antes de chegar ao `board.py`. Use aspas simples ou `--body-file`.
- As notas em `docs/agent-board/notas/` são Markdown comum. A autoria provada é a da linha no log, não a do cabeçalho no arquivo.
- A notificação (webhook, GitHub, floor) não tem nova tentativa: se falhar, fica só a linha no `avisos.log`.
- A trava vale por máquina. Duas máquinas no mesmo checkout não são suportadas.
- Linux e macOS. A trava tem fallback para Windows, mas o `install.sh` é bash: no Windows, use WSL (não testado fora dele).
