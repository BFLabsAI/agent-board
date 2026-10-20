# O que melhorou no agent-board

Um resumo em linguagem simples de tudo o que mudou da versão original (**1.5.1**) até a **1.11.0**. Para os detalhes técnicos, veja o [CHANGELOG](../CHANGELOG.md) e as decisões em [`docs/adr/`](adr/).

---

## Primeiro, a ideia em 30 segundos

Vários agentes de IA (Claude Code, Codex…) trabalham juntos, cada um no seu terminal. O agent-board é o **carteiro com regras** entre eles:

1. um agente manda uma mensagem para outro;
2. o agent-board confere se pode (quem pode pedir o quê a quem);
3. anota no log do projeto;
4. entrega no terminal do destino;
5. e cobra a resposta: ninguém encerra o turno devendo resposta.

```
  master (architect) ──pedido──►  manager (developer) ──pedido──►  researcher
        ▲                                │                             │
        └──────── resposta ──────────────┘◄──────── resposta ──────────┘
                  (tudo passa pelas regras e fica no log)
```

Os papéis são três: **master** (coordena e revisa), **manager** (o developer: implementa e entrega) e **researcher** (pesquisa, só leitura). Pode haver vários de cada (`manager01`, `manager02`…).

---

## 1. Funciona no Maestri, não só no Orca

