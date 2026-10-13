# 3. Dia a dia (Orca)

> **Em 1 minuto:** todo agente envia com `orca orchestration send`, lê com `orca orchestration check --format` e responde tudo o que recebe. O master revisa as entregas com um veredito e acompanha o time pelo log.

**Antes:** o time cadastrado e apresentado ([2. Montar o time](2-montar-o-time.md)). As regras completas estão em [Regras](../../conceitos/regras.md); os tipos, em [Papéis e mensagens](../../conceitos/papeis-e-mensagens.md).

```bash
S=~/.agents/skills/agent-board/scripts
```

## Enviar

```bash
orca orchestration send --to <agente> --type <tipo> --subject "assunto curto" --body "texto"
```

Um exemplo de cada tipo (rode um por vez):

```bash
# pedido (master -> manager): --modo é obrigatório para manager; --prazo é opcional
orca orchestration send --to app-manager01-cc --type pedido --modo executar --prazo 2h --subject "Tela de login" --body "Implementar conforme a Issue." --issues 412
# andamento (pedido longo): vai para quem pediu e para a cobrança do fim de turno
orca orchestration send --to app-master --type andamento --responde-a <id> --subject "Login: 60%" --body "Falta o teste."
# entrega (só para o master)
orca orchestration send --to app-master --type entrega --subject "Login pronto" --body "Branch ab/app-manager01-cc, testes passando." --issues 412
# resposta: fecha a conversa
orca orchestration send --to app-manager01-cc --type resposta --responde-a <id> --subject "Re: dúvida" --body "Use a lib atual."
# aviso: informa, sem pedir trabalho
orca orchestration send --to app-researcher01-cc --type aviso --subject "Deploy às 18h" --body "Sem merge depois das 17h."
# escalacao (só para o master): algo travou ou precisa de decisão
orca orchestration send --to app-master --type escalacao --subject "Build travado" --body "Esperando lock há 5 min."
```

- O nome curto vale: `manager01-cc` vira `app-manager01-cc`.
- `--to papel:researcher` escolhe o agente desse papel com menos pedidos abertos.
- Rode o `orca` **sozinho**, um envio por comando: sem `&&`, `;`, `|`, redirecionamento, crase ou `$( )`.

✅ **Deu certo se:** o envio não foi barrado e o assunto ganhou o ID: `[c-20261007-101256-ab68 pedido·executar] ...`.

## Receber

Aparece na sua tela:

```
[agent-board] Nova mensagem c-... (pedido·executar) de app-master. Leia com: orca orchestration check --terminal term_... --format
```

Rode esse `check` **com `--format`**. Sem ele, você vê só o assunto.

## Responder

| Você recebeu | Responda com |
|---|---|
| `pedido` | `--type resposta --responde-a <id>` com o resultado ou o bloqueio. Nunca "Recebido" |
| `pedido` longo | `--type andamento --responde-a <id>` agora; a `resposta` quando terminar |
| `aviso` | `--type resposta --responde-a <id>` curta. Pode ser "recebido, nada a fazer" |
| `entrega` (master) | `--type resposta --responde-a <id> --veredito aprovado` ou `rejeitado` |
| `resposta` | Nada. Resposta não se responde. Se faltou algo, abra um `pedido` ou `aviso` novo |

Uma resposta pode fechar várias mensagens: `--responde-a <id1>,<id2>`. O rodapé da mensagem já traz o comando de resposta pronto.

Se você tentar encerrar o turno com mensagem sem resposta, o hook segura e mostra o comando (no máximo 3 vezes).

## Entrega e veredito (master)

```bash
orca orchestration send --to app-manager01-cc --type resposta --responde-a <id> --veredito rejeitado --subject "Login: falta teste" --body "Falta o teste de senha errada."
```

Rejeitado: diga no `--body` o que falta. O `--veredito` só vale na resposta a uma `entrega`.

## Prazo

`--prazo 30m|2h|1d` vale só em `pedido`. Sem ele, vale o `prazo_padrao` da config, se houver. Para escalar os vencidos, o master deixa rodando num cron ou `/loop`:

```bash
python3 $S/painel.py vigiar --raiz <projeto>
```

Cada pedido vencido é marcado `atrasado` e avisado ao master uma vez.

## Acompanhar

```bash
python3 $S/painel.py historico --raiz <projeto> --agente app-manager01-cc --n 20
python3 $S/painel.py tarefas --raiz <projeto>
python3 $S/painel.py resumo --raiz <projeto> --desde 8h
```

- `historico`: últimas mensagens, em TOON (gasta menos tokens). `--sobre <texto>` filtra pelo assunto.
- `tarefas`: um pedido ou entrega por linha, com estado (`aberto`, `em_andamento`, `atrasado`, `aguardando_revisao`, `aprovado`…).
- `resumo`: contagens, quem espera resposta, entregas, escalações e notas do período.

**Painel web** (só leitura): `python3 $S/painel.py servir --raiz <projeto>` e abra `http://127.0.0.1:8765`. Detalhes em [Painel web](../../userguide/painel.md).

## Alternativa: ferramenta MCP `board_send`

No Claude Code, o agente pode usar `board_send(para, tipo, assunto, corpo, ...)` no lugar do shell. Os parâmetros são tipados: sem problema de aspas, e crase ou `$( )` chegam como texto. As regras, o log e o aviso são os mesmos. Para ler: `board_inbox()` e `board_pendentes()`.

## Se der errado

| Você vê | Faça |
|---|---|
| `Barrado pelo agent-board: ...` | Leia o motivo: ele traz a correção. Lista em [4. Problemas](4-problemas.md) |
| O `check` mostra só o assunto | Faltou `--format` |
| O turno não encerra | Há mensagem sem resposta. Use o comando que o hook mostrou |

**Próximo:** [4. Problemas](4-problemas.md)
