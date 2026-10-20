# Arquivos e estado

> Onde fica cada coisa: na skill, na máquina e no projeto. E como ler o log.

## Arquivos da skill

| Arquivo | O que é |
|---|---|
| `scripts/hook_core.py` | Ponto de entrada dos hooks: lê o evento, aplica a política antes do envio, digita o aviso depois e cobra no fim do turno |
| `scripts/politica.py` | As regras de envio (`validar_envio`), sem I/O. Usada pelo hook e pelo `simular` |
| `scripts/base.py` | Caminhos, cadastro, config, nomes do time, identidade do painel e trava entre processos |
| `scripts/registro.py` | O log: grava com cadeia de hash, lê, verifica e arquiva |
| `scripts/protecao.py` | Detecta escrita à mão no log e no cadastro |
| `scripts/avisos.py` | Aviso digitado na tela do destino (processo separado) e o alerta de ping-pong |
| `scripts/notificar.py` | Webhook, comentário no GitHub e status do floor depois de um envio (processo separado) |
| `scripts/toon.py` | Saída em TOON |
| `scripts/envio.py` | Envio pelo transporte do destino, passando pelo `hook_core.decide()`. Usado pelo `board.py` e pelo MCP |
| `scripts/board.py` | CLI `board.py send` |
| `scripts/maestri.py` | A CLI `maestri` vista pelo agent-board (`ask` destacado, nome no canvas, notas) |
| `scripts/painel.py` | `init`, `listar`, `cadastrar`, `remover` e o despacho dos demais comandos |
| `scripts/cmd_log.py` | `historico`, `verificar`, `arquivar`, `reenviar` |
| `scripts/cmd_tarefas.py` | `tarefas`, `vigiar`, `simular` |
| `scripts/cmd_time.py` | `nota`, `notas`, `resumo` e o worktree do `cadastrar --worktree` |
| `scripts/cmd_maestri.py` | `eu`, `solicitar`, `solicitacoes`, `maestri conectar`, `maestri rotina` |
| `scripts/cmd_web.py` | Painel web (`servir`): servidor HTTP só leitura, rotas `/api/*`, SSE e servir a SPA |
| `scripts/painel_estado.py` | Estado de um projeto (JSON de `/api/estado`), tarefas e a heurística do status do agente |
| `scripts/painel_dados.py` | Dados derivados do log para a API v2: agentes, conversas, analytics e workflows (funções puras) |
| `scripts/painel_orca.py` | Lista de terminais abertos no Orca (`orca terminal list`), com cache de 2 s |
| `scripts/painel_stream.py` | O que o `/api/stream` (SSE) empurra: vigia o log e o Orca e devolve só o que mudou |
| `scripts/painel_web/` | Build da SPA (`index.html` e `assets/`), **commitado**: quem instala não precisa de Node |
| `scripts/painel_web.html` | Página antiga do painel, usada só se não houver `painel_web/` |
| `web/` | Código-fonte da SPA (React, Vite, TypeScript, Tailwind) e os testes Vitest. Só para quem desenvolve o painel: [README](../../web/README.md) |
| `scripts/mcp_server.py`, `mcp_ferramentas.py` | Servidor MCP (JSON-RPC 2.0 sobre stdio) e as ferramentas `board_*` |
| `scripts/omp-agent-board.ts` | Adaptador do OMP para o mesmo core |
| `scripts/install.sh` | Liga os hooks e registra o servidor MCP (idempotente, com backup) |
| `scripts/VERSION` | Versão do agent-board |
| `scripts/test_*.py` | Testes a seco, 10 suítes: `agent_board`, `registro`, `politica`, `mcp`, `time`, `web`, `maestri`, `contrato`, `docs` e `omp` (esta pula sozinha sem o `bun`). O front tem os próprios testes: `cd web && npx vitest run` |
| `templates/CONTRATO.md` | Vira `docs/agent-board/CONTRATO.md` no projeto |
| `templates/agent-board.json` | Vira `docs/agent-board/agent-board.json` no projeto |
| `SKILL.md` | Procedimento do master, lido pelo agente ao usar a skill |
| `docs/adr/`, `docs/userguide/painel.md` | Decisões e [guia do painel web](../userguide/painel.md) (com `painel-telas.md`, `painel-analise.md` e `painel-office.md`) |

## Estado na máquina

Tudo em `$AGENT_BOARD_HOME` (padrão `~/.agent-hooks/agent-board/`), fora do git, salvo onde indicado.

