# Comandos

> Consulta rápida de todos os comandos. Para entender o porquê, veja [como funciona](../conceitos/como-funciona.md). Use `S=~/.agents/skills/agent-board/scripts`.

Todo subcomando do `painel.py` aceita `--help`, menos `init`, `listar`, `cadastrar` e `remover`. A saída para agentes sai em [TOON](https://github.com/toon-format/toon) por padrão, que gasta menos tokens ([ADR-0001](../adr/0001-toon-so-na-saida.md)).

**Quem roda:**
- **qualquer um**: qualquer agente ou você no terminal.
- **master (regra)**: o contrato diz que é do master, mas o código não confere.
- **master (trava)**: o código recusa agente cadastrado que não seja master. Um humano num terminal fora do cadastro também pode.

## painel.py: cadastro

| Comando | O que faz | Flags | Quem roda |
|---|---|---|---|
| `init` | Cria `docs/agent-board/` (config, `CONTRATO.md` adaptado à interface, log vazio) e as linhas `merge=union` no `.gitattributes`. Não sobrescreve o que existe | `--raiz` `--projeto` `--prefixo` (só `[a-z0-9]`), `--transporte orca\|maestri` (obrigatório em projeto novo, a menos que o terminal seja só de uma das interfaces; num projeto que já existe, troca de interface e refaz o contrato), `--atualizar-contrato` (refaz o `CONTRATO.md` pelo da skill, na interface do projeto) | qualquer um, uma vez por projeto |
| `listar` | Terminais abertos no Orca, o cadastro de cada um e os pedidos de cadastro do Maestri. Situações: `cadastrado`, `sem cadastro`, `maestri`, `fechado: recadastrar`, `pediu cadastro` | `--formato toon` (padrão: texto) | qualquer um |
| `cadastrar` | Cadastra ou recadastra painéis. O recadastro substitui o painel antigo do agente. Recusa nome fora do padrão, o mesmo agente em dois painéis, painel de outro projeto e `maestri:` sem `solicitar` antes | `--raiz`, `--worktree`, `<term_…\|maestri:<id>>=<agente>` … | master (regra), depois de o humano confirmar |
| `remover` | Tira painéis do cadastro | `<term_…\|maestri:<id>>` … | master (regra) |

`--worktree`: cada **manager** ganha um `git worktree` em `<projeto>/../<nome do projeto>-worktrees/<agente>`, branch `ab/<agente>`, criado do HEAD. Worktree existente é reaproveitado. Se o git falhar, desfaz o que criou e não cadastra ninguém. Recadastrar sem `--worktree` mantém o worktree.

## painel.py: log

| Comando | O que faz | Flags | Quem roda |
|---|---|---|---|
| `historico` | Últimas mensagens do log (e notas, no filtro `--sobre`) | `--raiz`, `--agente X` (de ou para X), `--sobre texto` (assunto ou tema, sem diferenciar maiúsculas), `--n 20` (0 = todas), `--tudo` (inclui o arquivo morto), `--formato toon\|json` | qualquer um |
| `verificar` | Confere a cadeia de hash do log e do arquivo morto. Linha editada ou apagada no meio sai como `PROBLEMA`. Bifurcação de `merge=union` é normal | `--raiz` | qualquer um. Sai com 1 se achar problema |
| `arquivar` | Move conversas fechadas e antigas para `docs/agent-board/arquivo/AAAA-MM.jsonl`. Mensagem que espera resposta nunca sai | `--raiz`, `--dias 30` | master (trava) |
| `reenviar` | Reenvia uma mensagem para o painel **atual** do destino, pelo transporte dele, e grava `status: reenviado` | `--raiz`, `<id>` | master (trava). O comando de cada envio fica guardado só por 7 dias |

## painel.py: tarefas

| Comando | O que faz | Flags | Quem roda |
|---|---|---|---|
| `tarefas` | Uma linha por pedido e entrega: `id`, `de`, `para`, `assunto`, `estado`, `prazo` | `--raiz`, `--agente X`, `--formato toon\|json` | qualquer um |
| `vigiar` | Pedido com prazo vencido e sem resposta ganha `status: atrasado` (uma vez cada) e um aviso na tela do master. Feito para cron ou routine | `--raiz` | master (trava) |
| `simular` | Reexecuta o log contra uma config nova e lista o que seria barrado, o motivo e se a config atual barraria | `--raiz`, `--config <novo.json>`, `--tudo`, `--formato toon\|json` | qualquer um. Sai com 1 se algo seria barrado |

Estados do quadro: `aberto`, `em_andamento`, `concluido`, `atrasado`, `aguardando_revisao`, `aprovado`, `rejeitado` ([ciclo de vida](../conceitos/papeis-e-mensagens.md#o-ciclo-de-um-pedido)).

```bash
# vigiar a cada 10 min, no crontab do servidor
*/10 * * * * python3 ~/.agents/skills/agent-board/scripts/painel.py vigiar --raiz <projeto>
```

## painel.py: time

| Comando | O que faz | Flags | Quem roda |
|---|---|---|---|
| `nota` | Acrescenta uma nota em `docs/agent-board/notas/<tema>.md` e uma linha `tipo: nota` no log (sem `para`: ninguém é cobrado) | `--raiz`, `--tema` (vira `[a-z0-9-]`, até 60), `--decisao`, `--de <autor>`, `"<texto>"` (por último) | qualquer um. Num painel cadastrado, o autor é o agente do painel e `--de` é ignorado. Fora dele, `--de` é obrigatório |
| `notas` | Sem `--tema`, lista os temas (notas, decisões, última). Com `--tema`, as notas dele | `--raiz`, `--tema`, `--formato toon\|json\|md` | qualquer um |
| `resumo` | O que aconteceu no período, contado do log sem LLM: mensagens por tipo, enviadas e recebidas por agente, quem espera resposta (no log inteiro), últimas entregas e escalações, notas novas | `--raiz`, `--desde 1d` (`30m`, `2h`, `1d`), `--formato texto\|toon` | qualquer um |

## painel.py: painel web

| Comando | O que faz | Flags | Quem roda |
|---|---|---|---|
| `servir` | Painel local só leitura com 7 telas ao vivo (Dashboard, Kanban, Conversas, Activity Feed, Analytics, Workflows e Office, com os sub-agents de cada agente), em `http://127.0.0.1:8765` | `--raiz` (opcional), `--porta 8765` | qualquer um |
| `servico instalar` | Painel sempre ligado: grava o unit systemd `agent-board-painel.service` (`Restart=always`, roda `painel.py servir --porta <n>` do checkout da skill), liga o serviço e configura o `tailscale serve` (HTTPS 443 e HTTP `<porta>` para `127.0.0.1:<porta>`). Idempotente | `--porta 8765`, `--dry-run` (só imprime o unit e os comandos) | root, uma vez por VPS |
| `servico status` | Mostra se o unit existe, se o serviço está ativo e se o `tailscale serve` está configurado. Sai com 0 só se o serviço está ativo | `--porta 8765` | qualquer um |
| `servico remover` | Desliga o serviço, apaga o unit e desliga o `tailscale serve` | `--porta 8765`, `--dry-run` | root |

**Multi-projeto:** um servidor atende todos os projetos do cadastro (`paineis.json`) cuja raiz tem `docs/agent-board/agent-board.json`. `--raiz` é opcional: o projeto dela aparece primeiro e vale quando a URL não pede outro. Sem `--raiz` e sem projeto cadastrado, o comando sai com erro; com `--raiz` sem `agent-board.json`, também. Se a porta estiver ocupada, use `--porta`.

Workspaces federados: [guia](../userguide/painel-workspaces.md), [API](painel-api.md#workspaces-federados-114) e [ADR-0012](../adr/0012-workspaces-federados.md).

Servidor remoto: `ssh -L 8765:127.0.0.1:8765 <servidor>`. Detalhes: [painel web](../userguide/painel.md), [API](painel-api.md), [ADR-0005](../adr/0005-painel-web-local-somente-leitura.md) e [ADR-0010](../adr/0010-painel-v2-spa-com-build-e-sse.md).

## painel.py: Maestri

| Comando | O que faz | Flags | Quem roda |
|---|---|---|---|
| `eu` | Mostra o handle, o transporte, o nome no canvas e o cadastro deste terminal | `--formato texto\|toon` | qualquer um |
| `solicitar` | O agente pede o próprio cadastro: grava o ID e o nome no canvas | `--raiz`, `--agente <nome>` | o próprio agente, só num terminal do Maestri |
| `solicitacoes` | Lista os pedidos de cadastro pendentes e sugere o `cadastrar` | `--formato texto\|toon` | master (regra) |
| `maestri conectar` | Mostra (ou cria, com `--aplicar`) as cordas que a política exige: master com todos, os demais por `ligacoes` ou, sem ela, por `pode_pedir_a` | `--raiz`, `--aplicar` | master (trava), num terminal em modo Maestro |
| `maestri rotina` | Mostra (ou cria, com `--aplicar`) uma routine do Maestri que roda o `vigiar` | `--raiz`, `--a-cada 10m`, `--aplicar` | master (trava), em modo Maestro |

## board.py send

Manda uma mensagem ao time em qualquer transporte. As mesmas flags valem para `orca orchestration send` no Orca (menos `--body-file`).

| Flag | Obrigatória | Valores |
|---|---|---|
| `--to` | sim | nome do agente (o curto vale) ou `papel:<papel>` |
| `--type` | sim | `pedido`, `resposta`, `aviso`, `escalacao`, `entrega`, `andamento` |
| `--subject` | sim | assunto curto |
| `--body` | não | texto. Não use junto com `--body-file` |
| `--body-file` | não | lê o texto de um arquivo, ou `-` para a entrada padrão |
| `--modo` | em pedido a manager | `orquestrar`, `executar` |
| `--responde-a` | em `resposta` e `andamento` | id(s) separados por vírgula |
| `--veredito` | na resposta a uma `entrega` (inválido fora dela) | `aprovado`, `rejeitado` |
| `--prazo` | não, só em `pedido` | `30m`, `2h`, `1d` |
| `--issues` | não | números de Issue separados por vírgula |

Sai com 1 quando a mensagem é barrada ou não é entregue, com o motivo no stderr. Quem roda: qualquer painel cadastrado (subagent é barrado no Claude Code).

No Orca, o hook troca o tipo pelo aceito pelo Orca (`pedido` vira `handoff`, os demais `status`), põe o id no assunto (`[c-20261007-101256-ab68 pedido·executar] …`) e acrescenta ao corpo um rodapé com o comando de resposta pronto.

## Ferramentas MCP

Servidor `agent-board` (`scripts/mcp_server.py`, JSON-RPC 2.0 sobre stdio). O `install.sh` registra no Claude Code. Quem usa: qualquer painel cadastrado. Painel sem cadastro recebe erro pedindo o cadastro.

| Ferramenta | O que faz |
|---|---|
| `board_send(para, tipo, assunto, corpo?, modo?, issues?, responde_a?, prazo?, veredito?)` | Envia, com as mesmas regras do `board.py`. O corpo é texto puro: crase e `$( )` chegam como texto. Devolve o id `c-…` |
| `board_inbox()` | Orca: `orca orchestration check --terminal <painel> --format`. Maestri: as mensagens sem resposta (a mensagem já chegou digitada) |
| `board_pendentes()` | Mensagens recebidas ainda sem resposta, em TOON |
| `board_historico(agente?, sobre?, n?, tudo?)` | O mesmo filtro do `painel.py historico`, em TOON |
| `board_status()` | Agente, papel, projeto, raiz, handle, nº de pendentes, versão e agentes do projeto, em TOON |

Passo a passo (registrar, aprovar, liberar permissão, conferir): [Guia do MCP](../guias/mcp.md).

Registrar à mão:

```bash
claude mcp add --scope user agent-board -- python3 $S/mcp_server.py
claude mcp get agent-board
```

## Comandos externos que o agent-board chama

| Comando | Para quê |
|---|---|
| `orca orchestration send` | Entregar a mensagem no Orca |
| `orca orchestration inbox` | Ver se o destino ainda tem mensagem não lida antes de repetir o aviso |
| `orca orchestration check --format` | Ler o correio (`board_inbox`) |
| `orca terminal read` / `orca terminal send` | Ver se há diálogo aberto na tela e digitar o aviso |
| `orca terminal list` | `painel.py listar` e o painel web |
| `maestri ask` | Entregar a mensagem e o aviso no Maestri |
| `maestri list` | Ler o nome deste terminal no canvas (`eu`, `solicitar`) |
| `maestri connect`, `routine create` | `maestri conectar` e `maestri rotina` |
| `maestri note write` / `note create` | Espelhar notas no canvas |
| `maestri floor status --state review` | Status do floor na entrega |
| `gh issue comment` | Comentar entregas nas Issues |
| `git worktree` | `cadastrar --worktree` |
