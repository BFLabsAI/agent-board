import type { Agente, EstadoTarefa, Tarefa } from "../../../api/tipos";
import { estiloPapel } from "../../../lib/cores";
import { hashTexto } from "../../../lib/formato";

/** Estados em que a tarefa ainda ocupa o agente (inclui a entrega que espera revisão). */
export const ESTADOS_ABERTOS: ReadonlySet<EstadoTarefa> = new Set(["aberto", "em_andamento", "atrasado", "aguardando_revisao"]);

const PALETA = ["#38bdf8", "#a78bfa", "#f472b6", "#2dd4bf", "#fb923c", "#818cf8", "#4ade80", "#f87171"];

/** Cor estável por agente (o master usa sempre o âmbar do papel). */
export function corDoAgente(a: Pick<Agente, "agente" | "papel">): string {
  if (a.papel === "master") return estiloPapel("master").hex;
  return PALETA[hashTexto(a.agente) % PALETA.length];
}

export function tarefasAbertasDe(agente: string, tarefas: Tarefa[]): Tarefa[] {
  return tarefas
    .filter((t) => t.para === agente && ESTADOS_ABERTOS.has(t.estado))
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
}

/** Pedidos abertos que o agente fez (de) e entregas esperando a revisão dele. */
export function resumoDoMaster(agente: string, tarefas: Tarefa[]): { pedidos: number; revisao: number } {
  let pedidos = 0;
  let revisao = 0;
  for (const t of tarefas) {
    if (t.de !== agente) continue;
    if (t.estado === "aguardando_revisao") revisao++;
    else if (t.estado === "aberto" || t.estado === "em_andamento" || t.estado === "atrasado") pedidos++;
  }
  return { pedidos, revisao };
}

export function rotuloHarness(h: Agente["harness"]): string | null {
  if (h === "cc") return "CC";
  if (h === "omp") return "OMP";
  if (h === "maestri") return "Maestri";
  return null;
}

export function nomeWorktree(w: string | null): string {
  if (!w) return "Sem worktree";
  const partes = w.split("/").filter(Boolean);
  return partes[partes.length - 1] ?? w;
}
