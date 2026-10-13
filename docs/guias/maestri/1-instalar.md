# 1. Instalar (Maestri)

> **Em 1 minuto:** você instala a skill e liga os **hooks** (travas automáticas do Claude Code) na máquina onde o Maestri roda os terminais. No fim, os testes passam, um terminal do canvas se reconhece como `maestri:<id>` e o terminal do master está em modo Maestro.

**Antes:** Maestri aberto, com um terminal no canvas. Python 3.8+ e git na máquina. O `install.sh` é bash: no Windows, use WSL (não testado fora dele).

## Passo 1 — Clonar a skill numa pasta fixa

Instale na máquina em que o app do Maestri roda os terminais, uma vez por máquina.

```bash
git clone https://github.com/BFLabsAI/agent-board.git ~/.agents/skills/agent-board
mkdir -p ~/.claude/skills
ln -s ../../.agents/skills/agent-board ~/.claude/skills/agent-board
```

Não mova a pasta depois: os hooks apontam para o caminho absoluto dela. Se mover, rode o `install.sh` de novo.

✅ **Deu certo se:** `ls ~/.claude/skills/agent-board/scripts` lista `board.py` e `painel.py`.

## Passo 2 — Ligar os hooks

```bash
S=~/.agents/skills/agent-board/scripts
bash $S/install.sh
```

O instalador pode rodar quantas vezes quiser. Ele cria o estado em `~/.agent-hooks/agent-board/` (cadastro vazio), liga os hooks no Claude Code (com backup do settings), grava o adaptador do OMP e registra o servidor MCP `agent-board` se o `claude` estiver no PATH.

✅ **Deu certo se:** a última linha diz `agent-board <versão> instalado: hooks -> …`. No Claude Code, `/hooks` mostra as entradas `agent-board`.

Com o cadastro vazio, os hooks não agem sobre ninguém. Pode instalar sem medo.

## Passo 3 — Rodar os testes

```bash
for t in $S/test_*.py; do python3 "$t" || break; done
```

Os testes rodam a seco: não enviam nada e não mexem no cadastro real. O `test_maestri.py` usa uma CLI `maestri` falsa.

✅ **Deu certo se:** todos passam, sem parar no meio.

## Passo 4 — Conferir o que o Maestri precisa

O agent-board usa duas coisas que o Maestri põe em cada terminal do canvas:

| O quê | Para quê |
|---|---|
| `$MAESTRI_TERMINAL_ID` | A identidade do terminal. Vira o **painel** (o terminal de um agente) `maestri:<id>` |
| CLI `maestri` | Entregar a mensagem (`maestri ask`), ler o nome do terminal (`maestri list`), criar cordas e routines |

A CLI é procurada em `$MAESTRI_CLI`, depois no `PATH`, depois em `~/.maestri/bin/maestri`. Confira num terminal do canvas:

```bash
python3 $S/painel.py eu
```

✅ **Deu certo se:** aparece `transporte: maestri`, `handle: maestri:<id>` e `nome_canvas:` com o nome do terminal. Antes do cadastro, a última linha diz `sem cadastro: peça ao master (ou rode painel.py solicitar)`.

Se o terminal também tiver `$ORCA_TERMINAL_HANDLE`, o Orca ganha: `transporte` sai `orca`.

## Passo 5 — Ligar o modo Maestro no terminal do master

O **modo Maestro** é um interruptor do Maestri, por terminal. Só o terminal em modo Maestro pode recrutar agentes (`maestri recruit`), criar cordas (`maestri connect`) e routines (`maestri routine`).

O master precisa dele para:
- recrutar o time a partir do terminal dele;
- rodar `painel.py maestri conectar --aplicar` (cria as cordas que as regras exigem);
- rodar `painel.py maestri rotina --aplicar` (agenda o `vigiar`).

Ligue o modo Maestro no terminal do master, pelo canvas do app. Depois confira:

```bash
maestri list
```

✅ **Deu certo se:** sob `You:` aparece `maestro: true`.

## Se der errado

| Você vê | Faça |
|---|---|
| Um teste falha | Não siga. Leia a mensagem do teste e confira a versão do Python (3.8+) |
| `painel.py eu`: "este terminal não está no Orca nem no Maestri" | Rode dentro de um terminal do canvas. Fora dele não há `$MAESTRI_TERMINAL_ID` |
| `nome_canvas: -` | A CLI `maestri` não respondeu. Rode `maestri debug` |
| `/hooks` sem `agent-board` | Rode o `install.sh` de novo e abra uma sessão nova do Claude Code |
| "This terminal is not the Maestro" | O modo Maestro está desligado neste terminal. Ligue pelo canvas |
| "Claude Code (claude) não está no PATH" | O MCP não foi registrado. Rode o comando que o instalador mostrou |

Detalhes do que cada hook barra: [Hooks e limites](../../referencia/hooks-e-limites.md). Variáveis de ambiente: [Config](../../referencia/config.md).

**Próximo:** [2. Montar o time](2-montar-o-time.md)
