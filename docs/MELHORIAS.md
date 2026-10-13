# O que melhorou no agent-board

Um resumo em linguagem simples de tudo o que mudou da versão original (**1.5.1**) até a **1.9.3**. Para os detalhes técnicos, veja o [CHANGELOG](../CHANGELOG.md) e as decisões em [`docs/adr/`](adr/).

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

`painel.py servir` abre uma página local (só leitura) com:
- o **mapa do time** (quem fala com quem, quem está devendo resposta);
- o **quadro de tarefas** (inclusive atrasos e entregas esperando revisão);
- a **linha do tempo** das mensagens;
- as **notas e decisões** do time.

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

- **8 suítes de testes** (mais de 230 testes, inclusive um que confere todos os links da documentação) rodando na CI em Python 3.8 e 3.12, mais lint.
- Código dividido em módulos pequenos (antes era um arquivo de quase 800 linhas).
- Sem nenhuma dependência nova: só a biblioteca padrão do Python.
- Decisões importantes registradas em **7 ADRs** (`docs/adr/`).

---

## O que ainda dá para melhorar

- **Montar o time num comando só** (`painel.py maestri montar`): recrutar os agentes no canvas, cadastrar e ligar as cordas de uma vez, com a sua confirmação no meio.
- **Papéis configuráveis**: hoje os nomes são fixos (master, manager, researcher). Daria para ter `developer`, `qa`, `reviewer`… definidos no `agent-board.json`.
- **Agentes que não são Claude Code** (Codex, OpenCode): as regras valem no envio, mas o bloqueio de atalhos e a cobrança de resposta dependem do hook do Claude Code. Para eles, hoje é regra do contrato.
- **Exemplos da documentação testados na CI**: os links já são conferidos (`test_docs.py`); falta rodar automaticamente cada comando citado na doc.
