# Painel web (SPA)

React 18 + Vite + TypeScript + Tailwind. O build vai para `../scripts/painel_web/` (commitado). Contrato da API: [`docs/referencia/painel-api.md`](../docs/referencia/painel-api.md). Tokens: [`design-system/MASTER.md`](../design-system/MASTER.md). Decisão: [ADR 0010](../docs/adr/0010-painel-v2-spa-com-build-e-sse.md).

```bash
npm ci
python3 ../scripts/painel.py servir --raiz <projeto>   # outro terminal: API em 127.0.0.1:8765
npm run dev                                            # http://localhost:5173, /api vai por proxy
VITE_FIXTURES=1 npm run dev                            # sem servidor: dados de src/api/fixtures.ts
npm test                                               # Vitest
npm run lint && npx tsc --noEmit
npm run build                                          # gera ../scripts/painel_web/
```

## Para quem faz uma tela

- Cada tela é uma pasta em `src/pages/<Tela>/` com `export default` em `index.tsx` (Conversas também tem `Detalhe.tsx`). Rotas e menu já estão prontos em `src/rotas.tsx`: não precisa editá-los.
- Dados: `useApi((ctx, sinal) => cliente.agentes(ctx, sinal))` (refaz sozinho ao trocar projeto/período ou quando o stream reconecta) e `useEvento("mensagem", fn)` para o push.
- Contexto global (projeto, período, modo TV): `useContextoPainel()`. Links: `LinkPainel`, que preserva `?projeto=`, `?periodo=` e `?tv=1`.
- Visual: só componentes de `src/components/ui/` e tokens do Tailwind. Nunca `dangerouslySetInnerHTML`.
