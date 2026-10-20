# API do painel web (v2)

Contrato entre `scripts/cmd_web.py` (servidor, Python stdlib, compatível com 3.8) e a SPA em `web/` (build em `scripts/painel_web/`). Tudo é **só leitura**: qualquer método que não seja GET responde 405. O servidor escuta em 127.0.0.1, confere o `Host` e a origem (`Origin`/`Sec-Fetch-Site`: pedido de outra página responde 403), limita conexões (64, SSE 16, 15 s sem E/S derruba a conexão) e manda os cabeçalhos de segurança da ADR 0005/0010. O log é entrada não confiável: linhas tortas são ignoradas, textos vão limitados a 2000 caracteres, `de`/`para`/`assunto` são sempre texto, e a `tela` do terminal sai com tokens, chaves e senhas trocados por `[oculto]`.

## Convenções

- Toda rota `/api/*` aceita `?projeto=<nome>`. Sem ele, vale o projeto do `--raiz` ou, se não houver, o primeiro de `/api/projetos`. Um projeto desconhecido responde 404 `{"erro": "projeto desconhecido"}`.
- `periodo` aceita `hoje`, `24h` ou `7d` (padrão `hoje`). Um valor inválido é tratado como `hoje`.
- Datas em ISO 8601 com fuso (`2026-10-20T06:22:05+02:00`). Em listas, o mais recente vem primeiro, salvo indicação.
- Os textos vindos do log (`assunto`, `andamento`, `tela`, `trecho`) **não são confiáveis**: o front só renderiza como texto.
- Um agente é identificado pelo nome (`agente`), e não pelo handle.

## Tipos

```ts
type Papel = "master" | "manager" | "researcher" | string
type StatusAgente = "trabalhando" | "esperando" | "pendente" | "parado" | "offline" | "desconhecido"
type EstadoTarefa = "aberto" | "em_andamento" | "atrasado" | "concluido" | "aguardando_revisao" | "aprovado" | "rejeitado"
type TipoMsg = "pedido" | "andamento" | "resposta" | "entrega" | "nota" | "status" | string

interface Mensagem {           // linha do comunicacoes.jsonl, sem o campo "prev"
  id: string; ts: string; de: string; para: string; tipo: TipoMsg
  assunto?: string; modo?: string | null; responde_a?: string | null   // ids separados por vírgula
  issues?: number[]; branch?: string; prazo?: string; veredito?: "aprovado" | "rejeitado"
}

interface Agente {
  agente: string; papel: Papel; handle: string
  harness: "cc" | "omp" | "maestri" | null      // sufixo do nome (-cc, -omp) ou agentIdentity do Orca; handle "maestri:*" => maestri
  worktree: string | null; branch: string | null
  status: StatusAgente
  tela: string | null            // preview do Orca (última linha visível do terminal)
  ultima_saida: string | null    // lastOutputAt do Orca, em ISO
  pendentes: number              // mesma regra do Stop
  tarefa_atual: { id: string; assunto: string; estado: EstadoTarefa } | null  // tarefa aberta mais recente em que o agente é "para"
  stats: {
    atividade_14d: number[]      // 14 inteiros, do mais antigo (índice 0) a hoje; mensagens enviadas por dia
    mensagens_7d: number; entregas_7d: number; aprovadas_7d: number; rejeitadas_7d: number
    tempo_resposta_p50_min: number | null
  }
}

interface Tarefa {             // = painel_estado.tarefas()
  id: string; ts: string; tipo: "pedido" | "entrega"; de: string; para: string; assunto: string
  estado: EstadoTarefa; prazo: string | null; issues: number[]; branch: string | null
  andamento: string | null; andamento_ts: string | null; fechada_em: string | null
}

interface Conversa {
  id: string                     // id da mensagem raiz (pedido ou entrega sem responde_a)
  assunto: string; tipo: TipoMsg; de: string; para: string; estado: EstadoTarefa | null
  inicio: string; fim: string     // ts da primeira e da última mensagem da thread
  duracao_min: number; n_mensagens: number
  participantes: string[]; issues: number[]; branch: string | null
}
```

