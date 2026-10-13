# Configuração

> Todas as chaves do `docs/agent-board/agent-board.json` e todas as variáveis de ambiente. Para entender as regras opcionais, veja [regras](../conceitos/regras.md).

## agent-board.json

O `painel.py init` copia `templates/agent-board.json` para o projeto e preenche `projeto` e `prefixo`. Chave ausente ou `null` desliga a regra correspondente.

| Chave | Template | Quem lê | Efeito |
|---|---|---|---|
| `versao` | `1` | ninguém | Informativa |
| `projeto` | `<project-name>` | `cadastrar`, `nota`, `vigiar`, `reenviar`, `servir`, `maestri conectar`/`rotina` | Nome do projeto. Agentes só falam com cadastrados do mesmo projeto |
| `prefixo` | `<project-prefix>` | `cadastrar`, hook | Começo de todo nome (`<prefixo>-master`…). Completa o nome curto no `--to` |
| `papeis.<papel>.tipos` | ver abaixo | `politica.py` | Tipos que o papel pode enviar. `andamento` passa mesmo fora da lista |
| `papeis.<papel>.pode_pedir_a` | ver abaixo | `politica.py`, `maestri conectar` | Papéis a quem o papel pode mandar `pedido` |
| `prazo_padrao` | `null` | `politica.py` | Prazo de todo `pedido` sem `--prazo`. Formato `<n>m`, `<n>h` ou `<n>d`, com n > 0. Valor inválido barra o pedido |
| `limites.pedidos_abertos_max` | `null` | `politica.py` | Barra `pedido` a quem já tem esse número de pedidos recebidos sem resposta |
| `limites.ping_pong_max` | `null` | `politica.py`, painel web | Com `ping_pong_janela_min`: mais mensagens que isso entre o mesmo par, sem `entrega` no meio, avisa o master (não barra) |
| `limites.ping_pong_janela_min` | `null` | `politica.py`, painel web | Janela do ping-pong, em minutos |
| `ligacoes` | ausente | `politica.py`, `maestri conectar` | Lista de pares `[de, para]` (papel ou nome de agente, com direção). Com ela, `pedido` e `aviso` só passam nos pares listados |
| `github.comentar_entregas` | `false` | `notificar.py` | `entrega` com `--issues` vira comentário em cada Issue (`gh issue comment`, na raiz do projeto, timeout de 30 s) |
| `maestri.espelhar_notas` | `false` | `cmd_time.py` | Cada `painel.py nota` num terminal do Maestri atualiza a nota `ab · <tema>` no fichário `agent-board` do canvas |
| `maestri.status_do_floor` | `false` | `notificar.py` | `entrega` de um terminal do Maestri posta `maestri floor status "Entrega …" --state review`. A falha vai para o `avisos.log` |

Detalhes que valem para os `limites`:

- Só contam inteiros maiores que zero. Outro valor é ignorado, como se a chave não existisse.
- O ping-pong só liga com as duas chaves preenchidas. O alerta sai uma vez por par por janela.
- O painel web mostra alertas de ping-pong mesmo sem as chaves: usa 12 mensagens em 10 min como padrão.

### Papéis padrão (template)

| Papel | `tipos` | `pode_pedir_a` |
|---|---|---|
| master | `pedido`, `resposta`, `aviso` | `manager`, `researcher` |
| manager | `pedido`, `resposta`, `aviso`, `escalacao`, `entrega`, `andamento` | `manager`, `researcher` |
| researcher | `resposta`, `aviso`, `escalacao`, `andamento` | nenhum |

Regras fixas que a config não muda: `escalacao` e `entrega` só vão para o master, e `pedido` a manager exige `--modo`.

### Exemplo completo

```json
{
  "versao": 1,
  "projeto": "app",
  "prefixo": "app",
  "papeis": { "...": "como no template" },
  "prazo_padrao": "1d",
  "limites": {"pedidos_abertos_max": 3, "ping_pong_max": 6, "ping_pong_janela_min": 30},
  "ligacoes": [["master", "manager"], ["manager", "master"], ["manager", "researcher"],
               ["researcher", "manager"], ["manager", "manager"]],
  "github": {"comentar_entregas": true},
  "maestri": {"espelhar_notas": false, "status_do_floor": false}
}
```

Antes de trocar a config, teste contra o log: `python3 $S/painel.py simular --raiz <projeto> --config novo.json`.

## Variáveis de ambiente

| Variável | Padrão | Uso |
|---|---|---|
| `AGENT_BOARD_HOME` | `~/.agent-hooks/agent-board` | Onde fica o estado (cadastro, avisos, envios). Defina antes do `install.sh` e no ambiente dos agentes. Fora do padrão, os comandos que o agent-board sugere no Maestri (rodapé de resposta, routine do `vigiar`) já levam a variável |
| `AGENT_BOARD_JANELA_AVISO` | `60` | Segundos mínimos entre dois avisos digitados no mesmo destino (Orca) |
| `AGENT_BOARD_WEBHOOK` | vazia (desligado) | URL `http(s)` que recebe `POST` JSON `{"text": "..."}` (formato do Slack) a cada envio dos tipos escolhidos. Timeout de 10 s. É segredo: só no ambiente, nunca no git. Não aparece no `avisos.log` |
| `AGENT_BOARD_WEBHOOK_TIPOS` | `escalacao,entrega` | Tipos que vão para o webhook, separados por vírgula |
| `ORCA_TERMINAL_HANDLE` | definida pelo Orca | ID do painel no Orca. Não defina à mão |
| `MAESTRI_TERMINAL_ID` | definida pelo Maestri | ID do terminal no canvas (painel `maestri:<id>`). Só vale quando não há `ORCA_TERMINAL_HANDLE` |
| `ORCA_BIN` | autodetectado | Força o binário do `orca` usado pelos hooks e pelo `painel.py` |
| `ORCA_REMOTE_CLI_BIN_DIR` | definida pelo Orca | Pasta da CLI `orca` em workspaces remotos (SSH) |
| `MAESTRI_CLI` | o Maestri costuma definir | Caminho da CLI `maestri` |
| `AGENT_BOARD_CORE` | caminho gravado pelo `install.sh` | Só OMP: força o `hook_core.py` que o adaptador chama |

### Onde o agent-board procura as CLIs

Os hooks rodam com um `PATH` reduzido. Por isso a busca segue uma ordem fixa; vale o primeiro executável encontrado.

| CLI | Ordem de busca |
|---|---|
| `orca` | `$ORCA_BIN` → `$ORCA_REMOTE_CLI_BIN_DIR/orca` → `orca` no `PATH` → `~/.orca-relay/bin/orca` |
| `maestri` | `$MAESTRI_CLI` → `maestri` no `PATH` → `~/.maestri/bin/maestri` |

## Notificações

Rodam num processo separado, depois de um envio bem-sucedido. Falha nunca atrasa nem barra o envio: só vira uma linha no `avisos.log`, sem nova tentativa.

| Canal | Liga com | Dispara em |
|---|---|---|
| Webhook | `AGENT_BOARD_WEBHOOK` | tipos de `AGENT_BOARD_WEBHOOK_TIPOS` |
| GitHub | `github.comentar_entregas: true` e `gh` no `PATH` | `entrega` com `--issues` |
| Floor do Maestri | `maestri.status_do_floor: true` | `entrega` feita de um terminal do Maestri |

Numa `entrega`, a linha do log ganha `"branch"` quando quem entrega tem worktree (do `cadastrar --worktree`) ou está num checkout git diferente da raiz, como um floor do Maestri.
