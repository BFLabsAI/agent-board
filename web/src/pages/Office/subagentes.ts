import { useEffect, useState } from "react";
import type { Agente, StatusSub, SubAgente } from "../../api/tipos";

/** Rótulo e cores (hex) por status do sub-agent. */
export const ESTILO_SUB: Record<StatusSub, { rotulo: string; hex: string; texto: string }> = {
  rodando: { rotulo: "rodando", hex: "#34d399", texto: "text-emerald-300" },
  concluido: { rotulo: "concluído", hex: "#94a3b8", texto: "text-slate-400" },
  erro: { rotulo: "erro", hex: "#f87171", texto: "text-red-300" },
  perdido: { rotulo: "perdido", hex: "#fbbf24", texto: "text-amber-300" },
};

/** Tolerante: o servidor antigo não manda `subagentes`. */
export const subsDe = (a: Pick<Agente, "subagentes">): SubAgente[] => a.subagentes ?? [];

/** Rodando primeiro, depois os mais recentes. */
export function ordenarSubs(lista: SubAgente[]): SubAgente[] {
  return [...lista].sort((a, b) => {
    const ra = a.status === "rodando" ? 0 : 1;
    const rb = b.status === "rodando" ? 0 : 1;
    return ra - rb || (a.inicio < b.inicio ? 1 : a.inicio > b.inicio ? -1 : 0);
  });
}

export const rodandoDe = (lista: SubAgente[]): SubAgente[] => ordenarSubs(lista.filter((s) => s.status === "rodando"));

/** Insere ou substitui por id e reordena (mais recente primeiro). */
export function mesclarSub(lista: SubAgente[], novo: SubAgente): SubAgente[] {
  const resto = lista.filter((s) => s.id !== novo.id);
  return [...resto, novo].sort((a, b) => (a.inicio < b.inicio ? 1 : a.inicio > b.inicio ? -1 : 0));
}

/** "42s", "5m 12s", "1h 03m". */
export function formatarSegundos(s: number): string {
  const t = Math.max(0, Math.round(s));
  if (t < 60) return `${t}s`;
  const m = Math.floor(t / 60);
  if (m < 60) return `${m}m ${String(t % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** Duração em segundos: ao vivo se rodando, senão a registrada (ou fim - início). */
export function duracaoSub(s: SubAgente, agora: number): number | null {
  if (s.status === "rodando") {
    const ini = Date.parse(s.inicio);
    return Number.isNaN(ini) ? null : (agora - ini) / 1000;
  }
  if (s.duracao_s !== null && s.duracao_s !== undefined) return s.duracao_s;
  if (s.fim) {
    const d = (Date.parse(s.fim) - Date.parse(s.inicio)) / 1000;
    return Number.isNaN(d) ? null : d;
  }
  return null;
}

/** Nome do sub-agent: `nome` do servidor; fallback pelo harness do pai (-omp → subagent-omp, senão subagent-cc). */
export const nomeSub = (s: Pick<SubAgente, "nome" | "agente">): string =>
  s.nome?.trim() || (s.agente?.endsWith("-omp") ? "subagent-omp" : "subagent-cc");

/** Tipo (general-purpose, Explore…) só como detalhe secundário, quando existir. */
export const tipoDetalhe = (s: Pick<SubAgente, "tipo">): string | null => s.tipo?.trim() || null;

/** Descrição só se existir (texto não confiável: nunca placeholder). */
export const descricaoSub = (s: Pick<SubAgente, "descricao">): string | null => s.descricao?.trim() || null;

const hhmm = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/**
 * Duração para exibir, ou null (omitir a linha). Duração null não é "0s".
 * Rodando com início aproximado: "há ≥ X min" (ou "desde HH:MM" passando de 1 h).
 */
export const textoDuracao = (s: SubAgente, agora: number): string | null => {
  const d = duracaoSub(s, agora);
  if (d === null) return null;
  if (s.status === "rodando" && s.inicio_aproximado) {
    if (d >= 3600) return `desde ${hhmm(s.inicio)}`;
    return `há ≥ ${Math.max(1, Math.floor(d / 60))} min`;
  }
  return formatarSegundos(d);
};

/** "Bash  grep -rn ..." — ferramenta e resumo da última atividade; null sem atividade. */
export const textoAtividade = (s: SubAgente): string | null =>
  s.ultima_atividade ? `${s.ultima_atividade.ferramenta} ${s.ultima_atividade.resumo}`.trim() || null : null;

/** Em destaque: rodando e perdido (âmbar). */
export const emDestaque = (s: Pick<SubAgente, "status">): boolean => s.status === "rodando" || s.status === "perdido";

/** Concluído e erro viram só o resumo compacto. */
export const terminadosDe = (lista: SubAgente[]): SubAgente[] => ordenarSubs(lista.filter((s) => !emDestaque(s)));

/** "✓ 11 concluídos · ✕ 1 erro" (null sem terminados). */
export function resumoTerminados(lista: SubAgente[]): string | null {
  const t = terminadosDe(lista);
  const ok = t.filter((s) => s.status === "concluido").length;
  const er = t.filter((s) => s.status === "erro").length;
  const partes = [ok > 0 && `✓ ${ok} ${ok === 1 ? "concluído" : "concluídos"}`, er > 0 && `✕ ${er} ${er === 1 ? "erro" : "erros"}`].filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
}

/** Relógio de 1 s, ligado só quando `ativo` (há sub-agent rodando). Não faz requisição. */
export function useAgora(ativo: boolean): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!ativo) return;
    setAgora(Date.now());
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ativo]);
  return agora;
}

/** Mistura a cor do pai com branco (tom mais claro para a borda do filho). */
export function clarear(hex: string, f = 0.35): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * f));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
