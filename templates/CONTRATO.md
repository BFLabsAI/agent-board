# Agent-board: contrato de comunicação entre agentes

Vale para todo projeto que tem `docs/agent-board/agent-board.json`. Os hooks da skill `agent-board` já estão instalados no servidor e aplicam estas regras sozinhos. Este texto explica o que eles fazem. O prefixo e os papéis deste projeto estão em `agent-board.json`.

## Em uma frase

Agente fala com agente **só** pelo agent-board (`orca orchestration send` no Orca, `board.py send` no Maestri, ou a ferramenta `board_send`), usando o **nome** do destino. O hook confere, registra no log, entrega e avisa na tela do destino. Toda mensagem recebida precisa de resposta.

## Como mandar

```bash
orca orchestration send --to <nome-do-agente> --type <tipo> --subject "assunto curto" --body "texto"
```

- **`--type`** é um dos tipos do time:
  - `pedido`: pede um trabalho.
  - `resposta`: devolve um pedido ou confirma o recebimento. Fecha a conversa.
  - `aviso`: informa algo, sem pedir trabalho.
  - `escalacao`: algo travou ou precisa de decisão. Vai só para o master.
  - `entrega`: trabalho pronto para revisão ou merge. Vai só para o master.
  - `andamento`: progresso de um pedido longo que você recebeu. Vai para quem pediu, com `--responde-a <id do pedido>`. Qualquer papel pode mandar. O pedido continua aberto até a sua `resposta`.
- **`--modo orquestrar|executar`** é obrigatório quando o pedido vai para um manager:
  - `orquestrar`: o manager trabalha com subagents, seguindo a skill `/orchestrator`, com revisão e QA.
  - `executar`: o manager faz o trabalho ele mesmo.
- **`--responde-a <id>[,<id>...]`** é obrigatório em `resposta`. Uma única resposta pode cobrir várias mensagens.
- **`--veredito aprovado|rejeitado`** é obrigatório na `resposta` a uma `entrega` (só o master recebe entregas) e inválido em qualquer outro caso. Se rejeitar, diga no `--body` o que falta.
- **`--prazo 30m|2h|1d`** é opcional em `pedido` e grava a hora-limite no log. O projeto pode ter um prazo padrão. Pedido vencido sem resposta é escalado ao master.
- **`--to papel:<papel>`** (ex.: `--to papel:researcher`) deixa o hook escolher o agente desse papel com menos pedidos abertos.
- **`--issues 412,413`** é opcional e liga a mensagem às Issues do GitHub. O conteúdo longo vai na Issue, não na mensagem.
- O comando `orca` roda **sozinho**: sem `&&`, `;`, `|`, redirecionamento ou `$( )`.
- Não use `orca orchestration reply` nem `orchestration ask` com outro agente do time: eles ficam fora do registro e são barrados. Responda com `send --type resposta` e pergunte com `send --type pedido`.

O hook troca o nome pelo ID atual do painel, converte o tipo para um tipo aceito pelo Orca e põe no assunto o ID da mensagem (`[c-20261007-101256-ab68 pedido·executar] ...`). No corpo, ele acrescenta um rodapé com o comando de resposta pronto.

### No Maestri

Num terminal do canvas do Maestri (`$MAESTRI_TERMINAL_ID` definido), o `orca` não entrega. Use o `board.py`, com **as mesmas flags e as mesmas regras** do comando acima:

```bash
python3 ~/.agents/skills/agent-board/scripts/board.py send --to <nome-do-agente> --type <tipo> --subject "assunto curto" --body "texto"
python3 ~/.agents/skills/agent-board/scripts/board.py send --to master --type entrega --subject "Login pronto" --body-file relatorio.md
```

- A mensagem chega **digitada no terminal do destino** pelo `maestri ask`, com o id no assunto e o rodapé com o comando de resposta pronto.
- Só entrega entre terminais **ligados por uma corda** no canvas. Sem corda, o envio falha na hora, o log marca `falhou` e o master liga os dois (`painel.py maestri conectar`).
- **Não use `maestri ask` direto com um agente do time** (nem `--batch`): fica sem registro, sem regra e sem cobrança, e o hook barra. `maestri ask` com ajudantes de fora do time continua livre. `maestri check` (só leitura) também.
- O corpo é texto puro: crase e `$( )` chegam como texto.

### Pelas ferramentas MCP (Claude Code)

Se a sessão tiver as ferramentas `board_*` do servidor MCP `agent-board`, use-as no lugar do comando acima: os parâmetros são tipados e não há problema de aspas.