## Rotas

| Rota | Resposta |
|---|---|
| `GET /` e qualquer caminho sem extensão fora de `/api` | `scripts/painel_web/index.html` (SPA). Sem build, cai no `painel_web.html` antigo. |
| `GET /assets/<arquivo>` | arquivos do build. Sem path traversal: só nomes dentro de `scripts/painel_web/assets/`. |
| `GET /api/projetos` | `[{projeto, raiz, agentes: number, atual: boolean}]`. A `raiz` vem do `raiz` do cadastro (`paineis.json`) ou do `--raiz`. Só entram projetos cuja raiz tem `docs/agent-board/agent-board.json`. |
| `GET /api/estado?periodo` | o mesmo JSON do v1 (`painel_estado.montar`), mantido por compatibilidade. |
| `GET /api/resumo?periodo` | `{projeto, versao, agora, periodo, cadeia:{linhas,integra,problemas}, indicadores:{...v1, trabalhando, esperando, offline, abertos, entregas_periodo}}` |
| `GET /api/agentes` | `Agente[]`, em ordem: master, managers, researchers, e por nome dentro de cada grupo. |
| `GET /api/tarefas?periodo` | `Tarefa[]`: todas as abertas, mais as fechadas dentro do período. |
| `GET /api/conversas?periodo&limite=100&agente&estado&q` | `Conversa[]` cujo `fim` cai no período. `q` busca em assunto, id e issues. |
| `GET /api/conversas/<id>` | `{conversa: Conversa, mensagens: Mensagem[]}`, com as mensagens em ordem cronológica crescente. Thread = raiz + tudo que responde (direta ou transitivamente) a ela. 404 se não existir. |
| `GET /api/mensagens?antes=<ts>&limite=100&agente&tipo&q` | `{mensagens: Mensagem[], mais: boolean}`, paginado por `antes`. Inclui `nota`. `agente` casa com `de` ou `para`. |
| `GET /api/analytics` | ver abaixo |
| `GET /api/workflows?periodo` | ver abaixo |
| `GET /api/stream` | SSE, ver abaixo |

### `/api/analytics`

```ts
{
  heatmap: { dia: string /* AAAA-MM-DD */, n: number }[]       // 371 dias até hoje (53 semanas), mensagens por dia (log ativo + arquivo)
  ultimos_30d: { dia: string, mensagens: number, entregas: number, aprovadas: number, rejeitadas: number }[]
  horas: number[]                                                // 24 posições, mensagens por hora do dia (30 d)
  por_agente: { agente: string, enviadas: number, recebidas: number, entregas: number,
                aprovadas: number, rejeitadas: number, p50_min: number | null, p90_min: number | null }[]  // 30 d
  tipos: { tipo: string, n: number }[]                           // 30 d
  alertas: { de: string, para: string, n: number, janela_min: number, ate: string }[]  // ping-pong (30 d)
}
```

### `/api/workflows?periodo`

```ts
{
  nos: { id: string, coluna: "master" | "manager" | "researcher" | "issue" | "revisao" | "resultado", rotulo: string, n: number }[]
  arestas: { de: string, para: string, n: number }[]            // pedidos master→agente, agente→issue, issue→revisao, revisao→resultado
  comunicacao: { de: string, para: string, n: number }[]        // mensagens por par (direcional) no período
  fluxos: { sequencia: string[], n: number }[]                  // tipos em ordem por conversa, ex. ["pedido","andamento","entrega","resposta:aprovado"], top 10
  kpis: { conversas: number, taxa_aprovacao: number | null, tempo_ate_entrega_p50_min: number | null,
          fluxo_mais_comum: string | null, msgs_por_conversa: number | null }
}
```

