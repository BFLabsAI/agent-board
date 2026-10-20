# Guia de estilo da documentação

Vale para tudo em `docs/` e para o `README.md`. A meta: **quem chega entende em minutos e consegue fazer sem ler tudo**.

## Mapa

```
README.md                 portal: o que é, 1 diagrama, setup geral, evoluções do fork, "escolha seu caminho"
docs/
├── conceitos/            entender (sem comandos longos): como funciona, papéis e mensagens, regras
├── guias/orca/           fazer, só Orca:    1-instalar, 2-montar-o-time, 3-dia-a-dia, 4-problemas
├── guias/maestri/        fazer, só Maestri: 1-instalar, 2-montar-o-time, 3-dia-a-dia, 4-problemas
├── referencia/           consultar: comandos, config, arquivos-e-estado, hooks-e-limites
├── MELHORIAS.md          o que mudou desde o fork
├── userguide/painel*.md  painel web (5 páginas: painel, painel-telas, painel-analise, painel-office, painel-geral)
└── adr/                  decisões
```

Conceitos explicam **por quê**. Guias dizem **como**, passo a passo. Referência é **tabela para consulta**. Não misture: um guia linka o conceito em vez de explicá-lo de novo.

## Tom

- Português do Brasil, frases curtas, voz ativa, "você".
- Um assunto por parágrafo, no máximo 3 linhas. Prefira lista ou tabela a parágrafo.
- Sem jargão sem explicação. Na primeira vez: **corda** (ligação entre terminais no Maestri), **painel** (o terminal de um agente), **hook** (trava automática do Claude Code).
- Nada de histórico ("na versão X mudou…") fora do `MELHORIAS.md`/`CHANGELOG.md`.

## Tamanho

- Página de guia: até ~120 linhas. Página de conceito: até ~100. Referência pode ser maior, mas só tabelas e blocos curtos.
- Se passar, divida em duas páginas.

## Estrutura de uma página de guia

```markdown
# 2. Montar o time (Orca)

> **Em 1 minuto:** o que você vai fazer e o que tem no fim.

**Antes:** o que precisa estar pronto (link para o passo anterior).

## Passo 1 — <verbo no infinitivo>
<1–2 linhas>
​```bash
<comando copiável, com placeholders entre <>>
​```
✅ **Deu certo se:** <o que aparece>

## Passo 2 — …

## Se der errado
| Você vê | Faça |
|---|---|

**Próximo:** [3. Dia a dia](3-dia-a-dia.md)
```

## Diagramas (Mermaid, renderiza no GitHub)

- Use `flowchart LR`/`TD`, `sequenceDiagram` ou `stateDiagram-v2`. Um diagrama por ideia, no máximo ~12 nós.
- Rótulos com espaço, acento ou símbolo **entre aspas**: `A["master (architect)"]`. Em `sequenceDiagram`, use `participant M as Master` e mensagens curtas sem `;` nem `#`.
- Todo diagrama tem uma frase antes dizendo o que mostrar.

## Convenções fixas

- Pasta dos scripts: `S=~/.agents/skills/agent-board/scripts` e comandos como `python3 $S/painel.py …`.
- Placeholders: `<projeto>` (caminho da raiz), `<prefixo>` (ex.: `app`), nomes `app-master`, `app-manager01-cc`, `app-researcher01-cc`.
- Papéis: **master** (coordena, revisa), **manager** (o developer: implementa e entrega), **researcher** (pesquisa, só leitura).
- Tipos de mensagem: `pedido`, `resposta`, `aviso`, `escalacao`, `entrega`, `andamento`.
- Toda afirmação sobre comando, flag ou regra tem que bater com o código em `scripts/`. Na dúvida, rode `python3 $S/painel.py <cmd> --help` ou leia o código; não invente.
- Links relativos entre páginas; confira que o arquivo existe.
