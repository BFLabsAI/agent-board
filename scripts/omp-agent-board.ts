// agent-board para o OMP: liga os eventos do OMP ao hook_core.py.
// Instalado em ~/.omp/agent/hooks/pre/agent-board.ts pelo install.sh, que troca o caminho do core.
// Conferir com /extensions. Docs: https://omp.sh/docs/hooks
// Adaptado de templates/adapters/omp.ts da skill agent-hook-development.
//
// Fatos do OMP 18.8.x que este arquivo assume (conferidos no código do pacote):
//   - ferramentas: shell = "bash" ({command}); "edit" ({path} ou {input} com cabeçalhos [PATH#TAG], e
//     então event.input traz path/paths derivados); "write" ({path, content}); "ast_edit" ({paths});
//     "eval" ({input}); MCP = "mcp__<servidor>_<ferramenta>" (um "_" só, não "__").
//   - tool_call devolve { block, reason } ou { input } (objeto de argumentos completo, revalidado);
//     exceção ou timeout (30 s) no tool_call BARRA a chamada.
//   - tool_result traz content[] (texto) e isError; o core só precisa do texto.
//   - session_stop só dispara na sessão principal (nunca em subagent); stop_hook_active vira true
//     depois da primeira continuação; { decision: "block", reason } não tem teto no OMP, então
//     quem para o laço é o contador do core (MAX_COBRANCAS).
//   - ctx.agent.kind === "sub" identifica subagent (o core entende como agent_id).
import { spawnSync } from "node:child_process";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

const CORE = process.env.AGENT_BOARD_CORE ?? "__AGENT_BOARD_CORE__";
const PYTHON = process.env.AGENT_BOARD_PYTHON ?? "python3";
const TIMEOUT_MS = 10_000; // abaixo dos 30 s que o OMP dá a cada handler

const PROTEGIDOS = /comunicacoes\.jsonl|paineis\.json/;
const ORCA_ENVIO = /\borca\s+(orchestration|terminal)\s+(send|ask|reply)\b/;
const MAESTRI_ASK = /(\bmaestri|MAESTRI_CLI\}?)["']?\s+ask\b/;
const BOARD_PY = /\bboard\.py\b/;
const MCP_BOARD_SEND = /^mcp__.*board_send$/;

type Saida = Record<string, any>;

function runCore(payload: Record<string, unknown>): Saida | null {
  const res = spawnSync(PYTHON, [CORE, "--dialect", "claude"], {
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

function comando(input: any): string {
  return typeof input?.command === "string" ? input.command : "";
}

// Caminho que a ferramenta de edição vai tocar; com vários, o protegido vem primeiro.
function caminhos(input: any): string[] {
  const out: string[] = [];
  if (typeof input?.path === "string") out.push(input.path);
  if (Array.isArray(input?.paths)) out.push(...input.paths.filter((p: unknown) => typeof p === "string"));
  return out;
}

// Traduz a chamada do OMP para o vocabulário que o core conhece (dialeto Claude).
// Devolve null quando o agent-board não tem opinião sobre a chamada.
function traduzir(toolName: string, input: any): { tool_name: string; tool_input: Record<string, unknown> } | null {
  const bruto = JSON.stringify(input ?? {});
  if (toolName === "bash") {
    const cmd = comando(input);
    // log e cadastro protegidos contra escrita à mão (o core decide se é escrita)
    if (!(ORCA_ENVIO.test(cmd) || MAESTRI_ASK.test(cmd) || BOARD_PY.test(cmd) || PROTEGIDOS.test(cmd))) return null;
    return { tool_name: "Bash", tool_input: input };
  }
  if (MCP_BOARD_SEND.test(toolName)) {
    // o core procura "...__board_send"; o OMP nomeia "mcp__agent-board_board_send"
    return { tool_name: "mcp__agent-board__board_send", tool_input: input ?? {} };
  }
  if (toolName === "edit" || toolName === "write" || toolName === "ast_edit") {
    const lista = caminhos(input);
    const alvo = lista.find((p) => PROTEGIDOS.test(p)) ?? lista[0];
    if (!alvo) return null;
    // "edit" com vários cabeçalhos só traz paths[]; o core lê file_path/path
    return { tool_name: toolName === "write" ? "Write" : "Edit", tool_input: { ...input, file_path: alvo } };
  }
  if (toolName === "eval") {
    // código livre (python/js): não dá para separar leitura de escrita; citou o log ou o cadastro, o core trata como edição
    const m = PROTEGIDOS.exec(bruto);
    if (!m) return null;
    return { tool_name: "Edit", tool_input: { ...input, file_path: m[0] } };
  }
  return null;
}

function textoDe(content: any): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((c: any) => (c && c.type === "text" && typeof c.text === "string" ? c.text : ""))
    .filter(Boolean)
    .join("\n");
}

// Subagent: o core barra quem tem agent_id.
function identidade(ctx: any): Record<string, unknown> {
  const a = ctx?.agent;
  return a && a.kind === "sub" ? { agent_id: String(a.id ?? "sub"), agent_type: a.name } : {};
}

export default function agentBoard(pi: ExtensionAPI) {
  pi.on("tool_call", (event, ctx) => {
    const t = traduzir(event.toolName, event.input);
    if (!t) return undefined;
    const out = runCore({
      hook_event_name: "PreToolUse",
      tool_name: t.tool_name,
      tool_input: t.tool_input,
      tool_use_id: (event as any).toolCallId,
      cwd: (ctx as any)?.cwd,
      ...identidade(ctx),
    });
    if (out === null) {
      // Gate: se o hook quebrar numa chamada do time, a chamada é barrada.
      return { block: true, reason: "Barrado: o hook agent-board falhou; avise o master." };
    }
    const hso = out.hookSpecificOutput ?? {};
    if (hso.permissionDecision === "deny" || hso.permissionDecision === "ask") {
      return { block: true, reason: hso.permissionDecisionReason ?? "Barrado pelo agent-board." };
    }
    if (hso.updatedInput) {
      // O OMP precisa do objeto de argumentos completo (os campos extras de traduzir() não vão junto).
      return { input: { ...event.input, ...hso.updatedInput } };
    }
    return undefined;
  });

  // O aviso digitado na tela do destino nasce aqui: o core lê o resultado do envio.
  pi.on("tool_result", (event, ctx) => {
    if (event.toolName !== "bash" || !ORCA_ENVIO.test(comando(event.input))) return undefined;
    let resposta = textoDe((event as any).content);
    if ((event as any).isError && !/\berror\b/i.test(resposta)) resposta = `error: ${resposta}`;
    runCore({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: event.input,
      tool_response: resposta,
      tool_use_id: (event as any).toolCallId,
      cwd: (ctx as any)?.cwd,
      ...identidade(ctx),
    });
    return undefined;
  });

  // Toda mensagem recebida precisa de resposta antes de encerrar.
  pi.on("session_stop", (event, ctx) => {
    const out = runCore({
      hook_event_name: "Stop",
      stop_hook_active: (event as any).stop_hook_active,
      cwd: (ctx as any)?.cwd,
      ...identidade(ctx),
    });
    if (out?.decision === "block" && out.reason) {
      return { decision: "block", reason: out.reason };
    }
    return undefined;
  });
}