Resultados possíveis na coluna `resultado`: `aprovado`, `rejeitado`, `concluido`, `em_aberto` e `atrasado`.

### `/api/stream` (SSE)

`Content-Type: text/event-stream`, `Cache-Control: no-store`. O servidor vigia `comunicacoes.jsonl` (tamanho e mtime a cada 1 s) e `orca terminal list` (a cada 2 s), e só envia o que mudou:

| `event:` | `data:` | Quando |
|---|---|---|
| `ola` | `{projeto, agora}` | ao conectar |
| `mensagem` | `Mensagem` | linha nova no log |
| `agente` | `Agente` | status, tela, pendentes ou tarefa_atual de um agente mudou |
| `tarefa` | `Tarefa` | tarefa nova ou com estado mudado |
| `ping` | `{agora}` | a cada 15 s, sem outro evento |

O stream não tem replay: ao reconectar, a SPA recarrega as rotas REST. O servidor aceita no máximo 16 conexões SSE simultâneas (a 17ª recebe 503).

## Status do agente (heurística, em `painel_estado.status_agente`)

Em ordem de prioridade:

1. `offline`: o handle não está aberto no Orca.
2. `esperando`: a `tela` pede ação humana (`Do you want`, `[y/n]`, `Allow`, `permission`, `❯ 1.`).
3. `trabalhando`: o título começa com spinner (caracteres braille `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`, `◐◓◑◒` ou `✻✽✶·` que não seja o `✳` ocioso do Claude) **ou** houve saída do terminal há menos de 10 s (só quando o título não é do Claude Code `✳` nem do OMP `π`, 1.12.1) **ou** (1.12) o agente tem sub-agent rodando.
4. `pendente`: o agente tem `pendentes > 0`.
5. `parado`: os demais casos.
6. `desconhecido`: o Orca não respondeu, ou o agente é do Maestri.

## Notas da implementação (#2)

- `tela`: últimas 12 linhas não vazias da preview do Orca, separadas por `\n`. O `esperando` olha as últimas 15.
- `harness`: o sufixo `-cc`/`-omp` do nome vale primeiro, depois o `agentIdentity` do Orca.
- `heatmap`, `ultimos_30d` e `atividade_14d` vêm em ordem cronológica **crescente**.
- `taxa_aprovacao` é uma fração entre 0 e 1.
- Ids dos nós de workflows:
  - agentes pelo nome;
  - issues como `#412`;
  - a revisão como `revisao`;
  - resultados como `aprovado`, `rejeitado`, `concluido`, `em_aberto` ou `atrasado`.
- Arestas de workflows: conversa sem entrega liga o executor direto ao resultado, e conversa sem issue liga o executor direto a `revisao`.
- `fluxos` junta tipos repetidos em sequência.
- Conversas: a raiz é um `pedido` ou `entrega` sem pai no log; a lista usa só o log ativo.
- Caminhos com `..` respondem 404.
- `indicadores.tempo_resposta` (resumo e estado): `{media, p50, p90}` em minutos.

## Sub-agents (1.12, issue #20)

Os sub-agents (Agent/Task do Claude Code, `kind: "sub"` do OMP) não entram no cadastro nem no log de mensagens. Um coletor leve grava o ciclo de vida deles fora do repositório, e o painel mostra cada sub-agent **abaixo do agente que o criou** (o "pai"). Decisão: ADR 0011.

### Arquivo do coletor

`~/.agent-hooks/agent-board/subagentes/<projeto>/AAAA-MM-DD.jsonl`, com uma linha por evento, só append e retenção de 14 dias. O arquivo não tem cadeia de hash e não é versionado.