- `board_send(para, tipo, assunto, corpo, modo, issues, responde_a)`: envia. Mesmas regras: `modo` em pedido para manager, `responde_a` em resposta. O corpo é texto puro (crase e `$( )` chegam como texto).
- `board_inbox()`: lê o seu correio inteiro (o mesmo `check --format`).
- `board_pendentes()`: o que você recebeu e ainda não respondeu.
- `board_historico(agente, sobre, n, tudo)` e `board_status()`: log do projeto e quem você é no time.

As ferramentas aplicam as mesmas regras do hook, gravam no mesmo log e avisam o destino do mesmo jeito. Elas não passam pelo hook do shell, por isso o servidor chama a regra do hook ele mesmo. O comando `orca` no shell continua valendo e continua passando pelo hook.

## Como receber

No Maestri, a mensagem inteira já chega digitada no seu terminal: pule para o passo 3 e responda com `board.py send`.

1. No Orca, uma linha aparece na sua tela: `[agent-board] Nova mensagem <id> (<tipo>) de <agente>. Leia com: orca orchestration check --terminal <seu painel> --format`.
2. Rode esse `check` **com `--format`**, porque sem ele aparece só o assunto, e leia a mensagem inteira.
3. **Pedido não leva confirmação de recebimento.** Se o pedido vai demorar (subagents, testes longos), mande `--type andamento --responde-a <id>` com o progresso: o hook para de cobrar no fim do turno, e a `resposta` vem quando terminar. Responda a ele só com o resultado ou com o bloqueio (`--type resposta --responde-a <id>`), nunca com "Recebido". **Aviso exige uma resposta curta**, também com `--type resposta --responde-a <id>`. Se um aviso não pede nada a fazer, responda "recebido, nada a fazer".
   - **Resposta fecha a conversa: resposta não se responde.** Não mande "recebido" para uma resposta. Se a resposta deixou algo pendente, abra uma mensagem nova (`pedido` ou `aviso`). O hook barra resposta a resposta.
   - Se você tentar encerrar o turno com mensagens sem resposta, o hook segura e mostra o comando pronto.
   - Ele faz isso no máximo 3 vezes. Depois disso, registra que você encerrou sem responder.

## Papéis e quem pode pedir a quem

| Papel | O que faz | Pode enviar | Pode fazer pedido a |
|---|---|---|---|
| master | Decide, faz merge em `main` e deploy, é o único que fala com o CEO e cadastra os painéis | pedido, resposta, aviso | manager, researcher |
| manager | Escreve código na própria branch ou worktree, no modo que o pedido indicar | todos os tipos | manager (pedido pontual), researcher |
| researcher | Só lê: pesquisa, análise e documentação | resposta, aviso, escalacao | ninguém |

- Dois managers nunca dividem a mesma tarefa: o master separa o trabalho em frentes.
- Ninguém delega `main`, deploy, banco de produção ou decisão de produto.
- Pedido sem resposta em 15 minutos vira `escalacao` para o master. Pedido com `--prazo` vencido é escalado sozinho.
- O projeto pode limitar a conversa em `agent-board.json`: quantos pedidos abertos um agente recebe (`limites`), e quem pode mandar pedido ou aviso a quem (`ligacoes`). O bloqueio diz o que fazer. Conversa demais entre o mesmo par, sem entrega, avisa o master.
- Ninguém fica esperando comando travado (teste, build, lock, servidor). Comando longo leva `timeout`. Passou de ~5 min sem progresso: interrompa (nunca com `pkill` ou `killall`) e mande `escalacao` ao master dizendo o que estava esperando.
- Mande mensagem só quando for necessário: pedido, pergunta que bloqueia o trabalho, escalação, fim de fase ou entrega. Nada de mensagem de cortesia.
- Você só fala com os agentes cadastrados do seu projeto. Qualquer outro destino é barrado, com a lista dos nomes válidos. O nome curto também funciona: `manager01-omp` vira `<project-prefix>-manager01-omp`. Mensagem entre projetos diferentes é barrada.
- Subagent não fala com outro agente, só a sessão principal. No Claude, o hook garante isso. No OMP, é regra deste contrato.
- O `SendMessage` nativo do Claude entre sessões é barrado entre agentes do time: ele fica sem registro e pode travar esperando aprovação. Use o `orca`. O comando `orca terminal send` no painel de outro agente também é barrado. Só o master pode usá-lo, e só nos painéis do próprio time (por exemplo, para um `/clear`).

## Notas e decisões do time

Decisão tomada ou contexto que outro agente vai precisar depois vira nota, e não mensagem:

```bash
python3 ~/.agents/skills/agent-board/scripts/painel.py nota --raiz <project-path> --tema <tema> [--decisao] "<texto>"
```

