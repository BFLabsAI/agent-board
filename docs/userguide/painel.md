# Painel do projeto (painel web)

> **Em 1 minuto:** uma página local, só de leitura, que mostra ao vivo o que o time de agentes está fazendo: quem trabalha, o que está pendente ou atrasado, o que espera revisão e como o time conversa. Decisões: [ADR-0005](../adr/0005-painel-web-local-somente-leitura.md) e [ADR-0010](../adr/0010-painel-v2-spa-com-build-e-sse.md).

**Páginas deste guia:** esta (abrir e usar) · [Telas: Dashboard, Kanban, Conversas e Activity Feed](painel-telas.md) · [Telas: Analytics e Workflows](painel-analise.md) · [Telas: Office](painel-office.md)

## Para que serve
Responde "o que aconteceu enquanto eu estava fora?" sem ler `avisos.log` nem rodar `jq`. Mostra também o que está acontecendo agora: quem está trabalhando, quem espera você e o que atrasou.

O painel **só mostra**. Ele não envia mensagem, não cadastra **painel** (o terminal de um agente) e não muda o log. Toda ação continua no terminal (`orca`, `painel.py`) ou nas ferramentas MCP, onde as regras do time valem.

| Perfil | Uso |
|---|---|
| **CEO / humano responsável** | Acompanha o time, vê atrasos e gargalos, decide onde intervir. |
| **Master** | Radar: entregas para revisar, ping-pong, painéis a recadastrar. |
| Managers e researchers | Não precisam. Usam `painel.py historico` / `tarefas` ou o MCP, que gastam menos tokens. |

## Como abrir
```bash
S=~/.agents/skills/agent-board/scripts
python3 $S/painel.py servir                      # todos os projetos do cadastro
python3 $S/painel.py servir --raiz <projeto>     # o projeto <projeto> aparece primeiro
```
✅ **Deu certo se:** o terminal imprime `painel de … em http://127.0.0.1:8765` e uma linha `log de <projeto>: N linhas` por projeto. Abra o endereço no navegador.

- **Multi-projeto:** um servidor atende todos os projetos cadastrados (com `docs/agent-board/agent-board.json` na raiz). `--raiz` é opcional e só escolhe qual abre primeiro. Sem `--raiz` e sem cadastro, o comando sai com erro.
- **Porta:** `--porta 9000` muda a 8765. **Parar:** `Ctrl+C`.
- **Servidor remoto:** o painel escuta só em `127.0.0.1`. No seu computador, abra um túnel e use o endereço local:
```bash
ssh -L 8765:127.0.0.1:8765 <servidor>
```
- **Sem login:** quem tem acesso à máquina vê o painel. De fora, só pelo túnel.
- **Sem Node:** a página já vem pronta em `scripts/painel_web/`. Só quem desenvolve o painel usa o `web/` ([README](../../web/README.md)).

## A barra lateral
| Item | O que faz |
|---|---|
| **Projeto** | Troca o projeto de todas as telas. A escolha vai para a URL (`?projeto=`) e é lembrada pelo navegador. |
| **Menu** | As 7 telas: Dashboard, Kanban, Conversas, Activity Feed, Analytics, Workflows e Office. |
| **Período** | **Hoje**, **24 h** ou **7 dias**. Vale para o que é contado "no período" (mensagens, entregas, tempo de resposta, tarefas já fechadas, Workflows). Pedidos abertos, pendentes e atrasados contam o log ativo inteiro, qualquer que seja a idade. |
| **Recolher** | Encolhe a barra para só os ícones. |
| **Live** | Estado da conexão em tempo real, no rodapé (ver abaixo). Mostra também a versão do agent-board. |

## Tempo real
A página não consulta o servidor de tempos em tempos. O servidor vigia o log (a cada 1 s) e o Orca (a cada 2 s) e **empurra** o que mudou por SSE (*Server-Sent Events*, um canal que o servidor mantém aberto). Mensagem nova, mudança de status de agente e de tarefa chegam sozinhas.

| Indicador | Significa | O que fazer |
|---|---|---|
| **Live** (verde) | Conectado. Tudo chega na hora. | Nada. |
| **Conectando** / **Reconectando** (amarelo) | A conexão caiu e a página tenta de novo, com espera crescente. Ao voltar, ela recarrega os dados, porque o canal não guarda o que perdeu. | Aguarde alguns segundos. |
| **Offline** (vermelho) | Três tentativas seguidas falharam. | Veja o quadro abaixo. |

O servidor aceita até 16 conexões ao mesmo tempo (uma por aba). A 17ª recebe erro 503: feche abas que não usa.

## O que o painel não faz
- **Não escreve nada:** qualquer método que não seja GET responde 405, inclusive `HEAD` e `OPTIONS`.
- **Não mostra o corpo das mensagens:** só o assunto fica no log.
- **Não tem telemetria de modelo:** custo, tokens e uso de ferramentas não aparecem, porque nenhum hook novo coleta isso. O painel usa só o log, o cadastro, as notas e a lista de terminais do Orca.
- **Não vê agentes do Maestri em tempo real:** o Maestri não lista terminais; o status deles fica "desconhecido" e aparecem na coluna Offline do Kanban.
- **Não executa HTML do log:** tudo vindo do log é exibido como texto.

## Se der errado
| Você vê | Faça |
|---|---|
| **Offline** no rodapé | O servidor caiu ou o túnel fechou. Reabra o `servir` e o `ssh -L`; a página volta sozinha. |
| `servir` sai com "nenhum projeto para mostrar" | Sem `--raiz` e sem painéis cadastrados. Passe `--raiz <projeto>` ou rode `painel.py cadastrar`. |
| `servir` sai com "não tem docs/agent-board/agent-board.json" | `--raiz` errada ou projeto sem `init`. Confira o caminho ou rode `painel.py init`. |
| `servir` sai com "não consegui abrir 127.0.0.1:8765" | Outra coisa usa a porta. Use `--porta 9000`. |
| Faixa vermelha "Cadeia de hash não íntegra" (Dashboard) | O log foi editado fora do fluxo. Rode `painel.py verificar --raiz <projeto>`, recupere pelo git e investigue antes de qualquer merge. |
| Agentes todos "Offline" ou "Desconhecido" | O `orca` não respondeu ao servidor, ou os painéis foram fechados. Confira `orca terminal list` e recadastre com `painel.py listar` / `cadastrar`. |
| Lista de agentes vazia | Nenhum painel cadastrado para o projeto. `painel.py listar` e `cadastrar`. |
| Projeto não aparece no seletor | A raiz dele não tem `docs/agent-board/agent-board.json`, ou nenhum painel dele está cadastrado. |
| "linha ilegível ignorada" no `avisos.log` | Linha corrompida no log. O painel segue sem ela; corrija pelo git e rode `verificar`. |
| Página antiga, sem as telas novas | O servidor está sem o build (`scripts/painel_web/`) e serve o painel antigo, de uma página só. Atualize a skill (`git pull`). |

## Regras que valem em todas as telas
- Só aparece o que está no log ativo e no cadastro. O arquivo morto (`arquivar`) fica fora, exceto no heatmap do Analytics.
- Pendente segue a regra do hook: mensagem recebida, não `resposta`, sem resposta do destino, enviada depois do cadastro do painel.
- Mensagem cujo envio falhou some do painel até o `painel.py reenviar`; o motivo fica em `avisos.log`.
- O mockup do painel antigo, só como histórico: [`painel-mockup.svg`](../../design-system/mockups/painel-mockup.svg). Tokens visuais atuais: [design-system/MASTER.md](../../design-system/MASTER.md).