```ts
interface EventoSub {
  ts: string                  // ISO com fuso
  ev: "spawn" | "inicio" | "atividade" | "fim" | "retorno"
  agente: string              // nome do PAI no cadastro (resolvido pelo handle do terminal); linha sem cadastro não é gravada
  sessao: string | null       // session_id do harness
  id: string | null           // agent_id do sub-agent (null em spawn e retorno, que rodam no pai)
  tipo: string | null         // agent_type / subagent_type (ex.: "general-purpose", "Explore")
  descricao?: string          // spawn: tool_input.description (até 120 caracteres)
  fundo?: boolean             // spawn: run_in_background
  ferramenta?: string         // atividade: "Bash" | "Edit" | "Write" | ...
  resumo?: string             // atividade: comando ou caminho, até 160 caracteres, com segredos mascarados
  ok?: boolean                // retorno: false se o PostToolUse/PostToolUseFailure do Agent indicou erro
}
```

| `ev` | De onde vem | Custo |
|---|---|---|
| `spawn` | `PreToolUse` com matcher `Agent\|Task`, no pai | 1 execução de hook por sub-agent |
| `inicio` | `SubagentStart` | 1 por sub-agent |
| `atividade` | carona no `PreToolUse` de `Bash`/`Edit`/`Write` que o `hook_core` **já** recebe, quando há `agent_id` | 0 execução extra |
| `fim` | `SubagentStop` | 1 por sub-agent |
| `retorno` | `PostToolUse`/`PostToolUseFailure` com matcher `Agent\|Task`, no pai | 1 por sub-agent |

O coletor nunca bloqueia e sempre sai com 0, gastando menos de 20 ms além do boot do Python. No OMP, o adaptador emite `inicio`, `atividade` e `fim` com o que o ctx expõe.

**Ligação spawn → sub-agent:** por agente pai, cada `inicio` consome o `spawn` mais antigo ainda sem dono com o mesmo `tipo` (ou qualquer um, se nenhum casar) até 60 s antes. O `retorno` do pai fecha, pela mesma ordem, o sub-agent mais antigo daquele tipo ainda sem `ok`.

### Tipos novos na API

```ts
type StatusSub = "rodando" | "concluido" | "erro" | "perdido"   // perdido: rodando sem nenhum evento há > 2 h

interface SubAgente {
  id: string; agente: string /* pai */; tipo: string | null; descricao: string | null
  status: StatusSub; fundo: boolean
  inicio: string; fim: string | null; duracao_s: number | null
  inicio_aproximado: boolean   // 1.12.2: visto sem `inicio`; duracao_s fica null
  nome: string                 // 1.12.2: "subagent-cc" | "subagent-omp" (harness do pai); é o rótulo do sub-agent no painel
  ultima_atividade: { ts: string; ferramenta: string; resumo: string } | null
  n_atividades: number
  tarefa: { id: string; assunto: string } | null   // tarefa_atual do pai no momento do inicio
}
```

- `Agente` ganha `subagentes: SubAgente[]` (todos os `rodando` + os 5 terminados mais recentes, nas últimas 24 h) e `stats.subagentes_7d: number`.
- `Tarefa` ganha `subagentes: { id, tipo, descricao, status }[]` (os ligados a ela).
- `Indicadores` ganha `subagentes_rodando: number`.

### Rotas

| Rota | Resposta |
|---|---|
| `GET /api/subagentes?periodo&agente&status&limite=200` | `SubAgente[]`, mais recente primeiro. `periodo` filtra pelo `inicio`; os `rodando` entram sempre |
| `GET /api/analytics` | ganha `subagentes: { por_agente: {agente, n, rodando, erro, duracao_media_s}[], por_tipo: {tipo, n, duracao_media_s}[], por_dia_30: {dia, n}[] }` (30 d, `por_dia_30` crescente) |
| `GET /api/workflows?periodo` | ganha nós `coluna: "subagente"` (id `sub:<nome>`, um por harness: `sub:subagent-cc`, `sub:subagent-omp`; 1.12.2) com arestas agente → `sub:<tipo>`, e `kpis.subagentes: number` |
| `GET /api/stream` | evento novo `subagente` (data: `SubAgente`), emitido quando um sub-agent nasce, muda de status ou tem atividade nova (no máximo 1 por sub-agent a cada 2 s). O servidor vigia o arquivo do dia a cada 1 s |

