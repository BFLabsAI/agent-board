# Caminho Orca

> **Em 1 minuto:** no Orca, cada agente roda num **painel** (um terminal do Orca). O agent-board usa o correio do próprio Orca para levar mensagens entre painéis. Um **hook** (trava automática do Claude Code) confere cada envio, grava no log do projeto e avisa o destino na tela.

Usa o canvas do Maestri? Siga o [caminho Maestri](../maestri/).

Prefere ferramentas tipadas a comandos no shell? O agente também envia e lê pelo MCP (`board_send`, `board_inbox`...). Veja o [guia do MCP](../mcp.md).

## Os 4 passos

| Passo | O que você faz |
|---|---|
| [1. Instalar](1-instalar.md) | Coloca a skill numa pasta fixa e liga os hooks, uma vez por máquina |
| [2. Montar o time](2-montar-o-time.md) | Cria a config do projeto, cadastra os painéis e apresenta o time |
| [3. Dia a dia](3-dia-a-dia.md) | Envia, recebe, responde, entrega e acompanha |
| [4. Problemas](4-problemas.md) | Resolve bloqueios e faz a manutenção do time |

## O caminho de uma mensagem

O diagrama mostra o que acontece entre o envio e a leitura.

```mermaid
sequenceDiagram
    participant A as Agente app-manager01-cc
    participant H as Hook
    participant L as Log do projeto
    participant C as Correio do Orca
    participant D as Tela de app-master
    A->>H: orca orchestration send --to app-master
    H->>H: confere remetente, destino e tipo
    H->>L: grava uma linha
    H-->>A: libera, com o nome trocado pelo painel
    A->>C: o orca entrega a mensagem
    H->>D: digita o aviso de nova mensagem
    D->>C: orca orchestration check --format
```

Se o hook barra o envio, nada é gravado nem entregue. O motivo e a correção aparecem na hora.

Para entender o porquê de cada etapa, leia [Como funciona](../../conceitos/como-funciona.md).
