# 0006. Maestri como segundo transporte, com a mesma política

- **Status:** aceita
- **Data:** 2026-10-12

## Contexto
O agent-board nasceu no Orca: identidade por `$ORCA_TERMINAL_HANDLE`, entrega por `orca orchestration send`, aviso por `orca terminal send`. O time também roda no **Maestri** (macOS/Windows, terminais num canvas). Lá:

- cada terminal tem `$MAESTRI_TERMINAL_ID` e um nome no canvas, mas a CLI não lista terminais por ID;
- `maestri ask "Nome" "prompt"` digita o prompt no terminal do outro e **bloqueia até ele ficar ocioso** (minutos);
- só terminais **ligados por corda** se falam;
- notas são markdown no canvas; floors são git worktrees; no modo Maestro há `connect` e `routine`.

O Maestri resolve a conversa entre agentes, mas não registra, não confere papéis e não cobra resposta.

## Decisão
1. **Uma política, dois transportes.** A identidade passa a ser `base.meu_handle()`: o handle do Orca ou `maestri:<id>`. O cadastro guarda `transporte` e `nome_canvas`. Regras, log e cobrança não mudam.
2. **Envio único** (`envio.py`): monta o `orca orchestration send` equivalente, passa por `hook_core.decide()` (pré), entrega pelo transporte do destino e chama o pós. Serve ao MCP (`board_send`) e a uma CLI nova (`board.py send`, mesmas flags do orca).
3. **Entrega no Maestri sem bloquear:** `maestri ask` roda em processo separado. Se sair com erro em até 3 s (sem corda, nome errado), é falha: o log marca `falhou`. Senão, está entregue. Não há aviso extra: o próprio `ask` digita a mensagem.
4. **Hook:** `maestri ask` (e `--batch`) direto para um agente do time é barrado, como `SendMessage`. `--raw` só do master nos painéis do próprio time, como `orca terminal send`. `orca … send` para destino Maestri é barrado apontando o `board.py`.
5. **Cadastro em duas pontas:** o agente pede (`painel.py solicitar`, que grava ID e nome no canvas); o master confirma com o CEO e cadastra. Sem pedido, não há cadastro Maestri.
6. **Canvas a partir da política, nunca o contrário, e só com `--aplicar`:** `painel.py maestri conectar` cria as cordas que a política exige; `maestri rotina` agenda o `vigiar`. Opcionais na config: espelhar notas no canvas, status do floor na entrega.

## Alternativas descartadas
- **Usar o Wire (HTTPS 7434) em vez da CLI:** exige parear um token por máquina e é beta. A CLI já está em todo terminal do canvas.
- **Ler as cordas do canvas como `ligacoes`:** a CLI só mostra as conexões do próprio terminal, e a corda é infraestrutura, não regra. A política continua no git; o canvas segue a política.
- **Esperar o `ask` terminar:** seguraria quem envia por minutos e quebraria o modelo de correio.

## Consequências
- **A CLI `maestri` sai com código 0 mesmo quando recusa** (`Terminal 'X' not found`, `This terminal is not the Maestro`, `Note 'X' not found`), o que só apareceu testando com a CLI real. `maestri.falhou()` olha o texto do começo da saída, além do código. Se a CLI mudar essas frases, a detecção de falha precisa acompanhar (os testes com a CLI falsa reproduzem as frases atuais).
- O corpo enviado pelo `board.py`/MCP nunca passa por um shell: crase e `$( )` passam a ser aceitos nesse caminho (no shell continuam barrados).
- Remetente no Maestri com destino no Orca (time misto) não é suportado: o `--from` do orca precisa de um handle do Orca.
- `maestri ask` com ajudantes fora do time continua livre: o hook só olha destinos cadastrados.
- A nota espelhada é criada ligada a quem a escreveu primeiro; outro agente sem corda com ela cria uma cópia. Para notas compartilhadas, ligue a nota ao time no canvas.
