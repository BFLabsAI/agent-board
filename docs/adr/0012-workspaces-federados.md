# 0012. Workspaces federados: cada VPS com o painel, todos se enxergam

- **Status:** aceita (CEO, 2026-10-20)
- **Data:** 2026-10-20
- **Estende:** [ADR-0005](0005-painel-web-local-somente-leitura.md) (o painel continua só leitura e escutando só em loopback) e [ADR-0010](0010-painel-v2-spa-com-build-e-sse.md)

## Contexto
O CEO opera várias VPSs (R7, BF Labs, Aura Bios, iTarget), cada uma com o próprio agent-board e vários squads. Para ver tudo, hoje ele abre um túnel por máquina. A 1.13 já junta os squads de uma máquina; falta o nível acima.

## Decisão
1. **Nome e hierarquia.** O nível acima de squad se chama **Workspace** e é uma máquina (VPS). Workspace › Squad › Agente › Sub-agent.
2. **Federação simétrica, sem hub.** Todo painel descobre os outros e mostra todos. Não há máquina central: se uma cai, as demais seguem.
3. **Acesso só pela Tailscale.** O servidor continua em `127.0.0.1:8765`. O `tailscale serve` expõe HTTPS (443, para o navegador) e HTTP na porta do painel (para os outros painéis), só dentro da tailnet. Nenhuma porta pública. O servidor passa a aceitar no Host e no Origin os endereços da tailnet do próprio nó (e `hosts_extras` do `workspace.json`).
4. **Sempre ligado por systemd.** `painel.py servico instalar` cria o `agent-board-painel.service` (`Restart=always`) e o `tailscale serve`. É um passo manual, uma vez por VPS, idempotente e com `--dry-run`.
5. **Descoberta automática.** `tailscale status --json` lista os peers online e Linux (menos os de `ignorar`); cada um é testado em `GET /api/versao`. Só quem responde com um `contrato` conhecido vira Workspace.
6. **Proxy só para peers descobertos.** `/api/w/<id>/api/...` repassa apenas `GET /api/...` ao IP de um Workspace descoberto, nunca a um host vindo da URL, sem seguir redirecionamento, com timeout e limite de resposta. `X-AgentBoard-Federado` impede laço: quem o recebe não federa de novo.
7. **Continua só leitura.** Nada escreve em outro Workspace.
8. **Sem banco central por ora.** Cada Workspace guarda os próprios dados e o painel consulta ao vivo. Um banco central só entra quando houver necessidade de **histórico cruzado** entre Workspaces.

## Consequências
- Uma VPS desatualizada aparece com o aviso "atualize o agent-board" (versão menor que a do painel aberto).
- Workspace offline continua na lista, com `offline_desde` (guardado só em memória: zera ao reiniciar o painel).
- Quem está na tailnet vê o painel de todos, inclusive comandos e caminhos de sub-agents ([ADR-0011](0011-subagentes-no-painel.md)). A tailnet é a fronteira de confiança.
- Sem histórico cruzado: não há consulta de dias passados de um Workspace que está offline.
- Cada VPS precisa rodar `painel.py servico instalar` uma vez ao atualizar para a 1.14. Contrato: [`painel-api.md`](../referencia/painel-api.md#workspaces-federados-114). Guia: [Workspaces](../userguide/painel-workspaces.md).
