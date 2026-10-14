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
- registra o servidor MCP `agent-board` com `claude mcp add --scope user`, se o `claude` estiver no `PATH` ([Guia do MCP](../guias/mcp.md)). Já registrado com o mesmo caminho: não faz nada. Com outro caminho: remove e registra de novo. Sem o `claude`: mostra o comando.

### OMP (`~/.omp/agent/hooks/pre/agent-board.ts`)

O adaptador chama o mesmo core. Verificado no OMP 18.8.6 (código do pacote `@oh-my-pi/pi-coding-agent`).

**Nomes e campos.** O OMP não usa os nomes do Claude Code; o adaptador traduz antes de chamar o core.

| Ferramenta do OMP | Campos | O adaptador repassa quando |
|---|---|---|
| `bash` | `command` | cita `orca orchestration\|terminal send\|ask\|reply`, `maestri ask` (ou `$MAESTRI_CLI ask`), `board.py`, `comunicacoes.jsonl` ou `paineis.json` |
| `edit` | `path`; no modo hashline, `input` com cabeçalhos `[PATH#TAG]` e `path`/`paths` derivados; com vários arquivos, só `paths[]` | sempre que algum caminho existe (o protegido tem prioridade) |
| `write` | `path`, `content` | sempre |
| `ast_edit` | `paths[]` | sempre |
| `eval` (python/js) | `input` | o código cita o log ou o cadastro (não dá para separar leitura de escrita, então barra) |
| MCP `mcp__agent-board_board_send` | (ferramenta MCP) | sempre; o OMP nomeia com um `_` só, e o adaptador reescreve para o nome que o core conhece |

| Evento do OMP | Vira | Observação |
|---|---|---|
| `tool_call` | `PreToolUse` | Devolve `{ block, reason }` ou `{ input }`. O `input` é o objeto de argumentos **completo** (o adaptador mescla com os campos originais, como `timeout` e `cwd`). Se o core falhar, o comando é barrado |
| `tool_result` | `PostToolUse` | Leva o texto do resultado e o `isError`; é daí que sai o aviso digitado no destino (e o "envio falhou" que cancela o aviso) |
| `session_stop` | `Stop` | Devolve `{ decision: "block", reason }`. Só dispara na sessão principal, nunca em subagent |

**Cobrança no `Stop`.** O OMP manda `stop_hook_active: true` a partir da segunda passada, mas não põe teto no `block`. Quem para o laço é o contador do core: 3 cobranças pelas mesmas pendências, depois o agente encerra e o master recebe um aviso.

**Subagent.** As extensões são religadas em cada subagent (`task`, `eval`), e o `ctx.agent.kind` vale `"sub"` neles. O adaptador manda isso ao core como `agent_id`, e o core barra `orca orchestration send`, `board.py send` e `board_send` de subagent.

**Falhas.** Exceção ou estouro de tempo (30 s por handler; o adaptador usa 10 s) num `tool_call` **barra** a chamada. Erro em `tool_result` ou `session_stop` só é registrado, e o agente segue.

**Sessão só com o agent-board.** Para testar uma versão do adaptador sem o instalado em `~/.omp/agent/hooks/pre/`:

```bash
omp --no-extensions --hook /caminho/absoluto/omp-agent-board.ts
```

Sem a flag `--no-extensions`, o OMP carrega o instalado **e** o do `--hook`. O adaptador lê `AGENT_BOARD_CORE` (caminho do `hook_core.py`) e `AGENT_BOARD_HOME` (estado); aponte os dois para a cópia que quer testar, pois o arquivo da skill traz o marcador `__AGENT_BOARD_CORE__` no lugar do caminho (o `install.sh` troca). `ORCA_TERMINAL_HANDLE` vem do terminal e chega intacto. `--no-extensions` também desliga as outras extensões (por exemplo as do Orca em `~/.omp/agent/extensions/`).

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
- No OMP, o hook vê `bash`, `edit`, `write`, `ast_edit`, `eval` e o `board_send` do MCP; o resto passa. Um `eval` que monta o caminho do log por partes escapa da checagem de texto.
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