**Antes:** só funcionava com os terminais do Orca.
**Agora:** funciona também num canvas do [Maestri](https://www.themaestri.app/pt-br/docs/intro), onde os agentes ficam lado a lado e se falam por "cordas".

- No Maestri, a mensagem chega **digitada no terminal do outro agente** (o Maestri faz isso com `maestri ask`).
- Para mandar, o agente usa `board.py send` (mesmas opções do comando do Orca).
- O cadastro começa no próprio agente: ele roda `painel.py solicitar` e o master confirma com você.
- O master pode criar as cordas que as regras exigem (`painel.py maestri conectar`) e agendar a vigilância de prazos como uma routine do canvas.
- Testado de verdade no seu canvas: um master, um manager e um researcher trocaram pedidos e respostas, e o hook barrou um atalho proibido.

### Você escolhe a interface no setup

No `painel.py init … --transporte orca|maestri` você diz qual interface o time vai usar, e o contrato que os agentes leem sai escrito **só para ela**. Antes, o mesmo texto falava das duas e o agente precisava adivinhar qual valia. O cadastro também recusa terminal da interface errada. O procedimento do master agora orienta a **delegar ao time** (e não a subagents internos) o que precisa de outro papel ou harness.

## 2. Tarefas com começo, meio e fim

**Antes:** um pedido era só "pedido → resposta". Num trabalho longo, o agente era cobrado antes de terminar.
**Agora:**
- **`andamento`**: "ainda estou nisso, já fiz X". Para a cobrança sem fechar o pedido.
- **`--prazo 2h`**: pedido com hora-limite. O `painel.py vigiar` avisa o master quando vence.
- **`entrega` + veredito**: o developer entrega e o master responde **aprovado** ou **rejeitado**.
- **`painel.py tarefas`**: quadro de cada pedido (aberto, em andamento, atrasado, em revisão, concluído).
- **`--to papel:researcher`**: manda para o agente desse papel que estiver mais livre.

## 3. Regras sob medida para cada projeto (opcionais)

No `agent-board.json` do projeto, se quiser:
- **`ligacoes`**: quem pode pedir a quem (ex.: só o master pede aos managers);
- **limite de pedidos abertos** por agente;
- **alerta de ping-pong**: dois agentes trocando mensagens demais sem entregar nada;
- **`painel.py simular`**: testa uma regra nova contra o histórico real **antes** de ligar.

Sem essas chaves, tudo funciona como antes.

## 4. Log confiável

- **Cadeia de hash**: cada linha do log aponta para a anterior. Se alguém editar ou apagar uma linha no meio, o `painel.py verificar` acusa.
- **Arquivo morto**: conversas antigas e fechadas vão para `docs/agent-board/arquivo/`, e o hook continua rápido.
- **Reenvio**: se uma mensagem não chegou, o master reenvia com `painel.py reenviar`, no Orca ou no Maestri.
- Uma linha corrompida no log não trava mais o time inteiro.

## 5. Menos tokens no contexto dos agentes

O histórico, as tarefas e as pendências saem em **TOON**, um formato de tabela que gasta bem menos tokens que JSON. O log continua em JSON (para o git e o `jq`).

## 6. Ferramentas MCP: sem erro de aspas

No Claude Code, o agente pode usar ferramentas prontas (`board_send`, `board_pendentes`, `board_historico`…) em vez de montar o comando no terminal. As regras são as mesmas e o log é o mesmo. Testado ao vivo no Maestri: um manager respondeu a um pedido só com `board_send`. Passo a passo: [guia do MCP](guias/mcp.md).

## 7. Painel web para você acompanhar

**Antes:** uma página única que se atualizava a cada 5 s.
**Agora:** o painel v2, com sete telas que se atualizam sozinhas (push por SSE, sem polling) e um indicador **Live** na barra lateral:
- **Dashboard**: agentes trabalhando, pedidos abertos, pendentes, atrasados, revisão e tempo de resposta;
- **Kanban**: tarefas por estado, ou agentes por status (trabalhando, esperando você, parado…);
- **Conversas** e **Activity Feed**: cada pedido com a sua thread, e as mensagens ao vivo, com filtros e pausa;
- **Analytics** e **Workflows**: heatmap, qualidade das entregas, tempo de resposta e por onde o trabalho passa;
- **Office**: o time num escritório animado (Hub, Mapa e Grade), com a tela de cada agente numa gaveta e modo TV.

Um servidor atende todos os projetos cadastrados. Continua só leitura, só em `127.0.0.1`, e quem instala não precisa de Node. Guia: [painel web](userguide/painel.md).

## 8. Memória do time

- **`painel.py nota`**: registra decisões e contexto num lugar só (`docs/agent-board/notas/`). No Maestri, a nota pode aparecer também no canvas.
- **`painel.py resumo`**: "o que aconteceu enquanto eu estava fora?", sem ler o log inteiro.
- **Worktree por developer**: cada manager pode trabalhar na própria branch (`cadastrar --worktree`), e a entrega registra a branch.
- **Notificações**: escalações e entregas podem ir para um webhook (Slack etc.) e virar comentário na Issue do GitHub.

## 9. Bugs corrigidos

Do repositório original:
- uma mensagem que falhava continuava sendo cobrada do destinatário;
- `--body "--- texto"` saía com o corpo vazio;
- o `install.sh` podia deixar o `settings.json` truncado;
- o rodapé mandava responder a mensagens que não se respondem.

Achados no teste ao vivo no Maestri e na revisão das docs (todos com teste automático):
- a CLI do Maestri responde "ok" mesmo quando falha, e uma mensagem para um agente inexistente parecia entregue;
- o reenvio e os avisos não funcionavam para quem está no Maestri;
- um subagent conseguia falar com o time por fora da regra;
- um texto que só **citava** um comando fazia o envio ser barrado (ou pular a regra).

## 10. Qualidade

- **10 suítes de testes Python (324 testes) e 159 testes do front** (inclusive um que confere todos os links da documentação e outro que garante que o contrato de cada interface não cita a outra) A CI roda 9 das 10 suítes Python em Python 3.8 e 3.12, mais lint. A suíte do OMP (precisa do `bun`) e a do front rodam à mão.
- Código dividido em módulos pequenos (antes era um arquivo de quase 800 linhas).
- Sem nenhuma dependência nova: só a biblioteca padrão do Python.
- Decisões importantes registradas em **10 ADRs** (`docs/adr/`).

---

## O que ainda dá para melhorar

- **Montar o time num comando só** (`painel.py maestri montar`): recrutar os agentes no canvas, cadastrar e ligar as cordas de uma vez, com a sua confirmação no meio.
- **Papéis configuráveis**: hoje os nomes são fixos (master, manager, researcher). Daria para ter `developer`, `qa`, `reviewer`… definidos no `agent-board.json`.
- **Agentes que não são Claude Code** (Codex, OpenCode): as regras valem no envio, mas o bloqueio de atalhos e a cobrança de resposta dependem do hook do Claude Code. Para eles, hoje é regra do contrato.
- **Exemplos da documentação testados na CI**: os links já são conferidos (`test_docs.py`); falta rodar automaticamente cada comando citado na doc.
