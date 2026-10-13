# agent-board

Comunicação padronizada entre agentes de IA que rodam em **terminais diferentes do Orca**: master, managers e researchers, cada um no seu painel. O pacote combina uma **skill** com **hooks**, e os hooks fazem as regras valerem sozinhos:

- **Um canal só:** agente fala com agente apenas pelo correio do Orca (`orca orchestration send`).
- **Remetente provado:** a identidade é o ID do painel do Orca (`$ORCA_TERMINAL_HANDLE`), cadastrado pelo master. Não é o nome da sessão.
- **Endereço por nome:** você manda para `<project-prefix>-manager01-cc`, e o hook troca o nome pelo painel atual.
- **Log por projeto, no git:** uma linha por mensagem em `docs/agent-board/comunicacoes.jsonl`.
- **Aviso na tela:** quando chega mensagem, o hook digita uma linha no terminal do destino, com o comando para ler.
- **Toda mensagem recebida exige resposta:** o agente não consegue encerrar o turno com mensagem pendente.
- **Projetos isolados:** um agente só fala com os agentes cadastrados no mesmo projeto.

Funciona com **Claude Code** e **Oh My Pi (OMP)**, ambos com hooks. Agentes de outros harnesses (Codex, Hermes, OpenCode…) podem seguir o contrato, mas sem trava automática.

---

## Sumário

