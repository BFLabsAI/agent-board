# 2. Montar o time (Orca)

> **Em 1 minuto:** você cria a config do projeto, lista os painéis abertos, monta a lista de nomes, confirma com o humano, cadastra e apresenta o time. No fim, cada agente já respondeu pelo canal novo.

**Antes:** a skill instalada ([1. Instalar](1-instalar.md)) e os agentes abertos no Orca, um por painel. Quem faz estes passos é o **master** (o agente que coordena) ou você, num terminal.

```bash
S=~/.agents/skills/agent-board/scripts
```

## Passo 1 — Criar a config do projeto

Uma vez por projeto. Combine antes o **prefixo**: curto, só minúsculas e números, sem hífen (ex.: `app`).

```bash
python3 $S/painel.py init --raiz <projeto> --projeto <nome> --prefixo <prefixo> --transporte orca
```

Cria `docs/agent-board/` com `agent-board.json` (papéis e a interface do time: `"transporte": "orca"`), `CONTRATO.md` (regras que todo agente lê, **já escrito para o Orca**) e o log vazio `comunicacoes.jsonl`. Acrescenta `merge=union` do log no `.gitattributes`. Não sobrescreve nada que já exista. Rodando num terminal do Orca, dá para omitir `--transporte`: ele detecta.

Depois, ponha uma linha nas instruções do projeto (`AGENTS.md`, `CLAUDE.md`…): *"Agentes se falam só pelo agent-board, conforme `docs/agent-board/CONTRATO.md`."* Faça o commit.

✅ **Deu certo se:** aparecem as linhas `criado .../agent-board.json`, `criado .../CONTRATO.md` e `criado .../comunicacoes.jsonl`.

Quer regras diferentes das padrão? Veja [Papéis e mensagens](../../conceitos/papeis-e-mensagens.md) e [Config](../../referencia/config.md).

## Passo 2 — Listar os painéis

```bash
python3 $S/painel.py listar
```

✅ **Deu certo se:** cada linha traz o ID (`term_...`), o título do painel e `(sem cadastro)`.

## Passo 3 — Montar a lista de nomes

Ligue cada ID a um nome, neste padrão:

| Papel | Nome | Exemplo |
|---|---|---|
| master (único) | `<prefixo>-master` | `app-master` |
| manager (o developer) | `<prefixo>-manager<NN>-<runtime>` | `app-manager01-cc` |
| researcher (só leitura) | `<prefixo>-researcher<NN>-<runtime>` | `app-researcher01-cc` |

Runtime: `cc` Claude Code, `omp` Oh My Pi, `cx` Codex, `agy` Antigravity, `oc` OpenCode, `hr` Hermes.

✅ **Deu certo se:** cada painel do time tem um nome, e só existe um master.

## Passo 4 — Confirmar com o humano

**Mostre a lista ao humano e espere o "ok".** Nunca cadastre por dedução: um ID trocado faz um agente falar em nome de outro.

✅ **Deu certo se:** o humano confirmou a lista, ID por ID.

## Passo 5 — Cadastrar

```bash
python3 $S/painel.py cadastrar --raiz <projeto> \
  term_aaaa=app-master \
  term_bbbb=app-manager01-cc \
  term_cccc=app-researcher01-cc
```

**Opcional — branch isolada por manager:** acrescente `--worktree` ao mesmo comando. Cada manager ganha um worktree em `<projeto>/../<nome>-worktrees/<agente>`, na branch `ab/<agente>`. O log continua no checkout principal. Quem faz o merge é o master. Se o git falhar, nada é cadastrado.

Opcional também: renomeie cada sessão com o mesmo nome (`/rename app-manager01-cc`). Só ajuda a ler a tela. A identidade é o ID do painel.

✅ **Deu certo se:** sai uma linha `cadastrado term_... = <nome>/<agente>` por painel, e o `listar` mostra o cadastro.

## Passo 6 — Apresentar o time

O master manda um `aviso` a cada agente pelo canal novo:

```bash
orca orchestration send --to app-manager01-cc --type aviso --subject "Novo canal entre agentes" --body "A partir de agora, falar com outros agentes só por orca orchestration send, conforme docs/agent-board/CONTRATO.md. Leia o contrato e responda com --type resposta."
```

A resposta de cada um prova que o canal funciona de ponta a ponta. Na mesma virada, aposente os canais paralelos: Runs de correio feitas à mão, `SendMessage` nativo entre sessões e `orca terminal send` direto.

✅ **Deu certo se:** cada agente respondeu com `--type resposta --responde-a <id>`.

**Pelo MCP:** os agentes do time podem usar `board_send` em vez do comando `orca orchestration send`. Cada agente precisa ter o servidor `agent-board` registrado e aprovado no Claude Code. Veja o [guia do MCP](../mcp.md).

## Se der errado

| Você vê | Faça |
|---|---|
| `prefixo: só letras minúsculas e números, sem hífen` | Escolha outro prefixo, ex.: `app` ou `loja2` |
| `nome fora do padrão ...` | Corrija o nome conforme a tabela do Passo 3 |
| `listar` diz `orca indisponível` | Veja [1. Instalar](1-instalar.md#o-que-o-orca-precisa) |
| `--worktree: ... Nada foi cadastrado` | A raiz precisa ser um repositório git com commit, e a pasta do worktree não pode estar ocupada |
| O aviso de apresentação não chega | Veja [4. Problemas](4-problemas.md) |

**Próximo:** [3. Dia a dia](3-dia-a-dia.md)
