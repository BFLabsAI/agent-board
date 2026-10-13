# 0005. Painel web local, somente leitura, sem build

- **Status:** aceita (mockup aprovado em 2026-10-12)
- **Data:** 2026-10-12

## Contexto
O Maestri mostra os agentes num canvas, com linhas entre os terminais. O agent-board não tem nada visual: o humano lê `avisos.log` e `jq`. Queremos a visibilidade sem virar app de desktop, e funcionando em Linux, macOS e via SSH.

## Decisão
- `painel.py servir --raiz <path> [--porta 8765]` sobe `http.server` da stdlib em **127.0.0.1** (acesso remoto por túnel SSH, `ssh -L`).
- Uma página HTML única, sem build e sem CDN, que busca `GET /api/estado` (JSON montado a partir do log, do cadastro e das notas) e se atualiza a cada poucos segundos.
- **Somente leitura**: nenhuma rota escreve. Ações continuam no terminal/MCP, onde a política e o log valem.
- Conteúdo do log é tratado como não confiável: renderizado com `textContent`, nunca `innerHTML`. Cabeçalhos `Content-Security-Policy: default-src 'self'` e checagem de `Host` contra DNS rebinding.

## Consequências
- Sem dependência de front-end; a página é um arquivo versionado (`scripts/painel_web.html`).
- Sem autenticação: a proteção é escutar só em loopback. Expor em 0.0.0.0 fica explicitamente fora do escopo.
