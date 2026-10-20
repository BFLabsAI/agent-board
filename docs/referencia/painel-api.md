# API do painel web (v2)

Contrato entre `scripts/cmd_web.py` (servidor, Python stdlib, compatível com 3.8) e a SPA em `web/` (build em `scripts/painel_web/`). Tudo é **só leitura**: qualquer método que não seja GET responde 405. O servidor escuta em 127.0.0.1, confere o `Host` e manda os cabeçalhos de segurança da ADR 0005/0010.

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
3. `trabalhando`: o título começa com spinner (caracteres braille `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`, `◐◓◑◒` ou `✻✽✶·` que não seja o `✳` ocioso do Claude) **ou** houve saída do terminal há menos de 10 s.
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
