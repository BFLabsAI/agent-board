import { useEffect, useState } from "react";
import type { StatusSub, SubAgente } from "../api/tipos";

/** Classes literais para o Tailwind enxergar no build. */
export interface EstiloSub {
  rotulo: string;
  texto: string;
  ponto: string;
  fundo: string;
  borda: string;
  /** hex para gráficos e SVG */
  hex: string;
}

export const ESTILO_SUB: Record<StatusSub, EstiloSub> = {
  rodando: { rotulo: "Rodando", texto: "text-emerald-300", ponto: "bg-emerald-400", fundo: "bg-emerald-500/10", borda: "border-emerald-400/30", hex: "#34d399" },
  concluido: { rotulo: "Concluído", texto: "text-gray-400", ponto: "bg-gray-500", fundo: "bg-gray-500/10", borda: "border-gray-500/25", hex: "#6b7280" },
  erro: { rotulo: "Erro", texto: "text-red-300", ponto: "bg-red-400", fundo: "bg-red-500/10", borda: "border-red-400/30", hex: "#f87171" },
  perdido: { rotulo: "Perdido", texto: "text-amber-300", ponto: "bg-amber-400", fundo: "bg-amber-500/10", borda: "border-amber-400/40 border-dashed", hex: "#fbbf24" },
};

export function estiloSub(status: string | null | undefined): EstiloSub {
  return ESTILO_SUB[(status ?? "") as StatusSub] ?? ESTILO_SUB.concluido;
}

/** Lista segura: o servidor real pode ainda não mandar o campo. */
export function listaSub<T>(x: T[] | null | undefined): T[] {
  return Array.isArray(x) ? x : [];
}

/** Rótulo do sub-agent: "subagent-cc" / "subagent-omp" (harness do pai), como no Office. O tipo é detalhe à parte. */
export function tipoSub(s: { nome?: string; agente?: string; tipo?: string | null }, pai?: string): string {
  if (s.nome) return s.nome;
  return (s.agente ?? pai ?? "").endsWith("-omp") ? "subagent-omp" : "subagent-cc";
}

/** "45s", "2m 05s", "1h 12m". */
export function formatarSegundos(seg: number | null | undefined): string {
  if (seg === null || seg === undefined || !Number.isFinite(seg) || seg < 0) return "—";
  const s = Math.round(seg);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** Duração do sub-agent: ao vivo se estiver rodando. */
export function duracaoSub(s: Pick<SubAgente, "status" | "inicio" | "fim" | "duracao_s">, agora: number): number | null {
  if (s.status === "rodando") {
    const t = Date.parse(s.inicio);
    return Number.isNaN(t) ? null : Math.max(0, (agora - t) / 1000);
  }
  if (s.duracao_s !== null && s.duracao_s !== undefined) return s.duracao_s;
  if (s.fim) {
    const d = (Date.parse(s.fim) - Date.parse(s.inicio)) / 1000;
    return Number.isFinite(d) ? Math.max(0, d) : null;
  }
  return null;
}

/** Relógio de 1 s, só ligado quando `ativo` (há sub-agent rodando). */
export function useRelogio(ativo: boolean): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!ativo) return;
    setAgora(Date.now());
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ativo]);
  return agora;
}

/** Rodando primeiro, depois o mais recente. */
export function ordenarSub<T extends Pick<SubAgente, "status" | "inicio">>(l: T[]): T[] {
  return l.slice().sort((a, b) => {
    const ra = a.status === "rodando" ? 0 : 1;
    const rb = b.status === "rodando" ? 0 : 1;
    return ra - rb || b.inicio.localeCompare(a.inicio);
  });
}

/** Em destaque: rodando e perdido (âmbar). */
export const emDestaqueSub = (s: Pick<SubAgente, "status">): boolean => s.status === "rodando" || s.status === "perdido";

/** Issues do sub-agent, sem repetição e em ordem. */
export function issuesSub(s: Pick<SubAgente, "issues">): number[] {
  return Array.from(new Set((Array.isArray(s.issues) ? s.issues : []).filter((n) => Number.isInteger(n) && n > 0)));
}

/** Destino do chip: conversa da tarefa, se houver; senão a busca pela issue. */
export function destinoIssue(n: number, tarefaId?: string | null): string {
  return tarefaId ? `/conversas/${encodeURIComponent(tarefaId)}` : `/conversas?q=${encodeURIComponent(`#${n}`)}`;
}

/** Texto do tempo, ou null (omitir). Duração desconhecida nunca vira "0s"; rodando com início aproximado vira "há ≥ X min". */
export function textoDuracaoSub(s: SubAgente, agora: number): string | null {
  const aprox = s.status === "rodando" && s.inicio_aproximado;
  const d = duracaoSub(s, agora);
  if (d === null) return null;
  if (aprox) {
    if (d >= 3600) {
      const dt = new Date(s.inicio);
      return `desde ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
    }
    return `há ≥ ${Math.max(1, Math.floor(d / 60))} min`;
  }
  return formatarSegundos(d);
}

/** Descrição só se existir. */
export const descricaoSubTexto = (s: Pick<SubAgente, "descricao">): string | null => s.descricao?.trim() || null;

export interface GrupoIssue {
  /** null = sem issue */
  issue: number | null;
  subs: SubAgente[];
}

/** Agrupa pela primeira issue de cada sub-agent; grupos com mais itens primeiro, "sem issue" por último. */
export function agruparPorIssue(lista: SubAgente[]): GrupoIssue[] {
  const m = new Map<number | null, SubAgente[]>();
  for (const s of lista) {
    const k = issuesSub(s)[0] ?? null;
    m.set(k, [...(m.get(k) ?? []), s]);
  }
  return [...m.entries()]
    .map(([issue, subs]) => ({ issue, subs }))
    .sort((a, b) => (a.issue === null ? 1 : b.issue === null ? -1 : b.subs.length - a.subs.length || b.issue - a.issue));
}

/** "✓ 11 concluídos · ✕ 1 erro" ou, com issues, "✓ 8 concluídos em #587 · 3 em #588 · 2 sem issue · ✕ 1 erro". */
export function resumoTerminadosSub(terminados: SubAgente[], agrupar = true): string | null {
  const ok = terminados.filter((s) => s.status === "concluido");
  const er = terminados.length - ok.length;
  const partes: string[] = [];
  if (ok.length > 0) {
    const grupos = agrupar && ok.some((s) => issuesSub(s).length > 0) ? agruparPorIssue(ok) : [];
    if (grupos.length === 0) partes.push(`✓ ${ok.length} ${ok.length === 1 ? "concluído" : "concluídos"}`);
    else {
      const ft = (g: GrupoIssue) => (g.issue === null ? "sem issue" : `#${g.issue}`);
      const [g0, ...resto] = grupos.slice(0, 3);
      partes.push(`✓ ${g0.subs.length} ${g0.subs.length === 1 ? "concluído" : "concluídos"} ${g0.issue === null ? "" : "em "}${ft(g0)}`);
      for (const g of resto) partes.push(`${g.subs.length} ${g.issue === null ? "" : "em "}${ft(g)}`);
      if (grupos.length > 3) partes.push(`+${grupos.length - 3}`);
    }
  }
  if (er > 0) partes.push(`✕ ${er} ${er === 1 ? "erro" : "erros"}`);
  return partes.length ? partes.join(" · ") : null;
}
