#!/bin/bash
# Instala/atualiza os hooks do agent-board neste servidor. Idempotente.
# Os hooks apontam para ESTA pasta de scripts; o estado (cadastro de painéis,
# avisos) fica em $AGENT_BOARD_HOME (padrão ~/.agent-hooks/agent-board).
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
ESTADO="${AGENT_BOARD_HOME:-$HOME/.agent-hooks/agent-board}"
SETTINGS="$HOME/.claude/settings.json"
OMP_HOOK="$HOME/.omp/agent/hooks/pre/agent-board.ts"
CORE="$AQUI/hook_core.py"
MCP="$AQUI/mcp_server.py"

mkdir -p "$ESTADO" "$(dirname "$OMP_HOOK")" "$(dirname "$SETTINGS")"
[ -f "$ESTADO/paineis.json" ] || echo '{"versao": 1, "paineis": {}}' > "$ESTADO/paineis.json"
chmod +x "$CORE" "$AQUI/painel.py" "$MCP"

# OMP: adaptador com o caminho absoluto do core
sed "s#__AGENT_BOARD_CORE__#$CORE#" "$AQUI/omp-agent-board.ts" > "$OMP_HOOK"

# Claude Code: troca qualquer entrada antiga do agent-board pelas atuais
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
cp "$SETTINGS" "$ESTADO/settings.json.bak-$(date +%Y%m%d-%H%M%S)"
python3 - "$SETTINGS" "$CORE" <<'EOF'
import json, os, sys
alvo, core = sys.argv[1], sys.argv[2]
cmd = f"python3 {core} --dialect claude"
def h(extra=None):
    d = {"type": "command", "command": cmd, "timeout": 10}
    d.update(extra or {})
    return d
novo = {
    # Bash sem filtro "if": o filtro do Claude Code não pega redirecionamentos
    # (ex.: echo x >> log). O core descarta em milissegundos o que não interessa.
    "PreToolUse": [{"matcher": "Bash", "hooks": [h()]},
                   {"matcher": "Edit|Write|MultiEdit|NotebookEdit", "hooks": [h()]},
                   {"matcher": "SendMessage", "hooks": [h()]},
                   # board_send do servidor MCP: só para barrar subagent (a regra do envio vive no envio.py)
                   {"matcher": "mcp__agent-board__board_send", "hooks": [h()]},
                   {"matcher": "Agent|Task", "hooks": [h()]}],
    "PostToolUse": [{"matcher": "Bash", "hooks": [h()]},
                    {"matcher": "Agent|Task", "hooks": [h()]}],
    # sub-agents (ADR 0011): ciclo de vida para o painel. Nunca PreToolUse "*": a atividade
    # pega carona nos PreToolUse de Bash/Edit/Write acima.
    "SubagentStart": [{"hooks": [h()]}],
    "SubagentStop": [{"hooks": [h()]}],
    "PostToolUseFailure": [{"matcher": "Agent|Task", "hooks": [h()]}],
    "Stop": [{"hooks": [h()]}],
}
with open(alvo) as f:
    s = json.load(f)
hooks = s.setdefault("hooks", {})
for evento in list(hooks):
    hooks[evento] = [e for e in hooks[evento] if "agent-board" not in json.dumps(e)]
for evento, entradas in novo.items():
    hooks.setdefault(evento, []).extend(entradas)
# grava ao lado e troca de uma vez: um corte no meio não deixa o settings.json truncado
alvo = os.path.realpath(alvo)  # settings.json pode ser symlink (dotfiles): troca o arquivo real
tmp = alvo + ".agent-board.tmp"
with open(tmp, "w") as f:
    json.dump(s, f, indent=2)
os.replace(tmp, alvo)
EOF
# Servidor MCP (ferramentas board_*) no escopo de usuário do Claude Code, pela CLI
# (nunca editando ~/.claude.json à mão). Já registrado com este caminho: nada a fazer.
MCP_CMD="claude mcp add --scope user agent-board -- python3 $MCP"
if command -v claude >/dev/null 2>&1; then
  if atual="$(claude mcp get agent-board 2>/dev/null)" && printf '%s' "$atual" | grep -qF "$MCP"; then
    echo "servidor MCP agent-board já registrado -> $MCP"
  else
    # registrado com outro caminho (skill movida): tira o antigo antes
    claude mcp remove --scope user agent-board >/dev/null 2>&1 || true
    if claude mcp add --scope user agent-board -- python3 "$MCP" >/dev/null; then
      echo "servidor MCP agent-board registrado -> $MCP"
    else
      echo "AVISO: não consegui registrar o servidor MCP; rode: $MCP_CMD" >&2
    fi
  fi
else
  echo "Claude Code (claude) não está no PATH. Para ligar o servidor MCP, rode: $MCP_CMD"
fi

echo "agent-board $(cat "$AQUI/VERSION") instalado: hooks -> $CORE, estado -> $ESTADO"
echo "Confira com /hooks no Claude Code e /extensions numa sessão nova do OMP."
