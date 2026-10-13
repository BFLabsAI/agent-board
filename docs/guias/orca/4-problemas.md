# 4. Problemas e manutenção (Orca)

> **Em 1 minuto:** quase todo problema mostra o motivo na própria mensagem de erro. Aqui você acha o sintoma, a correção e como incluir, tirar, atualizar ou desinstalar.

**Antes:** o time funcionando ([3. Dia a dia](3-dia-a-dia.md)).

```bash
S=~/.agents/skills/agent-board/scripts
```

## Mensagem barrada

O bloqueio começa com `Barrado pelo agent-board:` e diz o que corrigir. Os motivos comuns:

| Você vê | Faça |
|---|---|
| `... não é um agente cadastrado do projeto ...` | Use um dos nomes da lista que vem no erro. Faltou alguém? Peça ao master |
| `... é de outro projeto ...` | Mensagem entre projetos não passa. Fale só com o seu time |
| `use --type com um tipo do time` / `... não envia '<tipo>'` | Use um tipo permitido ao seu papel ([Papéis e mensagens](../../conceitos/papeis-e-mensagens.md)) |
| `pedido para manager precisa de --modo ...` | Acrescente `--modo orquestrar` ou `--modo executar` |
| `resposta precisa de --responde-a ...` | Acrescente `--responde-a <id>` da mensagem que você recebeu |
| `resposta a entrega ... precisa de --veredito ...` | Acrescente `--veredito aprovado` ou `rejeitado` |
| `--prazo só vale em pedido` / `--prazo inválido` | Tire o `--prazo`, ou use `30m`, `2h`, `1d` |
| `... já é uma resposta, e resposta não se responde` | Não responda. Se falta algo, mande `pedido` ou `aviso` novo |
| `andamento só vale para pedido ...` / `o andamento de ... vai para quem fez o pedido` | `andamento` só para pedido aberto, e para quem pediu |
| `... já tem N pedido(s) aberto(s) ...` | Espere, use `--to papel:<papel>` ou mande `escalacao` ao master |
| `... não tem ligação com ...` | O par não está nas `ligacoes` da config. Mande `escalacao` ao master |
| `rode o comando orca sozinho ...`, ou o erro sobre crase e `$( )` | Um envio por comando, sem `&&`, `;`, `|`, crase ou `$( )`. Ou use o `board_send` |
| `agente do time não usa orchestration reply/ask` | Use `send --type resposta` ou `send --type pedido` |
| `... não se edita à mão` | Log e cadastro só mudam pelo agent-board. Para ler, use `cat`, `jq` ou `grep` |
| `subagent não fala com outros agentes` | Devolva para a sessão principal enviar (vale também para o `board_send`) |
| As ferramentas `board_*` não aparecem | O servidor não está registrado ou aprovado. Confira com `claude mcp list` e veja o [guia do MCP](../mcp.md) |
| `board_send` diz que o painel "não está cadastrado" | Falta o cadastro do painel: rode `python3 $S/painel.py listar` e peça ao master para cadastrar |
| O Claude Code pede aprovação a cada chamada `board_*` | Libere em `settings.json`: `"permissions": {"allow": ["mcp__agent-board"]}`. Detalhes no [guia do MCP](../mcp.md) |

Lista completa em [Hooks e limites](../../referencia/hooks-e-limites.md).

## Outros sintomas

| Você vê | Faça |
|---|---|
| `este painel (...) não está cadastrado ... Peça ao master para recadastrar` | O painel foi reaberto e ganhou ID novo. O master roda `listar` e `cadastrar` só para ele. O recadastro substitui o ID antigo |
| `listar` mostra `(painel fechado ou reaberto) ... -> recadastrar` | Mesmo caso: recadastre esse agente |
| O aviso não apareceu na tela do destino | Veja `~/.agent-hooks/agent-board/avisos.log`. Causas: diálogo aberto na tela do destino, outro aviso há menos de 60 s, ou o destino já leu tudo. A mensagem continua no correio: `orca orchestration check --terminal <term> --format` |
| O agente encerra o turno sem responder | O hook segura até 3 vezes e depois registra no `avisos.log`. Cobre o agente pelo canal. Pedido longo: ele manda `andamento` |
| Envio deu timeout ou o painel fechou antes de ler | Espere o Orca reconectar (`orca status`) e o master roda `python3 $S/painel.py reenviar --raiz <projeto> <id>` |
| Suspeita de log editado, ou antes de um merge importante | `python3 $S/painel.py verificar --raiz <projeto>`. Linha adulterada aparece como `PROBLEMA` e o comando sai com 1 |
| Nenhum hook age | Confira `/hooks` (ou `/extensions` no OMP), `painel.py listar` e `echo $ORCA_TERMINAL_HANDLE` |

O `reenviar` guarda o comando de cada envio por 7 dias e manda para o painel **atual** do destino. Só o master (ou um humano fora do cadastro) roda. Arquivos e caminhos: [Arquivos e estado](../../referencia/arquivos-e-estado.md).

## Incluir um agente

1. Abra o painel do agente no Orca.
2. `python3 $S/painel.py listar` e ache o ID novo.
3. Confirme o nome com o humano e rode `cadastrar` só para ele.
4. Mande o aviso de apresentação ([Passo 6](2-montar-o-time.md#passo-6--apresentar-o-time)).

✅ **Deu certo se:** o agente respondeu ao aviso.

## Tirar um agente

```bash
python3 $S/painel.py remover term_<id>
```

✅ **Deu certo se:** o `listar` mostra o painel como `(sem cadastro)` ou não o mostra mais.

## Atualizar

```bash
cd ~/.agents/skills/agent-board && git pull
bash scripts/install.sh
for t in scripts/test_*.py; do python3 "$t" || break; done
```

Se o contrato mudou, em cada projeto:

```bash
python3 $S/painel.py init --raiz <projeto> --projeto <nome> --prefixo <prefixo> --atualizar-contrato
```

Faça o commit e avise o time com um `aviso`.

✅ **Deu certo se:** os testes passam e o `CONTRATO.md` novo está no commit.

## Desinstalar

1. Tire de `~/.claude/settings.json` as entradas de hook que contêm `agent-board`. Há backup em `~/.agent-hooks/agent-board/settings.json.bak-*`.
2. Apague `~/.omp/agent/hooks/pre/agent-board.ts`.
3. Tire o MCP: `claude mcp remove --scope user agent-board`.
4. (Opcional) Apague `~/.agent-hooks/agent-board/` e o link em `~/.claude/skills/agent-board`.

Só quer **desligar**? Esvazie o cadastro: com `paineis.json` vazio, os hooks não agem sobre ninguém.

✅ **Deu certo se:** `/hooks` não mostra mais `agent-board`.

Comandos e flags completos: [Comandos](../../referencia/comandos.md).
