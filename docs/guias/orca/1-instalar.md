# 1. Instalar (Orca)

> **Em 1 minuto:** você coloca a skill numa pasta fixa, liga os hooks e roda os testes. É uma vez por máquina. No fim, os hooks estão ativos, mas não agem sobre ninguém até você cadastrar o time.

**Antes:** Python 3.8+, git, Claude Code e/ou OMP, e o Orca com a CLI `orca`. Veja [O que o Orca precisa](#o-que-o-orca-precisa).

**Onde instalar:** na máquina em que os agentes rodam. Com workspace SSH no Orca, é o servidor remoto, não o seu computador.

## Passo 1 — Clonar numa pasta fixa

```bash
git clone https://github.com/BFLabsAI/agent-board.git ~/.agents/skills/agent-board
mkdir -p ~/.claude/skills
ln -s ../../.agents/skills/agent-board ~/.claude/skills/agent-board
```

Os hooks apontam para o caminho absoluto dessa pasta. Não mova a pasta depois. Se mover, rode o Passo 2 de novo.

✅ **Deu certo se:** `ls ~/.claude/skills/agent-board/SKILL.md` mostra o arquivo.

## Passo 2 — Ligar os hooks

```bash
S=~/.agents/skills/agent-board/scripts
bash $S/install.sh
```

O instalador pode rodar quantas vezes quiser. Ele:
- cria `~/.agent-hooks/agent-board/` com um cadastro vazio (`paineis.json`);
- acrescenta os hooks em `~/.claude/settings.json`, com backup antes (`settings.json.bak-<data>`);
- grava o hook do OMP em `~/.omp/agent/hooks/pre/agent-board.ts`;
- registra o servidor MCP `agent-board` no Claude Code. Sem o `claude` no PATH, ele mostra o comando para você rodar.

✅ **Deu certo se:** a última linha diz `agent-board <versão> instalado: hooks -> ...`.

## Passo 3 — Rodar os testes

```bash
for t in $S/test_*.py; do python3 "$t" || break; done
```

Os testes rodam a seco: não enviam nada e não mexem no seu cadastro.

✅ **Deu certo se:** cada arquivo termina com `OK` (ou `N/N ok`) e o laço não para no meio.

## Passo 4 — Conferir os hooks

- **Claude Code:** abra uma sessão e rode `/hooks`.
- **OMP:** abra uma sessão **nova** e rode `/extensions`.
- **MCP:** rode `claude mcp list` (deve listar `agent-board`) e `claude mcp get agent-board`.

✅ **Deu certo se:** aparecem entradas `agent-board` em PreToolUse, PostToolUse e Stop; o OMP lista o `agent-board`; o MCP aponta para o `mcp_server.py`.

O instalador já registra o MCP para você (escopo de usuário, vale em todos os projetos). Para registrar só num projeto, ou se o Claude Code pedir aprovação, veja o [guia do MCP](../mcp.md).

## O que o Orca precisa

O agent-board não tem correio próprio. Ele usa duas coisas do Orca.

| Peça | Para quê | Como conferir |
|---|---|---|
| `$ORCA_TERMINAL_HANDLE` | ID do painel (`term_...`). Prova quem está enviando | `echo $ORCA_TERMINAL_HANDLE` dentro do painel |
| CLI `orca` | Entrega (`orchestration send`), lista painéis (`terminal list`), lê a tela e digita o aviso (`terminal read`/`send`) | `orca status` |

- Variável vazia: o terminal não foi aberto pelo Orca e não entra no time.
- O ID **muda quando o painel é fechado e reaberto**. Aí é preciso recadastrar (veja [4. Problemas](4-problemas.md)).
- Os hooks rodam com `PATH` reduzido. O `orca` é procurado nesta ordem: `$ORCA_BIN`, `$ORCA_CLI_BIN_DIR/orca` (terminal aberto por um Orca server), `$ORCA_REMOTE_CLI_BIN_DIR/orca` (terminal aberto por SSH), o `orca` do `PATH`, `~/.orca-relay/bin/orca`.

Teste rápido, dentro de um painel do Orca:

```bash
orca status
orca terminal list
python3 $S/painel.py listar
```

✅ **Deu certo se:** os três listam o runtime e os painéis abertos, sem erro.

### Workspace remoto (Orca server ou SSH)

É o caso mais comum: o Orca roda no seu computador e os agentes num servidor.

- Instale o agent-board **no servidor**.
- **Recomendado: Orca server** (`orca serve` no servidor, pareado com o app). O runtime, o correio e os terminais ficam no servidor, e os agentes não dependem do seu computador estar ligado. A CLI é o shim do servidor (`$ORCA_CLI_BIN_DIR/orca`, já no `PATH` dos painéis).
- **Modo SSH:** a CLI `orca` vem do relay (`~/.orca-relay/bin/orca`) e fala com o app no seu computador. O app precisa estar aberto e conectado; se a conexão cair, o envio pode dar timeout: espere reconectar e reenvie.
- Não misture os dois: um painel aberto pelo servidor que chama o relay SSH fala com outro runtime e recebe "no live pane bound to a Run". Ao migrar para o Orca server, remova o host SSH do app.

## Se der errado

| Você vê | Faça |
|---|---|
| `/hooks` não mostra `agent-board` | Rode `bash $S/install.sh` de novo e abra uma sessão nova |
| OMP sem `agent-board` em `/extensions` | O hook só vale em sessão aberta depois da instalação. Abra outra |
| Quero testar um adaptador sem o instalado | `omp --no-extensions --hook /caminho/omp-agent-board.ts` (detalhes em [Hooks e limites](../../referencia/hooks-e-limites.md)) |
| `claude: command not found` no install | Rode à mão: `claude mcp add --scope user agent-board -- python3 $S/mcp_server.py` |
| `orca status` falha | Resolva a conexão com o Orca primeiro. Em SSH, abra o app e reconecte |
| `painel.py listar` diz `orca indisponível` | O `orca` não foi achado. Defina `ORCA_BIN` com o caminho do binário |
| Um teste falha | Não siga adiante. Confira a versão do Python (`python3 --version`) |

Enquanto o cadastro estiver vazio, os hooks não agem sobre ninguém. Pode instalar sem medo.

**Próximo:** [2. Montar o time](2-montar-o-time.md)
