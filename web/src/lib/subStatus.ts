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

export function tipoSub(s: { tipo: string | null }): string {
  return s.tipo?.trim() || "sub-agent";
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
