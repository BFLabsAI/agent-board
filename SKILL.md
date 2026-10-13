---
name: agent-board
description: Monta e mantém a comunicação entre agentes de terminais diferentes (master, managers, researcher) via correio do Orca, com hooks que validam, registram em log e obrigam resposta. Use quando o CEO pedir para configurar o time de agentes de um projeto, cadastrar ou recadastrar painéis, incluir ou tirar um agente, investigar mensagem barrada ou instalar o agent-board num servidor.
---

# Agent-board

Padroniza como agentes em terminais diferentes do Orca se falam:
- **um canal só:** o correio do Orca;
- **remetente provado** pelo ID do painel;
- **log por projeto** no git;
- **aviso na tela do destino;**
- **toda mensagem recebida exige resposta.**

Quem usa esta skill é o **master** do projeto. Os outros agentes leem só o `CONTRATO.md` do projeto.

Harnesses cobertos pelos hooks: Claude Code e OMP. Agentes de outro harness (Codex, Hermes etc.) seguem o contrato, mas sem trava automática.

## Peças

| Peça | Onde | Papel |
|---|---|---|
| [`scripts/hook_core.py`](scripts/hook_core.py) | skill | Regras: antes do envio (valida, traduz nome → painel, grava o log), depois do envio (avisa o destino) e ao encerrar (cobra resposta) |
| [`scripts/omp-agent-board.ts`](scripts/omp-agent-board.ts) | skill | Adaptador do OMP para o mesmo core |
| [`scripts/painel.py`](scripts/painel.py) | skill | `init`, `listar`, `cadastrar`, `remover`, `historico`, `verificar`, `arquivar`, `reenviar`, `tarefas`, `vigiar`, `simular` |
| [`scripts/politica.py`](scripts/politica.py) | skill | Regras de envio sem I/O (`validar_envio`), usadas pelo hook e pelo `simular` |
| [`scripts/install.sh`](scripts/install.sh) | skill | Liga os hooks no servidor (idempotente, com backup) |
| [`scripts/test_agent_board.py`](scripts/test_agent_board.py) | skill | Testes a seco, sem envio real |
| [`scripts/VERSION`](scripts/VERSION) | skill | Versão do pacote |
| [`templates/CONTRATO.md`](templates/CONTRATO.md) | vira `docs/agent-board/CONTRATO.md` | Regras que todo agente do projeto lê |
| [`templates/agent-board.json`](templates/agent-board.json) | vira `docs/agent-board/agent-board.json` | Prefixo e quem pode pedir a quem |
| `~/.agent-hooks/agent-board/paineis.json` | servidor, fora do git | Cadastro: ID do painel → projeto e agente |
| `docs/agent-board/comunicacoes.jsonl` | projeto, no git | Log: uma linha por mensagem |

`S=~/.agents/skills/agent-board/scripts` nos comandos abaixo (ajuste se a skill estiver em outro lugar).

## 1. Instalar no servidor (uma vez por servidor)

```bash
bash $S/install.sh && python3 $S/test_agent_board.py
```

Os testes precisam passar todos. Depois confira:
- no Claude Code, a lista de hooks deve mostrar as entradas `agent-board` em PreToolUse (Bash e SendMessage), PostToolUse e Stop;
- no OMP, a lista de extensões de uma sessão nova deve trazer o `agent-board`.

Com o cadastro vazio, os hooks não agem sobre ninguém.

## 2. Configurar um projeto

1. Combine com o CEO o **prefixo** do projeto: curto, só minúsculas e números (ex.: `<project-prefix>`).
2. Crie os arquivos do projeto:
   ```bash
   python3 $S/painel.py init --raiz <project-path> --projeto <project-name> --prefixo <project-prefix>
   ```
   Isso cria `docs/agent-board/` com a config, o `CONTRATO.md` e o log vazio, e acrescenta `merge=union` do log no `.gitattributes`. Não sobrescreve o que já existe.
3. Ajuste os papéis em `agent-board.json` se o CEO quiser regras diferentes das padrão. As chaves opcionais `prazo_padrao`, `limites` (`pedidos_abertos_max`, `ping_pong_max`, `ping_pong_janela_min`) e `ligacoes` (pares `[de, para]` por papel ou nome) só valem quando preenchidas; veja o README. Antes de mudar a config de um projeto em uso, rode `python3 $S/painel.py simular --raiz <project-path> --config <novo.json>` e mostre ao CEO o que passaria a ser barrado.
4. Acrescente uma linha nas regras do projeto (AGENTS.md ou equivalente): "Agentes se falam só pelo `orca`, conforme `docs/agent-board/CONTRATO.md`".
5. Faça o commit numa branch e siga o fluxo de merge do projeto.

## 3. Cadastrar os painéis (sempre com confirmação do CEO)

1. Pergunte ao CEO quem é quem. Ele pode mandar a lista ou pedir que você leia os painéis abertos.
2. Rode `python3 $S/painel.py listar`. A saída traz ID, título e cadastro atual de cada terminal do Orca.
3. Monte a lista no padrão de nomes `<project-prefix>-master`, `<project-prefix>-manager<NN>-<runtime>` e `<project-prefix>-researcher<NN>-<runtime>`. Códigos de runtime: `cc` Claude Code, `omp` Oh My Pi, `cx` Codex, `agy` Antigravity, `oc` OpenCode, `hr` Hermes.
4. **Mostre a lista ao CEO e espere a confirmação.** Não cadastre por dedução.
5. Cadastre:
   ```bash
   python3 $S/painel.py cadastrar --raiz <project-path> term_...=<project-prefix>-master term_...=<project-prefix>-manager01-cc ...
   ```
