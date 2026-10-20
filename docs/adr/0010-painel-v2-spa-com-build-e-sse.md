# 0010. Painel v2: SPA com build commitado e SSE

- **Status:** aceita (CEO, 2026-10-20)
- **Data:** 2026-10-20
- **Substitui em parte:** [ADR-0005](0005-painel-web-local-somente-leitura.md) (só "sem build / HTML único" e "atualiza a cada 5 s")

## Contexto
O painel v1 é uma página HTML única que refaz `GET /api/estado` a cada 5 s. Funciona para olhar, mas não comporta o que o time pediu: várias telas (Dashboard, Kanban, Conversas, Activity Feed, Analytics, Workflows, Office), gráficos, grafo e um canvas animado. Isso pede componentes, tipos e testes, e polling de 5 s não dá o efeito de "ao vivo".

## Decisão
1. **SPA em `web/`** com Vite, React 18, TypeScript estrito e Tailwind. O código-fonte fica em `web/`; o **build é commitado em `scripts/painel_web/`**. Quem instala a skill recebe o build pronto e **não precisa de Node**. O runtime continua só Python stdlib.
2. **SSE no lugar do polling.** O servidor vigia o log (1 s) e o Orca (2 s) e empurra `mensagem`, `agente` e `tarefa` por `/api/stream`. A página carrega o estado inicial por REST e só reconecta se a conexão cair, com backoff. Ao reconectar, ela refaz o REST, porque o stream não tem replay.
3. **Multi-projeto.** Um servidor atende todos os projetos do cadastro. Todas as rotas aceitam `?projeto=`, e a SPA guarda a escolha na URL e no `localStorage`.
4. **Sem telemetria nova.** Nenhum hook novo e nada de transcript. O painel usa só log, cadastro, `avisos.log`, pendentes, notas e `orca terminal list`.
5. O contrato entre servidor e SPA fica em [`docs/referencia/painel-api.md`](../referencia/painel-api.md).

## O que não muda (herdado da 0005)
- **Somente leitura:** qualquer método diferente de GET responde 405.
- **127.0.0.1**, com acesso remoto por túnel SSH, e **checagem de `Host`** contra DNS rebinding.
- **CSP `default-src 'self'`**: sem CDN, sem script inline. Fontes e bibliotecas vão empacotadas no build.
- **Conteúdo do log é não confiável:** renderizado como texto. `dangerouslySetInnerHTML` é proibido por lint (`react/no-danger`).

## Consequências
- Há uma cadeia de build (`npm ci && npm run build`) para quem desenvolve o painel. O build gerado precisa ser commitado junto com mudanças em `web/`.
- O peso do build entra no repositório. Meta: menos de 600 KB gzip, com Analytics, Workflows e Office em chunks carregados sob demanda.
- O servidor passa a manter conexões longas: `ThreadingHTTPServer` com threads daemon, heartbeat de 15 s e limite de 16 conexões SSE.
- O `painel_web.html` do v1 fica como fallback enquanto não houver build.
