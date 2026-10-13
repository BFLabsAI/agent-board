# 4. Problemas e manutenção (Maestri)

> **Em 1 minuto:** ache na tabela o que você vê e faça o que está ao lado. O motivo de um bloqueio sempre vem na própria mensagem. No fim, como incluir ou tirar um agente, atualizar e desinstalar.

**Antes:** `S=~/.agents/skills/agent-board/scripts`. O estado fica em `~/.agent-hooks/agent-board/` (ou em `$AGENT_BOARD_HOME`). Tudo o que o hook barra: [Hooks e limites](../../referencia/hooks-e-limites.md).

## Envio

| Você vê | Faça |
|---|---|
| `c-… NÃO entregue (o log marca como falhou; …)` | O `maestri ask` falhou nos primeiros 3 s. Leia `~/.agent-hooks/agent-board/maestri-ask/<id>.log`. Quase sempre é falta de corda ou nome mudado: veja as duas linhas abaixo |
| `Terminal '…' not found` ou `… is not connected` no log do ask | Sem corda: o master roda `painel.py maestri conectar --raiz <projeto> --aplicar`. Depois, `painel.py reenviar --raiz <projeto> <id>` |
| O nome do destino no canvas mudou | O destino roda `solicitar` de novo e o master recadastra (seção "Cadastro"). Depois, `reenviar` |
| `… é do time: mensagem entre agentes do time passa pelo agent-board` | `maestri ask` direto com agente do time é barrado. Use `python3 $S/board.py send` (ou `board_send`) |
| `não digite no painel de outro agente (…)` | `maestri ask --raw` em agente do time é só do master, e só nos terminais do próprio time |
| `não consegui ler o maestri ask` | Confira as aspas (e o JSON do `--batch`) e rode o comando sozinho |
| `… está no Maestri: o orca não entrega lá` | Use `board.py send` com as mesmas flags |
| `este painel (…) não está cadastrado no agent-board` | Rode `painel.py solicitar` e peça ao master para cadastrar |
| `… não é um agente cadastrado do projeto …` | Use um dos nomes que a mensagem lista |
| `subagent não fala com outros agentes` | Devolva para a sessão principal enviar |
| Texto chegou cortado ou com comando executado | Você usou aspas duplas com `$( )` ou crase. Use aspas simples ou `--body-file <arquivo>` |

## Cadastro e canvas

| Você vê | Faça |
|---|---|
| `solicitar`: `não consegui ler o nome deste terminal no canvas` | Rode `maestri list` e `maestri debug` nesse terminal. Sem `You:` na saída do `list`, a CLI não está falando com o app |
| `solicitar é para terminais do Maestri` | O terminal tem `$ORCA_TERMINAL_HANDLE` ou não está no canvas. Confira com `painel.py eu` |
| Terminal recriado (ID novo) ou renomeado no canvas | No terminal: `painel.py solicitar --raiz <projeto> --agente <nome>`. O master: `solicitacoes`, "ok" do humano, `cadastrar`. O cadastro novo substitui o antigo. Rode `maestri conectar` se faltar corda |
| `This terminal is not the Maestro` | Ligue o modo Maestro neste terminal pelo canvas. Confira com `maestri list` (`maestro: true`) |
| `painel.py maestri conectar é só do master` | Peça ao master. `conectar`, `rotina`, `reenviar` e `vigiar` são dele |

## Na tela e no log

| Você vê | Faça |
|---|---|
| Mensagem misturada com o que o humano digitava | O `maestri ask` digita no terminal. Não digite nos terminais dos agentes enquanto o time troca mensagens. O master reenvia: `painel.py reenviar --raiz <projeto> <id>` |
| Agente respondeu só no chat | Não vale: não entra no log nem fecha a pendência. Peça a resposta pelo `board.py send`, como mostra o rodapé |
| Agente não Claude Code encerra sem responder | Sem hook, não há cobrança no fim do turno. Cobre pelo `board.py` e confira o `tarefas` |
| Precisa reenviar uma mensagem | `painel.py reenviar --raiz <projeto> <id>` (só o master). Vai para o terminal atual do destino. O comando de cada envio fica guardado por 7 dias |
| `verificar` mostra `PROBLEMA` e sai com 1 | Alguém editou ou apagou uma linha do log no meio. Ninguém edita o log à mão. Veja no git quem mudou (`git log -p docs/agent-board/comunicacoes.jsonl`) |

## Manutenção

**Incluir um agente**
1. `maestri recruit "<prefixo>-manager03-cc" --preset "Claude Code"` (modo Maestro).
2. No terminal dele: `painel.py solicitar --raiz <projeto> --agente <prefixo>-manager03-cc`.
3. Master: `solicitacoes`, "ok" do humano, `cadastrar`, `maestri conectar --aplicar`.
4. Mensagem de virada só para ele ([passo 7 do guia 2](2-montar-o-time.md)).

**Tirar um agente**
```bash
python3 $S/painel.py remover maestri:<id>
```
Para fechar o terminal também: `maestri dismiss "<nome>"` (modo Maestro). Isso apaga o terminal do canvas.

**Atualizar**
```bash
cd ~/.agents/skills/agent-board && git pull
bash scripts/install.sh && for t in scripts/test_*.py; do python3 "$t" || break; done
```
Se o contrato mudou: `painel.py init --raiz <projeto> --projeto <nome> --prefixo <prefixo> --atualizar-contrato`, commit e um `aviso` ao time.

**Desinstalar**
1. Tire de `~/.claude/settings.json` as entradas de hook com `agent-board`. Há backup em `~/.agent-hooks/agent-board/settings.json.bak-*`.
2. Apague `~/.omp/agent/hooks/pre/agent-board.ts`.
3. Tire o MCP: `claude mcp remove --scope user agent-board`.
4. Se criou a routine: `maestri routine delete "agent-board vigiar <projeto>"` (modo Maestro).

Só quer desligar? Esvazie o cadastro: com `paineis.json` vazio, os hooks não agem sobre ninguém.

Arquivos e onde ficam: [Arquivos e estado](../../referencia/arquivos-e-estado.md). Limites do Maestri: [ADR-0006](../../adr/0006-maestri-como-transporte.md).

**Próximo:** volte ao [índice do Maestri](README.md).