| Caminho | O que é |
|---|---|
| `paineis.json` | Cadastro: ID do painel → projeto, agente, papel, raiz |
| `avisos.log` | Avisos digitados ou suprimidos, falhas de envio e de notificação, encerramentos sem resposta, alertas |
| `avisos-estado.json` | Controle de 1 aviso por destino a cada 60 s |
| `alertas-estado.json` | Controle do alerta de ping-pong (1 por par por janela) |
| `pendentes/` | Estado entre o pré e o pós-envio. Apagado depois de 1 h |
| `cobrancas/<painel>.json` | Quantas vezes o fim de turno já cobrou as mesmas pendências |
| `envios/<id>.json` | Comando completo de cada envio, para o `reenviar`. Apagado depois de 7 dias |
| `solicitacoes/` | Pedidos de cadastro do Maestri (`painel.py solicitar`) |
| `maestri-ask/<id>.log` | Saída de cada `maestri ask`. Apagada depois de 7 dias |
| `travas/` | Travas do log de cada projeto, das notas e dos pedidos de cadastro |
| `*.lock` | Travas do cadastro e dos arquivos de estado |
| `settings.json.bak-<data>` | Backup do `~/.claude/settings.json` feito pelo `install.sh` |
| `~/.omp/agent/hooks/pre/agent-board.ts` | Adaptador do OMP instalado, com o caminho do core |
| `<projeto>/../<nome>-worktrees/<agente>` | Worktree de cada manager (`cadastrar --worktree`), branch `ab/<agente>` |

Uma entrada do cadastro:

```json
"term_abc123": {"projeto": "app", "agente": "app-manager01-cc", "papel": "manager",
                "raiz": "/srv/app", "cadastrado_em": "2026-10-07T10:00:00+02:00",
                "worktree": "/srv/app-worktrees/app-manager01-cc"}
```

No Maestri, a chave é `maestri:<id>` e a entrada ganha `"transporte": "maestri"` e `"nome_canvas"`.

## No projeto (no git)

| Caminho | O que é |
|---|---|
| `docs/agent-board/agent-board.json` | Config do projeto ([chaves](config.md)) |
| `docs/agent-board/CONTRATO.md` | Regras que todo agente do projeto lê |
| `docs/agent-board/comunicacoes.jsonl` | O log: uma linha por evento |
| `docs/agent-board/arquivo/AAAA-MM.jsonl` | Arquivo morto do log (`painel.py arquivar`) |
| `docs/agent-board/notas/<tema>.md` | Notas e decisões do time (`painel.py nota`) |
| `.gitattributes` | `merge=union` do log e do arquivo morto: branches diferentes juntam linhas sem conflito |

O log fica sempre no checkout principal, mesmo para quem trabalha num worktree. Quem faz o merge inclui o log no commit.

## Formato do log

Uma mensagem:

```json
{"id":"c-20261007-101256-ab68","ts":"2026-10-07T10:12:56+02:00","de":"app-manager01-cc","para":"app-researcher01-cc","tipo":"pedido","modo":null,"assunto":"Analisar pagamentos","issues":[412],"responde_a":null,"prev":"<sha256 da linha anterior>"}
```

| Campo | Quando aparece | O que é |
|---|---|---|
| `id` | sempre | `c-AAAAMMDD-HHMMSS-xxxx` (mensagem) ou `n-…` (nota) |
| `ts` | sempre | Hora ISO com fuso |
| `de`, `para` | mensagem | Nomes dos agentes. Nota não tem `para` |
| `tipo` | mensagem e nota | Um dos 6 tipos, ou `nota` |
| `modo` | mensagem | `orquestrar`, `executar` ou `null` |
| `assunto`, `issues`, `responde_a` | mensagem | Como no envio |
| `prazo` | `pedido` com prazo | Fim do prazo, em ISO |
| `veredito` | resposta a `entrega` | `aprovado` ou `rejeitado` |
| `branch` | `entrega` de quem tem worktree ou está num floor | Branch atual |
| `tema`, `decisao` | nota | Tema e se é decisão |
| `prev` | sempre | sha256 do texto da linha anterior (cadeia de hash) |

Linhas só com `{"id", "ts", "status", "prev"}` registram o destino de um envio:

| `status` | Efeito |
|---|---|
| `falhou` | A entrega falhou. A mensagem sai da cobrança e do `--responde-a` |
| `reenviado` | O master reenviou. A mensagem volta a valer |
| `atrasado` | Pedido já escalado pelo `vigiar`. Não é escalado de novo |

## Consultar

Com `jq` (ler é livre; escrever no log é barrado):

```bash
jq -c 'select(.para=="app-master")' docs/agent-board/comunicacoes.jsonl
jq -c 'select(.tipo=="pedido")'     docs/agent-board/comunicacoes.jsonl
jq -c 'select(.status == null)'     docs/agent-board/comunicacoes.jsonl   # sem as linhas de status
```

Com o `painel.py`, em TOON:

```bash
python3 $S/painel.py historico --raiz <projeto> --agente app-manager01-cc --n 20
python3 $S/painel.py historico --raiz <projeto> --sobre pagamentos --tudo --formato json
```

```
mensagens[2]{id,ts,de,para,tipo,modo,assunto,responde_a,issues}:
  c-20261007-101256-ab68,"2026-10-07T10:12:56+02:00",app-manager01-cc,app-researcher01-cc,pedido,null,Analisar pagamentos,null,"412"
  c-20261007-113000-0c1d,"2026-10-07T11:30:00+02:00",app-researcher01-cc,app-manager01-cc,resposta,null,Pagamentos analisados,c-20261007-101256-ab68,""
```
