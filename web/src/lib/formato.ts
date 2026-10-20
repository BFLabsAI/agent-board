import type { Papel } from "../api/tipos";

const NUM = new Intl.NumberFormat("pt-BR");
const COMPACTO = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export function formatarNumero(n: number): string {
  return NUM.format(n);
}

/** 1300 -> "1,3 mil". */
export function formatarCompacto(n: number): string {
  return n < 1000 ? NUM.format(n) : COMPACTO.format(n);
}

/** Minutos -> "45 s", "4 min", "1 h 20 min", "2 d 3 h". Nulo vira "—". */
export function formatarDuracaoMin(min: number | null | undefined): string {
  if (min === null || min === undefined || Number.isNaN(min)) return "—";
  if (min < 1) return `${Math.max(1, Math.round(min * 60))} s`;
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

/** 0.82 -> "82%". */
export function formatarPercentual(frac: number | null | undefined, casas = 0): string {
  if (frac === null || frac === undefined) return "—";
  return `${(frac * 100).toFixed(casas).replace(".", ",")}%`;
}

/** "há 4 min", "há 2 h", "há 3 d", "agora". Datas no futuro viram "em 5 min". */
export function tempoRelativo(iso: string | null | undefined, agora: number = Date.now()): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const delta = Math.round((agora - t) / 1000);
  const futuro = delta < 0;
  const s = Math.abs(delta);
  if (s < 45) return futuro ? "em instantes" : "agora";
  const un = (v: number, u: string) => (futuro ? `em ${v} ${u}` : `há ${v} ${u}`);
  if (s < 3600) return un(Math.max(1, Math.round(s / 60)), "min");
  if (s < 86400) return un(Math.round(s / 3600), "h");
  if (s < 86400 * 30) return un(Math.round(s / 86400), "d");
  return formatarData(iso);
}

export function formatarData(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatarHora(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${formatarHora(iso)}`;
}

export function truncar(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto;
}

/** "r7one-manager01-cc" -> "manager01-cc" (tira o prefixo do projeto). */
export function nomeCurto(agente: string): string {
  const i = agente.indexOf("-");
  return i > 0 ? agente.slice(i + 1) : agente;
}

/** Deduz o papel pelo nome quando a API não o traz. */
export function papelDoNome(nome: string): Papel {
  if (/master/i.test(nome)) return "master";
  if (/researcher/i.test(nome)) return "researcher";
  if (/manager/i.test(nome)) return "manager";
  return "manager";
}

/** Hash determinístico (FNV-1a) para avatares e cores estáveis. */
export function hashTexto(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
