# 0001. TOON só na saída para agentes; o log continua em JSONL

- **Status:** aceita
- **Data:** 2026-10-12

## Contexto
Agentes leem histórico, pendências e quadros de tarefas dentro do próprio contexto. Em JSON, cada linha repete todas as chaves; em [TOON](https://github.com/toon-format/toon) tabular, as chaves aparecem uma vez no cabeçalho, e a mesma tabela gasta bem menos tokens.

O log (`comunicacoes.jsonl`), porém, é lido por código e por gente: o hook (Python), o `jq` do troubleshooting, o `git` com `merge=union`.

## Decisão
- O armazenamento continua **JSONL**, uma linha por evento.
- **TOON é só formato de saída** de comandos voltados a agentes (`painel.py historico`, `tarefas`, `listar --formato toon`, ferramentas MCP), com `--formato json` sempre disponível.
- O encoder é próprio (`scripts/toon.py`), só de escrita, com as regras de aspas da especificação. Sem dependência nova.

## Consequências
- O append atômico sob trava e o `merge=union` continuam funcionando: TOON tabular tem cabeçalho com contagem (`[N]`), e cada append teria de reescrevê-lo.
- `jq` continua valendo para o log.
- Se um dia for preciso ler TOON (ex.: entrada de agente), é preciso um parser — fora do escopo.
