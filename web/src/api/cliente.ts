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
  Workflows,
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

async function buscar<T>(caminho: string, params: Params = {}, sinal?: AbortSignal): Promise<T> {
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

export const cliente = {
  projetos: (sinal?: AbortSignal) => buscar<Projeto[]>("/api/projetos", {}, sinal),
  resumo: (c: Contexto = {}, sinal?: AbortSignal) => buscar<Resumo>("/api/resumo", ctx(c), sinal),
  agentes: (c: Contexto = {}, sinal?: AbortSignal) => buscar<Agente[]>("/api/agentes", { projeto: c.projeto }, sinal),
  tarefas: (c: Contexto = {}, sinal?: AbortSignal) => buscar<Tarefa[]>("/api/tarefas", ctx(c), sinal),
  conversas: (f: FiltroConversas = {}, sinal?: AbortSignal) =>
    buscar<Conversa[]>(
      "/api/conversas",
      { ...ctx(f), limite: f.limite, agente: f.agente, estado: f.estado, q: f.q },
      sinal,
    ),
  conversa: (id: string, c: Contexto = {}, sinal?: AbortSignal) =>
    buscar<ConversaDetalhe>(`/api/conversas/${encodeURIComponent(id)}`, { projeto: c.projeto }, sinal),
  mensagens: (f: FiltroMensagens = {}, sinal?: AbortSignal) =>
    buscar<PaginaMensagens>(
      "/api/mensagens",
      { projeto: f.projeto, antes: f.antes, limite: f.limite, agente: f.agente, tipo: f.tipo, q: f.q },
      sinal,
    ),
  analytics: (c: Contexto = {}, sinal?: AbortSignal) => buscar<Analytics>("/api/analytics", { projeto: c.projeto }, sinal),
  workflows: (c: Contexto = {}, sinal?: AbortSignal) => buscar<Workflows>("/api/workflows", ctx(c), sinal),
  /** Visão geral: todos os squads do servidor (não usa `projeto`). */
  geral: (c: { periodo?: Periodo } = {}, sinal?: AbortSignal) => buscar<Geral>("/api/geral", { periodo: c.periodo }, sinal),
  mensagensGeral: (f: FiltroGeralMensagens = {}, sinal?: AbortSignal) =>
    buscar<PaginaMensagensGeral>("/api/geral/mensagens", { antes: f.antes, limite: f.limite }, sinal),
  subagentes: (f: FiltroSubagentes = {}, sinal?: AbortSignal) =>
    buscar<SubAgente[]>(
      "/api/subagentes",
      { ...ctx(f), agente: f.agente, status: f.status, limite: f.limite },
      sinal,
    ),
};

export type Cliente = typeof cliente;