1. [Como funciona](#como-funciona)
2. [Requisitos](#requisitos)
3. [Instalação](#instalação)
4. [Conectando com o Orca](#conectando-com-o-orca)
5. [Configurar um projeto](#configurar-um-projeto)
6. [Cadastrar os painéis](#cadastrar-os-painéis)
7. [Apresentar o time](#apresentar-o-time)
8. [Uso no dia a dia](#uso-no-dia-a-dia)
9. [Servidor MCP](#servidor-mcp)
10. [O que o hook barra](#o-que-o-hook-barra)
11. [Arquivos e estado](#arquivos-e-estado)
12. [Variáveis de ambiente](#variáveis-de-ambiente)
13. [Solução de problemas](#solução-de-problemas)
14. [Atualizar e desinstalar](#atualizar-e-desinstalar)
15. [Limites conhecidos](#limites-conhecidos)

---

## Como funciona

```
 painel A (<project-prefix>-manager01-cc)                           painel B (<project-prefix>-master)
 ┌─────────────────────────────┐                        ┌──────────────────────────────┐
 │ orca orchestration send     │                        │                              │
 │   --to <project-prefix>-master          │                        │ [agent-board] Nova mensagem  │
 │   --type entrega ...        │                        │ c-2026...-ab12 (entrega) de  │
 └──────────────┬──────────────┘                        │ <project-prefix>-manager01-cc. Leia com: │
                │                                       │ orca orchestration check ... │
                ▼                                       └──────────────▲───────────────┘
   PreToolUse (hook_core.py)                                           │
   - quem envia? ($ORCA_TERMINAL_HANDLE → cadastro)                    │
   - destino é do mesmo projeto? tipo permitido ao papel?              │
   - troca o nome pelo term_… atual e põe o ID no assunto              │
   - grava a linha no comunicacoes.jsonl do projeto                    │
                │                                                      │
                ▼                                                      │
   correio do Orca ──────────────────────────────────────────▶ PostToolUse
                                                         (digita o aviso na tela
                                                          do destino, no máximo
                                                          1 a cada 60 s)

   Stop (fim do turno): se há mensagem recebida sem resposta, o hook segura o agente
   e mostra o comando pronto para responder (no máximo 3 vezes).
```

Todas as regras ficam num único arquivo, `scripts/hook_core.py`. O Claude Code chama esse arquivo direto. No OMP, quem chama é o adaptador `scripts/omp-agent-board.ts`.

---

## Requisitos

| O quê | Para quê |
|---|---|
| **Orca**, com os agentes rodando em terminais do Orca | O correio (`orca orchestration`) e o ID de cada painel (`$ORCA_TERMINAL_HANDLE`) |
| **CLI `orca`** acessível na máquina dos agentes | O hook usa a CLI para entregar mensagens e digitar avisos |
| **Python 3.8+** | O core dos hooks e o `painel.py`. Usa só a biblioteca padrão |
| **Claude Code** e/ou **OMP** | Os harnesses em que os hooks valem |
| **git** | O log de cada projeto é versionado |
| `jq` (opcional) | Consultar o log |

Linux e macOS. Os hooks usam `fcntl`, então não rodam no Windows nativo (WSL funciona).

---

## Instalação

A instalação é **uma vez por máquina**, na máquina em que os agentes rodam. Se você usa o Orca com workspace SSH, é o servidor remoto, não o seu Mac.

### 1. Coloque a skill numa pasta fixa

O recomendado é `~/.agents/skills/agent-board`, com links para os harnesses:

```bash
git clone https://github.com/BFLabsAI/agent-board.git ~/.agents/skills/agent-board

# Claude Code enxerga a skill
mkdir -p ~/.claude/skills
ln -s ../../.agents/skills/agent-board ~/.claude/skills/agent-board

# (opcional) outros harnesses que leem skills, ex.: Hermes
mkdir -p ~/.hermes/skills
ln -s ../../.agents/skills/agent-board ~/.hermes/skills/agent-board
```

> Os hooks ficam apontando para o caminho absoluto desta pasta. Não mova a pasta depois de instalar. Se precisar mover, rode o `install.sh` de novo.

### 2. Ligue os hooks

```bash
S=~/.agents/skills/agent-board/scripts
bash $S/install.sh
```

O instalador é idempotente, então dá para rodar quantas vezes quiser. Ele faz o seguinte:

- cria o diretório de estado `~/.agent-hooks/agent-board/`, com um cadastro vazio (`paineis.json`);
- **Claude Code:** acrescenta em `~/.claude/settings.json` as entradas `PreToolUse` (Bash, Edit/Write, SendMessage), `PostToolUse` (Bash) e `Stop`. Antes, guarda um backup do settings em `~/.agent-hooks/agent-board/settings.json.bak-<data>`. Se já houver entradas antigas do agent-board, troca pelas atuais e não mexe nos seus outros hooks;
- **OMP:** grava `~/.omp/agent/hooks/pre/agent-board.ts`, com o caminho do core já preenchido;
- **Servidor MCP:** se o `claude` estiver no PATH, registra o servidor `agent-board` em escopo de usuário (`claude mcp add --scope user`). Se já estiver registrado com o mesmo caminho, não faz nada. Sem o `claude`, mostra o comando para você rodar. Veja [Servidor MCP](#servidor-mcp).

### 3. Rode os testes

```bash
python3 $S/test_agent_board.py
```

Os testes rodam a seco: não enviam nada nem mexem no seu cadastro real. Todos precisam passar.

### 4. Confira

- **Claude Code:** abra uma sessão e rode `/hooks`. As entradas `agent-board` devem aparecer em PreToolUse, PostToolUse e Stop.
- **OMP:** abra uma sessão **nova** e rode `/extensions`. O `agent-board` deve aparecer.

> **Enquanto o cadastro estiver vazio, os hooks não agem sobre ninguém.** Pode instalar sem medo: nada muda até você cadastrar os painéis.

---

## Conectando com o Orca

O agent-board não tem servidor próprio. Ele usa duas coisas que o Orca já oferece.

### 1. O ID do painel: `$ORCA_TERMINAL_HANDLE`

Todo terminal aberto pelo Orca recebe a variável `ORCA_TERMINAL_HANDLE` (ex.: `term_<id>`). O hook lê essa variável para saber **quem está enviando**. O cadastro liga esse ID a um projeto e a um nome de agente.

```bash
echo $ORCA_TERMINAL_HANDLE      # rode dentro de um painel do Orca
```

Se a variável estiver vazia, o terminal não foi aberto pelo Orca e não participa do time.

> O ID **muda quando o painel é fechado e reaberto**. Por isso o cadastro fica fora do git, e o master recadastra quando preciso (veja [Manutenção](#manutenção)).

### 2. A CLI `orca`

O hook usa a CLI para:

- `orca orchestration send`: entregar a mensagem;
- `orca orchestration inbox`: conferir se o destino ainda tem mensagem não lida;
- `orca terminal read` e `orca terminal send`: ver se há um diálogo aberto na tela e digitar o aviso;
- `orca terminal list`: listar os painéis abertos, no `painel.py listar`.

Os hooks rodam com um `PATH` reduzido. Por isso, o core procura o `orca` nesta ordem:

1. `$ORCA_BIN`, se definida: força o binário (hooks e `painel.py`);
2. `$ORCA_REMOTE_CLI_BIN_DIR/orca`: o Orca define essa variável nos terminais de workspaces remotos (SSH);
3. o `orca` que estiver no `PATH`;
4. `~/.orca-relay/bin/orca`: o caminho padrão do relay remoto.

**Teste rápido de conexão**, dentro de um painel do Orca:

```bash
orca status                      # runtime do Orca alcançável?
orca terminal list               # lista os painéis abertos
python3 $S/painel.py listar      # mesma lista, com o cadastro do agent-board
```

Se `orca status` falhar, resolva a conexão com o Orca primeiro. Em workspace SSH, o app do Orca precisa estar aberto e conectado ao servidor.

#### Orca em workspace remoto (SSH)

É o cenário mais comum: o Orca roda no seu computador e os agentes rodam num servidor.

- Instale o agent-board **no servidor**, onde rodam o Claude Code e o OMP.
- A CLI `orca` do servidor vem do relay do Orca (`~/.orca-relay/bin/orca`) e conversa com o app no seu computador.
- Se o Orca for reiniciado ou a conexão cair, envios podem dar timeout. Espere reconectar e reenvie. O log grava a mensagem quando o hook aprova o envio.

---

## Configurar um projeto

Em cada projeto (repositório) que vai usar o time, faça uma vez:

```bash
python3 $S/painel.py init --raiz <project-path> --projeto <project-name> --prefixo <project-prefix>
```

- `--projeto`: o nome do projeto.
- `--prefixo`: curto, só letras minúsculas e números, sem hífen. Vira o começo do nome de todos os agentes (`<project-prefix>-master`…).

Isso cria:

```
docs/agent-board/
├── agent-board.json      # prefixo e papéis (quem pode mandar o quê a quem)
├── CONTRATO.md           # regras que todo agente do projeto lê
└── comunicacoes.jsonl    # o log (vazio)
.gitattributes            # + "docs/agent-board/comunicacoes.jsonl merge=union"
```

O `init` não sobrescreve nada que já exista. O `merge=union` evita conflito no log quando branches diferentes acrescentam linhas.

Depois:

1. Ajuste os papéis em `agent-board.json`, se quiser regras diferentes das padrão (veja [Papéis](#papéis)).
2. Acrescente uma linha nas instruções do projeto (`AGENTS.md`, `CLAUDE.md` ou equivalente): *"Agentes se falam só pelo `orca`, conforme `docs/agent-board/CONTRATO.md`."*
3. Faça o commit.

---

## Cadastrar os painéis

Quem cadastra é o **master**, o agente que coordena o time, ou você mesmo no terminal. Sempre com confirmação humana: **nunca cadastre por dedução**.

1. Abra os agentes no Orca, um por painel.
2. Liste os painéis:
   ```bash
   python3 $S/painel.py listar
   ```
   A saída traz ID (`term_…`), título e cadastro atual de cada terminal.
3. Monte a lista ID → nome, no padrão de nomes:

   | Papel | Nome |
   |---|---|
   | master (único) | `<project-prefix>-master` |
   | manager | `<project-prefix>-manager<NN>-<runtime>` |
   | researcher | `<project-prefix>-researcher<NN>-<runtime>` |

   Códigos de runtime: `cc` Claude Code, `omp` Oh My Pi, `cx` Codex, `agy` Antigravity, `oc` OpenCode, `hr` Hermes.

4. Confira a lista e cadastre:
   ```bash
   python3 $S/painel.py cadastrar --raiz <project-path> \
     term_aaaa…=<project-prefix>-master \
     term_bbbb…=<project-prefix>-manager01-cc \
     term_cccc…=<project-prefix>-manager01-omp \
     term_dddd…=<project-prefix>-researcher01-cc
   ```
   Com `--worktree`, cada manager ganha também a própria branch isolada (veja [Worktree por agente](#worktree-por-agente)).
5. (Opcional) Renomeie cada sessão com o mesmo nome (`/rename <project-prefix>-manager01-cc` no Claude Code e no OMP). Isso só ajuda a leitura na tela, porque a identidade continua sendo o ID do painel.

### Manutenção

| Situação | O que fazer |
|---|---|
| Painel fechado e reaberto (ID novo) | O envio dele é barrado com "peça ao master para recadastrar". Rode `cadastrar` só para ele: o recadastro substitui o ID antigo |
| Agente novo | `cadastrar` para ele e depois [apresente](#apresentar-o-time) |
| Agente saiu | `python3 $S/painel.py remover term_…` |

---

## Apresentar o time

Depois de cadastrar, o master manda um aviso a cada agente:

```bash
orca orchestration send --to <project-prefix>-manager01-cc --type aviso \
  --subject "Novo canal entre agentes" \
  --body "A partir de agora, falar com outros agentes só por orca orchestration send, conforme docs/agent-board/CONTRATO.md. Leia o contrato e responda com --type resposta."
```

Cada agente lê o contrato e responde, e essa resposta confirma que o canal funciona de ponta a ponta. Aproveite para aposentar canais paralelos: Runs de correio criadas à mão, `SendMessage` nativo entre sessões e `orca terminal send` direto.

---

## Uso no dia a dia

### Enviar

```bash
orca orchestration send --to <nome> --type <tipo> --subject "assunto curto" --body "texto"
```

| Tipo | Uso |
|---|---|
| `pedido` | Pede um trabalho. Para manager, exige `--modo orquestrar` (trabalha com subagents) ou `--modo executar` (faz ele mesmo) |
| `resposta` | Devolve um pedido ou responde um aviso. Exige `--responde-a <id>[,<id>…]`. **Fecha a conversa:** resposta não se responde |
| `aviso` | Informa algo sem pedir trabalho. Exige uma resposta curta |
| `escalacao` | Algo travou ou precisa de decisão. Vai para o master |
| `entrega` | Trabalho pronto para revisão ou merge. Vai para o master |

Outras regras de envio:

- **`--issues 412,413`** (opcional) liga a mensagem a Issues do GitHub. Conteúdo longo vai na Issue.
- **Nome curto vale:** `manager01-cc` vira `<project-prefix>-manager01-cc`.
- **O `orca` roda sozinho:** sem `&&`, `;`, `|`, redirecionamento ou `$( )` no mesmo comando.

O hook converte o tipo para o tipo aceito pelo Orca (pedido → `handoff`, os demais → `status`). Ele também põe o ID no assunto (`[c-20261007-101256-ab68 pedido·executar] …`) e acrescenta ao corpo um rodapé com o comando de resposta pronto.

### Receber

1. Aparece na tela:
   ```
   [agent-board] Nova mensagem c-… (pedido) de <project-prefix>-master. Leia com: orca orchestration check --terminal term_… --format
   ```
2. Rode o `check` **com `--format`**. Sem ele, aparece só o assunto.
3. Responda:
   - **pedido:** com o resultado ou com o bloqueio. Nunca "Recebido".
   - **aviso:** com uma resposta curta (pode ser "recebido, nada a fazer").
   - **resposta:** não se responde. Se ficou algo pendente, abra um `pedido` ou `aviso` novo.

### Papéis

Os papéis padrão ficam em `docs/agent-board/agent-board.json` e podem ser editados por projeto:

| Papel | Pode enviar | Pode pedir trabalho a |
|---|---|---|
| master | pedido, resposta, aviso | manager, researcher |
| manager | todos os tipos | manager, researcher |
| researcher | resposta, aviso, escalacao | ninguém |

### Consultar o log

```bash
jq -c 'select(.para=="<project-prefix>-master")' docs/agent-board/comunicacoes.jsonl
jq -c 'select(.tipo=="pedido")'     docs/agent-board/comunicacoes.jsonl
```

Cada linha do log tem este formato:

```json
{"id":"c-20261007-101256-ab68","ts":"2026-10-07T10:12:56+02:00","de":"<project-prefix>-manager01-cc","para":"<project-prefix>-researcher01-cc","tipo":"pedido","modo":null,"assunto":"Analisar pagamentos","issues":[412],"responde_a":null}
```

O log fica sempre no checkout principal do projeto. Quem faz merge inclui o log no commit.

Cada linha também leva `"prev"`, o sha256 da linha anterior (cadeia de hash). Linhas só com `{"id", "ts", "status"}` registram o destino de um envio: `falhou` tira a mensagem da cobrança, `reenviado` devolve.

**Pelo painel.py** (saída em [TOON](https://github.com/toon-format/toon) por padrão, que gasta bem menos tokens no contexto de um agente):

```bash
python3 $S/painel.py historico --raiz <project-path> --agente <project-prefix>-manager01-cc --n 20
python3 $S/painel.py historico --raiz <project-path> --sobre pagamentos --tudo --formato json
```

```
mensagens[2]{id,ts,de,para,tipo,modo,assunto,responde_a,issues}:
  c-20261007-101256-ab68,"2026-10-07T10:12:56+02:00",alpha-manager01-cc,alpha-researcher01-cc,pedido,null,Analisar pagamentos,null,412
  c-20261007-113000-0c1d,"2026-10-07T11:30:00+02:00",alpha-researcher01-cc,alpha-manager01-cc,resposta,null,Pagamentos analisados,c-20261007-101256-ab68,""
```

### Integridade, arquivo morto e reenvio (master)

| Comando | O que faz |
|---|---|
| `painel.py verificar --raiz <path>` | Confere a cadeia de hash do log e do arquivo morto. Linha editada ou apagada no meio aparece como `PROBLEMA`, e o comando sai com 1. Bifurcação de `merge=union` é normal. |
| `painel.py arquivar --raiz <path> [--dias 30]` | Move conversas fechadas e antigas para `docs/agent-board/arquivo/AAAA-MM.jsonl`. Mensagem que ainda espera resposta nunca sai do log ativo. Mantém o hook rápido. |
| `painel.py reenviar --raiz <path> <id>` | Reenvia a mensagem para o painel **atual** do destino (ex.: painel fechou antes de ler, ou o envio falhou). O comando completo de cada envio fica guardado por 7 dias em `~/.agent-hooks/agent-board/envios/`, fora do git. |

`arquivar` e `reenviar` escrevem no log: só o master (ou um humano num terminal fora do cadastro) roda.

### Notas do time

Memória compartilhada do time: decisões e contexto que não cabem numa mensagem e que ninguém deve precisar perguntar de novo.

```bash
python3 $S/painel.py nota --raiz <project-path> --tema pagamentos --decisao "Gateway: Stripe. Motivo: ..."
python3 $S/painel.py notas --raiz <project-path>                       # lista os temas
python3 $S/painel.py notas --raiz <project-path> --tema pagamentos     # as notas do tema (TOON; --formato json|md)
python3 $S/painel.py historico --raiz <project-path> --sobre pagamentos  # notas e mensagens do tema
```

- Cada nota é acrescentada em `docs/agent-board/notas/<tema>.md` (no git), com data, autor e a marca **Decisão** quando há `--decisao`.
- O tema vira um nome de arquivo seguro: só `a-z`, `0-9` e `-`, até 60 caracteres (`../../etc` vira `etc`).
- **Autor provado:** num painel cadastrado, o autor é sempre o agente daquele painel (`--de` é ignorado). Fora do cadastro (um humano), `--de <nome>` é obrigatório.
- Cada nota também vira uma linha no log: `{"id": "n-…", "ts", "de", "tipo": "nota", "tema", "decisao"}`. Sem `para`, ninguém é cobrado por ela.

### Resumo

Para voltar depois de um tempo fora e ver o que aconteceu, sem ler o log inteiro:

```bash
python3 $S/painel.py resumo --raiz <project-path> --desde 2h      # 30m, 2h, 1d (padrão 1d)
python3 $S/painel.py resumo --raiz <project-path> --formato toon  # para o contexto de um agente
```

Conta direto do log (sem LLM, sempre o mesmo resultado): mensagens por tipo, quanto cada agente enviou e recebeu, quem está esperando resposta (no log inteiro, não só no período), as últimas entregas e escalações, e as notas e decisões novas.

### Worktree por agente

```bash
python3 $S/painel.py cadastrar --raiz <project-path> --worktree term_…=<project-prefix>-manager01-cc ...
```

- Cada **manager** ganha um `git worktree` em `<project-path>/../<projeto>-worktrees/<agente>`, na branch `ab/<agente>`, criada a partir do HEAD da raiz. Worktree que já existe é reaproveitado. Master e researchers não ganham worktree.
- O caminho fica no cadastro (`"worktree"`). Recadastrar o agente sem `--worktree` mantém o worktree dele.
- Se o git falhar (raiz sem git, pasta ocupada), o comando explica, desfaz os worktrees que tinha criado e **não cadastra ninguém**.
- Numa `entrega` de quem tem worktree, a linha do log ganha `"branch"` (a branch atual do worktree).
- **O log continua no checkout principal** (a raiz do cadastro), não no worktree: o hook grava sempre em `<project-path>/docs/agent-board/`. Abra o agente dentro do worktree; quem faz o merge da branch dele é o master.

### Notificações

Depois de um envio bem-sucedido, o hook pode avisar fora do terminal. Roda num processo separado: falha de rede ou do `gh` nunca atrasa nem barra o envio, só vai para `avisos.log`.

- **Webhook:** defina `AGENT_BOARD_WEBHOOK` no ambiente dos agentes (nunca no git). Para os tipos de `AGENT_BOARD_WEBHOOK_TIPOS` (padrão `escalacao,entrega`), o hook faz `POST` JSON `{"text": "..."}`, formato aceito pelo Slack (incoming webhook) e por serviços compatíveis. Timeout de 10 s. A URL não aparece no `avisos.log`.
- **GitHub:** com `"github": {"comentar_entregas": true}` no `agent-board.json` do projeto, toda `entrega` com `--issues` vira um comentário em cada Issue (`gh issue comment`, rodado na raiz do projeto, timeout de 30 s). Sem o `gh` no PATH, o hook registra e segue. Vem desligado no template.

---

## Servidor MCP

No Claude Code, o agente também pode falar com o time por **ferramentas MCP** com parâmetros tipados, em vez de escrever o comando `orca` no shell. Acabam os erros de aspas no `--subject` e no `--body`.

| Ferramenta | O que faz |
|---|---|
| `board_send(para, tipo, assunto, corpo?, modo?, issues?, responde_a?, prazo?, veredito?)` | Envia uma mensagem. Mesmas regras do shell: `modo` em pedido para manager, `responde_a` em resposta. Devolve o id `c-…` |
| `board_inbox()` | Lê o correio do painel (`orca orchestration check --terminal <painel> --format`) |
| `board_pendentes()` | Mensagens recebidas ainda sem resposta, em TOON |
| `board_historico(agente?, sobre?, n?, tudo?)` | O mesmo filtro do `painel.py historico`, em TOON |
| `board_status()` | Quem sou eu (agente, papel, projeto), pendentes, versão e os agentes do projeto, em TOON |

**A regra continua uma só.** O `board_send` monta o mesmo `orca orchestration send …` e o passa pelo `decide()` do `hook_core.py`, antes e depois do envio, como o hook faria: barra, traduz o nome, grava o log e digita o aviso no destino. O servidor precisa chamar o `decide()` ele mesmo porque ferramenta MCP **não passa pelo PreToolUse do hook** (o matcher é só Bash, Edit/Write e SendMessage). O comando `orca` no shell continua valendo e continua passando pelo hook.

Como a regra é a do shell, o `corpo` também não aceita crase nem `$( )`.

A identidade é a mesma: `$ORCA_TERMINAL_HANDLE` do painel, que o Claude Code repassa ao servidor. Painel sem cadastro recebe erro pedindo o cadastro ao master.

O servidor é `scripts/mcp_server.py` (JSON-RPC 2.0 sobre stdio, só biblioteca padrão). O `install.sh` registra. Para registrar à mão:

```bash
claude mcp add --scope user agent-board -- python3 $S/mcp_server.py
claude mcp get agent-board   # confere
```

---

## O que o hook barra

O motivo de cada bloqueio vem na própria mensagem de erro, com a correção sugerida.

| Bloqueio | Por quê |
|---|---|
| Destino fora do time ou de outro projeto | Agente cadastrado só fala com cadastrados do mesmo projeto. A mensagem lista os nomes válidos |
| Tipo não permitido ao papel | Ex.: researcher não faz `pedido` |
| `pedido` para manager sem `--modo` | O manager precisa saber se orquestra ou executa |
| `resposta` sem `--responde-a`, ou respondendo a uma `resposta` | Toda resposta aponta para uma mensagem, e resposta fecha a conversa |
| `orca` encadeado com outro comando | Para o hook conseguir validar e registrar o envio |
| `orca orchestration reply` / `ask` entre agentes do time | Ficam fora do registro. Use `send --type resposta` / `pedido` |
| `orca terminal send` no painel de outro agente | Só o master pode, e só nos painéis do próprio time |
| `SendMessage` nativo do Claude Code para agente do time | Fica sem registro e pode travar esperando aprovação |
| Subagent mandando mensagem | Só a sessão principal fala com outros agentes |
| Escrita direta no log ou no cadastro (`>>`, `sed -i`, Edit/Write…) | O log é escrito só pelo hook, e o cadastro só pelo `painel.py`. Ler é livre |
| Painel não cadastrado tentando falar com o time | Peça ao master para cadastrar ou recadastrar |
| Encerrar o turno com mensagem sem resposta | O hook segura até 3 vezes, mostrando o comando pronto. Depois registra no `avisos.log` |

Um painel **sem cadastro** que não fala com o time não é afetado em nada. Os hooks são seguros em máquinas compartilhadas.

---

## Arquivos e estado

| Arquivo | Onde | O que é |
|---|---|---|
| `scripts/hook_core.py` | skill | Todas as regras: antes do envio, depois do envio e ao encerrar |
| `scripts/omp-agent-board.ts` | skill | Adaptador do OMP para o mesmo core |
| `scripts/painel.py` | skill | `init`, `listar`, `cadastrar`, `remover`, os comandos de log de `cmd_log.py` e os do time de `cmd_time.py` |
| `scripts/cmd_time.py` | skill | `nota`, `notas`, `resumo` e o worktree por agente do `cadastrar --worktree` |
| `scripts/notificar.py` | skill | Webhook e comentário no GitHub depois de um envio (processo separado) |
| `scripts/base.py`, `registro.py`, `protecao.py`, `avisos.py`, `toon.py` | skill | Módulos do core: caminhos e trava, log com cadeia de hash, proteção do log, aviso na tela, saída TOON |
| `scripts/mcp_server.py`, `mcp_ferramentas.py` | skill | Servidor MCP com as ferramentas `board_*`, que usam as regras do `hook_core.py` |
| `scripts/install.sh` | skill | Liga os hooks e registra o servidor MCP (idempotente, com backup) |
| `scripts/test_agent_board.py`, `test_registro.py`, `test_mcp.py`, `test_time.py` | skill | Testes a seco |
| `templates/CONTRATO.md` | skill → projeto | Vira `docs/agent-board/CONTRATO.md` |
| `templates/agent-board.json` | skill → projeto | Vira `docs/agent-board/agent-board.json` |
| `SKILL.md` | skill | Procedimento do master, que o agente lê ao usar a skill |
| `~/.agent-hooks/agent-board/paineis.json` | máquina, fora do git | Cadastro: ID do painel → projeto e agente |
| `~/.agent-hooks/agent-board/avisos.log` | máquina | Avisos digitados, suprimidos e encerramentos sem resposta |
| `~/.agent-hooks/agent-board/avisos-estado.json` | máquina | Controle do limite de 1 aviso por destino a cada 60 s |
| `~/.agent-hooks/agent-board/pendentes/`, `cobrancas/` | máquina | Estado interno entre o pré e o pós-envio, e contagem das cobranças |
| `~/.agent-hooks/agent-board/envios/` | máquina | Comando completo de cada envio (7 dias), para o `reenviar` |
| `~/.agent-hooks/agent-board/travas/` | máquina | Arquivos de trava do log de cada projeto |
| `docs/agent-board/comunicacoes.jsonl` | projeto, no git | O log das mensagens |
| `docs/agent-board/arquivo/AAAA-MM.jsonl` | projeto, no git | Arquivo morto do log (`painel.py arquivar`) |
| `docs/agent-board/notas/<tema>.md` | projeto, no git | Notas e decisões do time (`painel.py nota`) |
| `<project-path>/../<projeto>-worktrees/<agente>` | máquina | Worktree de cada manager (`cadastrar --worktree`), branch `ab/<agente>` |

---

## Variáveis de ambiente

| Variável | Padrão | Uso |
|---|---|---|
| `AGENT_BOARD_HOME` | `~/.agent-hooks/agent-board` | Onde fica o estado (cadastro, avisos). Defina antes do `install.sh` e no ambiente dos agentes |
| `AGENT_BOARD_JANELA_AVISO` | `60` | Segundos mínimos entre dois avisos digitados no mesmo destino |
| `AGENT_BOARD_WEBHOOK` | vazia (desligado) | URL do webhook que recebe `{"text": "..."}` a cada envio dos tipos escolhidos. É segredo: só no ambiente, nunca no git |
| `AGENT_BOARD_WEBHOOK_TIPOS` | `escalacao,entrega` | Tipos que vão para o webhook, separados por vírgula |
| `ORCA_BIN` | autodetectado | Força o binário do `orca` usado pelos hooks e pelo `painel.py` |
| `ORCA_TERMINAL_HANDLE` | definida pelo Orca | ID do painel. Não defina à mão |
| `ORCA_REMOTE_CLI_BIN_DIR` | definida pelo Orca | Pasta da CLI `orca` em workspaces remotos |

---

## Solução de problemas

**A mensagem foi barrada.** Leia o motivo no bloqueio, porque ele traz a correção (veja [O que o hook barra](#o-que-o-hook-barra)).

**"Painel não cadastrado" / "peça ao master para recadastrar".** O painel foi reaberto e ganhou um ID novo. Rode `painel.py listar` e `painel.py cadastrar` para esse agente.

**O aviso não apareceu na tela do destino.** Veja `~/.agent-hooks/agent-board/avisos.log`. As causas comuns são:
- havia um diálogo aberto na tela do destino (pergunta, permissão), e o hook não digita por cima;
- outro aviso tinha sido digitado há menos de 60 s;
- o destino já tinha lido tudo.

Em todos os casos, a mensagem continua no correio: `orca orchestration check --terminal <term> --format`.

**Nada acontece, nenhum hook age.**
- Confira `/hooks` (Claude Code) ou `/extensions` (OMP, só em sessão aberta depois da instalação).
- Confira se o painel está no `paineis.json` (`painel.py listar`).
- Confira se `echo $ORCA_TERMINAL_HANDLE` retorna um ID.

**`orca` não encontrado ou timeout no envio.** Rode `orca status`. Em workspace SSH, o app do Orca precisa estar aberto e conectado. Depois que ele reconectar, reenvie.

**O agente fica preso no fim do turno.** Ele tem mensagem sem resposta. O próprio aviso do hook traz o comando de resposta pronto. Depois de 3 tentativas, o hook libera e registra.

---

## Atualizar e desinstalar

**Atualizar:**

```bash
cd ~/.agents/skills/agent-board && git pull
bash scripts/install.sh && python3 scripts/test_agent_board.py
```

Se o contrato mudou, atualize cada projeto, faça o commit e avise o time com um `aviso`:

```bash
python3 $S/painel.py init --raiz <project-path> --projeto <project-name> --prefixo <project-prefix> --atualizar-contrato
```

**Desinstalar:**

1. Tire de `~/.claude/settings.json` as entradas de hook que contêm `agent-board`. Há backup em `~/.agent-hooks/agent-board/settings.json.bak-*`.
2. Apague `~/.omp/agent/hooks/pre/agent-board.ts`.
3. Tire o servidor MCP: `claude mcp remove --scope user agent-board`.
4. (Opcional) Apague `~/.agent-hooks/agent-board/` e os links em `~/.claude/skills` e `~/.hermes/skills`.

Para só **desligar** sem desinstalar, esvazie o cadastro: com `paineis.json` vazio, os hooks não agem sobre ninguém.

---

## Limites conhecidos

- O hook só vê o que passa pelas ferramentas de shell e pelo `SendMessage`. Um script que chama o `orca` por dentro escapa da checagem, e o contrato proíbe isso.
- O correio do Orca por terminal não sobrevive se o painel fechar antes de ler. A linha no log fica, e `painel.py reenviar` manda de novo.
- A cadeia de hash acusa linha editada ou apagada no meio do log, mas não a remoção da **última** linha. Ela torna a adulteração visível, não impossível.
- O aviso na tela é digitado como se fosse texto do usuário. Por isso, o hook não digita quando há um diálogo aberto no destino.
- Num pedido longo, com subagents rodando em segundo plano, o hook de fim de turno pode cobrar a resposta antes de o trabalho terminar. Depois de 3 cobranças, ele libera.
- Os hooks valem para Claude Code e OMP. Outros harnesses seguem o contrato sem trava automática.
- As notas em `docs/agent-board/notas/` são Markdown comum: a autoria provada é a da linha no log, não a do cabeçalho no arquivo, que pode ser editado como qualquer arquivo do repositório.
- A notificação (webhook, GitHub) não tem nova tentativa: se falhar, fica só a linha no `avisos.log`.

---

## Licença

MIT. Veja [LICENSE](LICENSE).