6. Peça ao CEO que dê às sessões o mesmo nome do cadastro. Isso ajuda a leitura na tela, mas não serve de identidade.

## 4. Apresentar o time (virada)

Para cada agente cadastrado, mande uma mensagem pelo próprio canal:

```bash
orca orchestration send --to <agente> --type aviso --subject "Novo canal entre agentes" --body "A partir de agora, falar com outros agentes só por orca orchestration send, conforme docs/agent-board/CONTRATO.md. Leia o contrato e responda com --type resposta."
```

A resposta de cada um confirma que leu. Na mesma virada, aposente os canais paralelos:
- Runs de correio criadas à mão: avise que não são mais usadas;
- envio direto para `term_...` sem passar pelo time;
- o canal nativo de mensagem entre sessões do harness.

## 5. Manutenção

- **Painel reaberto:** o envio dele é barrado com "peça ao master para recadastrar". Rode o passo 3 só para esse agente. O recadastro substitui o painel antigo.
- **Agente novo:** o passo 3 para ele e depois o passo 4 para ele.
- **Agente saiu:** `python3 $S/painel.py remover term_...`.
- **Mensagem barrada:** o motivo vem no próprio bloqueio. As causas comuns são:
  - destino fora do time (agente cadastrado só fala com cadastrados do mesmo projeto);
  - tipo fora da lista;
  - falta `--modo` em pedido para manager;
  - resposta a entrega sem `--veredito aprovado|rejeitado`, ou `--prazo` inválido;
  - `andamento` sem `--responde-a` de um pedido aberto que o agente recebeu;
  - destino no limite de pedidos abertos, ou par fora das `ligacoes`;
  - comando `orca` encadeado com outro;
  - uso de `orchestration reply` ou `ask` entre agentes do time (use `send --type resposta` ou `pedido`);
  - tentativa de editar à mão o log ou o cadastro;
  - destino de outro projeto.
- **Aviso que não apareceu na tela:** veja `~/.agent-hooks/agent-board/avisos.log`. Se havia uma pergunta aberta na tela do destino, o aviso não é digitado, mas a mensagem continua no correio. O aviso também é limitado a 1 por destino a cada 60 s (estado em `avisos-estado.json`): dentro da janela, o hook espera e só digita se o destino ainda tiver mensagem não lida.
- **Agente encerrando sem responder:** o hook segura até 3 vezes e depois registra no `avisos.log`. Cobre o agente pelo próprio canal. Em pedido longo, o agente manda `--type andamento` e deixa de ser cobrado até terminar.
- **Quadro de tarefas:** `python3 $S/painel.py tarefas --raiz <project-path>` mostra cada pedido e entrega com o estado (aberto, em_andamento, atrasado, aguardando_revisao…). Ao revisar uma entrega, responda com `--veredito aprovado` ou `--veredito rejeitado`.
- **Prazos:** deixe `python3 $S/painel.py vigiar --raiz <project-path>` num cron ou `/loop`. Ele escala uma vez cada pedido vencido e avisa você na tela.
- **Ping-pong:** com `limites.ping_pong_max`, conversa demais entre o mesmo par aparece na sua tela e no `avisos.log`. Não é bloqueio: decida se separa a frente ou pede uma entrega.
- **Consultar o log:** `python3 $S/painel.py historico --raiz <project-path> --agente <agente>` (TOON, econômico para o contexto) ou `jq -c 'select(.para=="<agente>")' docs/agent-board/comunicacoes.jsonl`.
- **Mensagem que não chegou** (painel fechou antes de ler, envio falhou): `python3 $S/painel.py reenviar --raiz <project-path> <id>`.
- **Integridade do log:** `python3 $S/painel.py verificar --raiz <project-path>` antes de um merge importante ou se suspeitar de edição à mão.
- **Log grande:** `python3 $S/painel.py arquivar --raiz <project-path>` uma vez por mês, numa branch, com commit.

## 6. Atualizar ou desinstalar

- **Atualizar:** depois de atualizar a skill, rode `install.sh` de novo. Se o contrato mudou, rode em cada projeto `painel.py init ... --atualizar-contrato`, faça o commit e avise o time por `aviso`.
- **Desinstalar:** tire da configuração de hooks do usuário no Claude Code as entradas que contêm `agent-board` (o `install.sh` mostra o arquivo e guarda um backup em `~/.agent-hooks/agent-board/`), e apague `~/.omp/agent/hooks/pre/agent-board.ts`. Esvaziar o `paineis.json` já desliga o efeito.

## Regras que você não quebra

- Nunca cadastre um painel sem a confirmação do CEO.
- Nunca faça teste ao vivo nos painéis do time em produção. Use um projeto de teste próprio, com painéis próprios, e feche tudo ao terminar. O hook impede que agentes de teste falem com o time real, mas não abra o teste no meio do time sem avisar o CEO.
- Não altere o `CONTRATO.md` de um projeto sem o CEO. Mudança de regra vale para todos os projetos: faça no template desta skill.
