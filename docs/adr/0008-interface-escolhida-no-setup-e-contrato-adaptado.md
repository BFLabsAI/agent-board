# 0008. A interface do time é escolhida no setup e o contrato sai adaptado

- **Status:** aceita
- **Data:** 2026-10-13

## Contexto
O `CONTRATO.md` que todo agente lê trazia as duas interfaces (Orca e Maestri) no mesmo texto. Num projeto que usa só uma, o agente lia instruções que não se aplicam e tinha de escolher entre elas ("`orca …` no Orca, `board.py` no Maestri"). Num teste ao vivo isso já gerou comandos sugeridos errados. Além disso, nada no setup dizia qual interface o time usava, nem como o master devia delegar (a skill genérica `/developer` manda usar subagents internos).

## Decisão
1. **A interface é uma propriedade do projeto.** O `painel.py init` grava `"transporte": "orca" | "maestri"` no `agent-board.json` (que vai para o git e vale para o time todo). Em projeto novo a escolha é obrigatória: `--transporte`, ou a interface do terminal atual quando ela é uma só (e o `init` avisa que detectou). Ambiente ambíguo ou desconhecido: erro pedindo a flag. O procedimento do master manda **perguntar ao CEO**.
2. **Um template, duas versões.** `templates/CONTRATO.md` marca o que é de cada interface (`<!-- orca -->…<!-- /orca -->` e linhas `<!-- maestri --> texto`). `contrato.renderizar` entrega só a versão escolhida. O texto comum fica neutro.
3. **O teste garante a separação.** A versão do Orca não pode conter "maestri", "board.py", "corda" nem "canvas"; a do Maestri não pode conter "orca". Os marcadores têm de estar balanceados, senão o `init` falha.
4. **O cadastro respeita a escolha.** `cadastrar` recusa terminal da outra interface, com a mensagem de como trocar.
5. **Compatibilidade.** Projeto sem `"transporte"` (antigo) continua com o contrato das duas interfaces e sem a recusa, até alguém rodar `init --transporte`. Trocar de interface num projeto existente refaz a config e o contrato.
6. **Delegação.** O contrato ganha "Delegar: subagent ou agente do time" e o `SKILL.md` ganha a mesma orientação para o master: subagent interno só para tarefa curta dentro do próprio trabalho; o que precisa de outro papel, outro harness ou acompanhamento do CEO vira `pedido` a um agente do time.

## Alternativas descartadas
- **Dois arquivos de contrato:** os trechos comuns divergiriam com o tempo. Um template com marcadores mantém uma fonte só.
- **Escolha por máquina (no `install.sh`):** a interface é do projeto, não da máquina; o time inteiro precisa concordar, e a config já está no git.
- **Detectar a interface em tempo de execução:** o contrato é um arquivo estático lido pelo agente; ele precisa dizer só o que vale para o projeto.
- **Só detectar, sem perguntar:** um master rodando no Orca pode estar montando um time para o Maestri. A detecção é só o padrão.

## Consequências
- Projeto novo sempre nasce com contrato enxuto e sem instruções da outra interface (137 e 141 linhas, contra 156 no contrato misto).
- A escolha vira parte do setup e fica registrada no git.
- Trocar de interface exige refazer os cadastros: os terminais antigos continuam no cadastro até serem removidos.
- Nada impede um agente de rodar o comando da outra interface por conta própria; o hook segue decidindo pelo handle do terminal. A escolha orienta e valida o cadastro, não é uma trava de execução.
