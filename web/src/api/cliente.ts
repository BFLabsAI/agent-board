import type {
  Agente,
  Analytics,
  Contexto,
  Conversa,
  ConversaDetalhe,
  FiltroConversas,
  FiltroGeralMensagens,
  Geral,
  PaginaMensagensGeral,
  Periodo,
  FiltroMensagens,
  FiltroSubagentes,
  PaginaMensagens,
  Projeto,
  Resumo,
  SubAgente,
  Tarefa,
  Versao,
  Workflows,
  Workspaces,
} from "./tipos";
import { ErroApi } from "./erro";

export { ErroApi };

type Params = Record<string, string | number | undefined | null>;

/** Modo fixtures (VITE_FIXTURES=1): responde com dados falsos, sem servidor. */
export const MODO_FIXTURES = import.meta.env.VITE_FIXTURES === "1";

export function montarUrl(caminho: string, params: Params = {}): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${caminho}?${s}` : caminho;
}

/** Workspace "ativo" do painel (o do contexto): é o padrão das chamadas que não passam `workspace`. */
let workspaceAtivo: string | null = null;
export function definirWorkspaceAtivo(id: string | null): void {
  workspaceAtivo = id || null;
}
export function obterWorkspaceAtivo(): string | null {
  return workspaceAtivo;
}

/** Prefixo do proxy para um Workspace remoto; vazio para o local/ausente. */
export function prefixoWorkspace(workspace: string | null | undefined): string {
  return workspace ? `/api/w/${encodeURIComponent(workspace)}` : "";
}

/** Caminho final de uma rota `/api/...` no Workspace pedido (`undefined` = o ativo, `null` = o local). */
export function caminhoWorkspace(caminho: string, workspace?: string | null): string {
  return prefixoWorkspace(workspace === undefined ? workspaceAtivo : workspace) + caminho;
}

async function buscar<T>(caminho: string, params: Params = {}, sinal?: AbortSignal, workspace?: string | null): Promise<T> {
  caminho = caminhoWorkspace(caminho, workspace);
  if (MODO_FIXTURES) {
    const { responderFixture } = await import("./fixtures");
    return responderFixture(caminho, params) as T;
  }
  const resp = await fetch(montarUrl(caminho, params), { signal: sinal, headers: { Accept: "application/json" } });
  if (!resp.ok) {
    let msg = resp.statusText;
    try {
      const corpo = (await resp.json()) as { erro?: string };
      if (corpo.erro) msg = corpo.erro;
    } catch {
      /* corpo não é JSON */
    }
    throw new ErroApi(resp.status, msg || `HTTP ${resp.status}`);
  }
  return (await resp.json()) as T;
}

const ctx = (c: Contexto) => ({ projeto: c.projeto, periodo: c.periodo });
const b = <T>(caminho: string, params: Params, sinal: AbortSignal | undefined, c: { workspace?: string | null }) =>
  buscar<T>(caminho, params, sinal, c.workspace);

export const cliente = {
  projetos: (sinal?: AbortSignal, workspace?: string | null) => buscar<Projeto[]>("/api/projetos", {}, sinal, workspace),
  resumo: (c: Contexto = {}, sinal?: AbortSignal) => b<Resumo>("/api/resumo", ctx(c), sinal, c),
  agentes: (c: Contexto = {}, sinal?: AbortSignal) => b<Agente[]>("/api/agentes", { projeto: c.projeto }, sinal, c),
  tarefas: (c: Contexto = {}, sinal?: AbortSignal) => b<Tarefa[]>("/api/tarefas", ctx(c), sinal, c),
  conversas: (f: FiltroConversas = {}, sinal?: AbortSignal) =>
    b<Conversa[]>("/api/conversas", { ...ctx(f), limite: f.limite, agente: f.agente, estado: f.estado, q: f.q }, sinal, f),
  conversa: (id: string, c: Contexto = {}, sinal?: AbortSignal) =>
    b<ConversaDetalhe>(`/api/conversas/${encodeURIComponent(id)}`, { projeto: c.projeto }, sinal, c),
  mensagens: (f: FiltroMensagens = {}, sinal?: AbortSignal) =>
    b<PaginaMensagens>(
      "/api/mensagens",
      { projeto: f.projeto, antes: f.antes, limite: f.limite, agente: f.agente, tipo: f.tipo, q: f.q },
      sinal,
      f,
    ),
  analytics: (c: Contexto = {}, sinal?: AbortSignal) => b<Analytics>("/api/analytics", { projeto: c.projeto }, sinal, c),
  workflows: (c: Contexto = {}, sinal?: AbortSignal) => b<Workflows>("/api/workflows", ctx(c), sinal, c),
  /** Visão geral: todos os squads do Workspace (não usa `projeto`). */
  geral: (c: { periodo?: Periodo; workspace?: string | null } = {}, sinal?: AbortSignal) =>
    b<Geral>("/api/geral", { periodo: c.periodo }, sinal, c),
  mensagensGeral: (f: FiltroGeralMensagens = {}, sinal?: AbortSignal) =>
    b<PaginaMensagensGeral>("/api/geral/mensagens", { antes: f.antes, limite: f.limite }, sinal, f),
  subagentes: (f: FiltroSubagentes = {}, sinal?: AbortSignal) =>
    b<SubAgente[]>("/api/subagentes", { ...ctx(f), agente: f.agente, status: f.status, limite: f.limite }, sinal, f),
  /** Todos os Workspaces da tailnet, vistos pelo painel que responde. Nunca passa pelo proxy. */
  workspaces: (c: { periodo?: Periodo } = {}, sinal?: AbortSignal) =>
    buscar<Workspaces>("/api/workspaces", { periodo: c.periodo }, sinal, null),
  /** Versão e identidade do Workspace (o ativo, ou o pedido). */
  versao: (sinal?: AbortSignal, workspace?: string | null) => buscar<Versao>("/api/versao", {}, sinal, workspace),
};

export type Cliente = typeof cliente;