### Notas da implementação (#22)

- Leitura: `scripts/painel_subagentes.py` lê os arquivos dos últimos 31 dias de forma incremental (cache por arquivo, compartilhado entre requisições e conexões SSE) e nunca escreve. A pasta do projeto usa o mesmo nome que o coletor (`subagentes.pasta_segura`).
- `erro` tem prioridade sobre `rodando`: o `retorno` com `ok=false` encerra o sub-agent mesmo sem `fim`.
- `tarefa` é a tarefa mais recente do pai que estava **aberta no momento do `inicio`** (`ts` anterior ao início e ainda não fechada nele), e não a aberta de hoje.
- `Agente.subagentes`: todos os `rodando` mais os 5 terminados (concluído, erro ou perdido) mais recentes, pelo `fim` (ou `inicio`) nas últimas 24 h; ordenados pelo `inicio`, do mais recente.
- `/api/estado` também traz `indicadores.subagentes_rodando` e `tarefas[].subagentes`.
- `descricao` e `ultima_atividade.resumo` passam por `base.mascarar` na saída, além da máscara do coletor.
- SSE: o conjunto de arquivos vigiado é o de hoje e o de ontem (a virada do dia troca os nomes sozinha); o evento `agente` sai quando o conjunto (id, status) de sub-agents do agente muda, não a cada atividade. O intervalo mínimo por sub-agent é configurável (`intervalos["sub"]`, 2 s).

## Visão geral e multi-squad (1.13)

Um **squad** é um projeto do cadastro: master, managers, researchers e os sub-agents deles. O servidor já atende todos os projetos. A 1.13 acrescenta a visão de todos os squads de uma vez.

### `GET /api/geral?periodo`

```ts
interface Squad {
  projeto: string; raiz: string
  versao: string; cadeia_integra: boolean
  indicadores: Indicadores                 // o mesmo objeto de /api/resumo
  agentes: Agente[]                        // o mesmo de /api/agentes (com subagentes)
  ultima_mensagem: (Mensagem & { projeto: string }) | null
  alertas: number                          // ping-pong + atrasados + cadeia quebrada (0 ou 1)
  saude: "ok" | "atencao" | "critico"     // critico: cadeia quebrada ou atrasado; atencao: esperando você, pendente > 0 ou ping-pong
}
interface Geral {
  agora: string; periodo: Periodo
  squads: Squad[]                          // ordem: critico, atencao, ok; depois por nome
  totais: { squads: number; agentes: number; trabalhando: number; esperando: number;
            subagentes_rodando: number; abertos: number; atrasados: number; revisao: number; mensagens: number }
}
```

Um projeto do cadastro com raiz inexistente ou config ilegível **não derruba a rota**: ele entra em `squads` com `saude: "critico"`, `indicadores` zerados, `agentes: []` e um campo `erro: string`.

### `GET /api/geral/mensagens?antes&limite=100`

`{ mensagens: (Mensagem & { projeto: string })[], mais: boolean }`: as mensagens de todos os squads intercaladas por `ts` (mais recente primeiro) e paginadas por `antes`. As `nota` ficam de fora.

### `GET /api/stream?projeto=*`

É o mesmo stream da seção anterior, mas para **todos** os projetos numa conexão só, que conta 1 vaga no limite de 16. Os eventos `mensagem`, `agente`, `tarefa` e `subagente` chegam com o campo extra `projeto` no `data`. O `ola` traz `{projeto: "*", projetos: string[], agora}`. Quando um projeto entra ou sai do cadastro, o servidor percebe em até 5 s e passa a vigiar só os projetos atuais.
