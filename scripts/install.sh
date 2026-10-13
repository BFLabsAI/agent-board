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

mkdir -p "$ESTADO" "$(dirname "$OMP_HOOK")" "$(dirname "$SETTINGS")"
[ -f "$ESTADO/paineis.json" ] || echo '{"versao": 1, "paineis": {}}' > "$ESTADO/paineis.json"
chmod +x "$CORE" "$AQUI/painel.py"

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
                   {"matcher": "SendMessage", "hooks": [h()]}],
    "PostToolUse": [{"matcher": "Bash", "hooks": [h()]}],
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
echo "agent-board $(cat "$AQUI/VERSION") instalado: hooks -> $CORE, estado -> $ESTADO"
echo "Confira com /hooks no Claude Code e /extensions numa sessão nova do OMP."
