# Plano: sub-agents no painel (1.12)

> **Status:** todas as trilhas foram concluídas e os sub-agents saem na 1.12.0. Guia de uso: [painel.md](../userguide/painel.md#sub-agents). Este plano fica como registro do desenho.

Pedido do CEO, 2026-10-20: mostrar os sub-agents de cada master e manager como agentes abaixo deles, com o trabalho que fazem, sem mexer no cadastro nem no log de mensagens. Contrato: [painel-api.md, seção Sub-agents](../referencia/painel-api.md#sub-agents-112-issue-20).

| Trilha | Escopo | Estado |
|---|---|---|
| Coletor | `scripts/subagentes.py` (gravação), ganchos no `hook_core` (spawn, inicio, atividade, fim, retorno), registro no `install.sh` (SubagentStart, SubagentStop, Pre/PostToolUse `Agent\|Task`), adaptador do OMP, retenção, ADR 0011, testes |
| API | leitura e ligação dos eventos (`painel_dados`), campos novos em agentes, tarefas, resumo, analytics e workflows, rota `/api/subagentes`, evento SSE `subagente`, testes | ✅ concluída |
| Front Office | Mapa (sub-cards sob cada agente), Hub (mini-robôs em órbita da mesa), Grade e gaveta | ✅ concluída |
| Front telas | Kanban (agentes aninhados, subtarefas no card), Dashboard, Analytics (seção sub-agents), Workflows (camada sub-agent), Feed não muda | ✅ concluída |

Performance: 4 execuções de hook por sub-agent (spawn, inicio, fim, retorno). Atividade só pega carona no hook que já roda. Nada de `PreToolUse *`.
