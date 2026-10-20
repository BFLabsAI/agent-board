# Plano: Workspaces federados (1.14)

Decisões do CEO (2026-10-20): o nível acima de squad se chama **Workspace** (uma VPS); o acesso é **só pela Tailscale**; **todo painel enxerga todos** os Workspaces, sem hub central; o painel fica sempre ligado via systemd. Contrato: [painel-api.md, seção Workspaces federados](../referencia/painel-api.md#workspaces-federados-114).

| Fase | Trilha | Depende de |
|---|---|---|
| 1+2 | Servidor: `/api/versao`, Host/Origin da tailnet, `workspace.json`, descoberta, `/api/workspaces`, proxy `/api/w/`, stream `workspace=*`, `painel.py servico` (systemd + tailscale serve) | — |
| 3 | Front: cliente com `workspace`, seletor Workspace › Squad, tela Workspaces | contrato (usa fixtures) |
| 4 | Office Prédio | 3 |
| 5 | Deploy na R7 (serviço + serve), depois nas outras VPSs | 1–4 |
