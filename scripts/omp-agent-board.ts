// agent-board para o OMP: liga os eventos do OMP ao hook_core.py.
// Instalado em ~/.omp/agent/hooks/pre/agent-board.ts pelo install.sh, que troca o caminho do core.
// Conferir com /extensions. Docs: https://omp.sh/docs/hooks
// Adaptado de templates/adapters/omp.ts da skill agent-hook-development.
import { spawnSync } from "node:child_process";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

const CORE = process.env.AGENT_BOARD_CORE ?? "__AGENT_BOARD_CORE__";
const TIMEOUT_MS = 10_000;

function runCore(payload: Record<string, unknown>): Record<string, any> | null {
  const res = spawnSync("python3", [CORE, "--dialect", "claude"], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    timeout: TIMEOUT_MS,
  });
  if (res.error || res.status !== 0) return null;
  try {
    return JSON.parse(res.stdout || "{}");
  } catch {
    return null;
  }
}

function mexeComOrca(input: any): boolean {
  if (typeof input?.command === "string" && /\borca\s+(orchestration|terminal)\s+(send|ask|reply)\b/.test(input.command)) return true;
  // Maestri: `maestri ask` direto para um agente do time é barrado pelo core
  if (typeof input?.command === "string" && /(\bmaestri|MAESTRI_CLI\}?)["']?\s+ask\b/.test(input.command)) return true;
  // log e cadastro protegidos contra escrita à mão
  return /comunicacoes\.jsonl|paineis\.json/.test(JSON.stringify(input ?? {}));
}

export default function agentBoard(pi: ExtensionAPI) {
  pi.on("tool_call", (event) => {
    if (!mexeComOrca(event.input)) return undefined;
    const out = runCore({
      hook_event_name: "PreToolUse",
      tool_name: event.toolName,
      tool_input: event.input,
      tool_use_id: (event as any).toolCallId,
    });
    if (out === null) {
      // Gate: se o hook quebrar num envio do time, o envio é barrado.
      return { block: true, reason: "Barrado: o hook agent-board falhou; avise o master." };
    }
    const hso = out.hookSpecificOutput ?? {};
    if (hso.permissionDecision === "deny") {
      return { block: true, reason: hso.permissionDecisionReason ?? "Barrado pelo agent-board." };
    }
    if (hso.updatedInput) {
      // O OMP precisa do objeto de argumentos completo.
      return { input: { ...event.input, ...hso.updatedInput } };
    }
    return undefined;
  });

  pi.on("tool_result", (event) => {
    if (!mexeComOrca(event.input)) return undefined;
    runCore({
      hook_event_name: "PostToolUse",
      tool_name: event.toolName,
      tool_input: event.input,
      tool_use_id: (event as any).toolCallId,
    });
    return undefined;
  });

  // Toda mensagem recebida precisa de resposta antes de encerrar.
  pi.on("session_stop", (event) => {
    const out = runCore({ hook_event_name: "Stop", stop_hook_active: (event as any).stop_hook_active });
    if (out?.decision === "block" && out.reason) {
      return { decision: "block", reason: out.reason };
    }
    return undefined;
  });
}