- A nota é acrescentada em `docs/agent-board/notas/<tema>.md` e registrada no log com você como autor (o hook sabe quem você é pelo painel).
- Use `--decisao` só para o que foi decidido. Decisão de produto continua sendo do master e do CEO.
- Antes de perguntar algo que pode já ter sido decidido, consulte: `painel.py notas --raiz <project-path> [--tema <tema>]` ou `painel.py historico --raiz <project-path> --sobre <tema>`.
- Nota não pede resposta e não é cobrada de ninguém.

## Nomes

`<project-prefix>-<papel><NN>-<runtime>`. O master é único: `<project-prefix>-master`.

Códigos de runtime: `cc` = Claude Code, `omp` = Oh My Pi, `cx` = Codex, `agy` = Antigravity, `oc` = OpenCode, `hr` = Hermes.

Exemplos: `<project-prefix>-master`, `<project-prefix>-manager01-cc`, `<project-prefix>-manager01-omp`, `<project-prefix>-researcher01-cc`.

Use o mesmo nome na sessão (`/rename`) para facilitar a leitura na tela. Quem prova a identidade, porém, é o **ID do painel** (`$ORCA_TERMINAL_HANDLE`), cadastrado pelo master, e não o nome.

## Cadastro de painéis (só o master)

O cadastro fica em `~/.agent-hooks/agent-board/paineis.json`, fora do git, porque o ID muda quando um painel é reaberto.

1. O CEO informa quem é quem, de um destes jeitos:
   - manda a lista;
   - ou pede "lê os painéis abertos".
2. O master roda `python3 ~/.agents/skills/agent-board/scripts/painel.py listar` e monta a lista: ID do painel, título e cadastro atual.
3. O master mostra a lista ao CEO. **Só depois da confirmação**, cadastra:
   ```bash
   python3 ~/.agents/skills/agent-board/scripts/painel.py cadastrar --raiz <project-path> term_...=<project-prefix>-manager01-cc term_...=<project-prefix>-researcher01-cc
   ```
   Recadastrar um agente substitui o painel antigo dele.
4. Um painel reaberto tem um ID novo. Se ele tentar enviar, o hook barra com o aviso "peça ao master para recadastrar", e o master repete o passo 2.
5. Para tirar um painel do cadastro: `painel.py remover term_...`. O passo a passo completo está na skill `agent-board`.

**No Maestri** o master não vê o ID dos terminais. O cadastro começa no agente:

1. No terminal do agente: `python3 ~/.agents/skills/agent-board/scripts/painel.py solicitar --raiz <project-path> --agente <project-prefix>-manager01-cc`. Isso registra o ID e o nome do terminal no canvas.
2. O master roda `painel.py solicitacoes`, mostra a lista ao CEO e, **depois da confirmação**, cadastra com o comando que a lista sugere (`maestri:<id>=<agente>`).
3. Renomeou o terminal no canvas? Rode `solicitar` de novo e o master recadastra.

Um painel sem cadastro não é afetado em nada, a menos que tente falar com um agente cadastrado.

## Log

O log é `docs/agent-board/comunicacoes.jsonl`, com uma linha por mensagem, e é gravado sempre no checkout principal do projeto, mesmo quando você trabalha num worktree próprio (`<projeto>-worktrees/<agente>`, branch `ab/<agente>`). O master inclui o log no commit quando faz merge.

**Ninguém edita o log nem o cadastro à mão.** O log é escrito só pelo hook a cada envio, e o cadastro só pelo `painel.py`. O hook barra qualquer escrita direta, pelo shell ou pelas ferramentas de edição. Ler com `cat`, `jq` ou `grep` é livre.

```json
{"id":"c-20261007-101256-ab68","ts":"2026-10-07T10:12:56+02:00","de":"<project-prefix>-manager01-cc","para":"<project-prefix>-researcher01-cc","tipo":"pedido","modo":null,"assunto":"Analisar pagamentos","issues":[412],"responde_a":null}
```

Consulta: `jq -c 'select(.para=="<project-prefix>-master")' docs/agent-board/comunicacoes.jsonl`.

## Limites conhecidos

- O hook só vê o que passa pelas ferramentas de shell e pelo `SendMessage`. Um script que chama o `orca` por dentro escapa da checagem, e este contrato proíbe isso.
- O correio do Orca por terminal não sobrevive se o painel fechar antes de ler. A linha no log fica, e o master pode reenviar.
- O aviso na tela é digitado como se fosse texto do usuário. Se a tela do destino tiver uma pergunta aberta, o aviso não é digitado, e o motivo fica em `~/.agent-hooks/agent-board/avisos.log`.
- O hook do OMP vale para sessões abertas depois da instalação. Confira com `/extensions`.
