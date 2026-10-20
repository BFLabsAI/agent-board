import type { Mensagem, Periodo } from "../../api/tipos";

export type Modo = "grupo" | "lista";

export interface FiltrosFeed {
  q: string;
  agente: string;
  tipo: string;
  issue: string;
  de: string; // AAAA-MM-DD
  ate: string; // AAAA-MM-DD
  modo: Modo;
}

export const FILTROS_VAZIOS: FiltrosFeed = { q: "", agente: "", tipo: "", issue: "", de: "", ate: "", modo: "grupo" };
const CHAVES = ["q", "agente", "tipo", "issue", "de", "ate"] as const;

export function lerFiltros(p: URLSearchParams): FiltrosFeed {
  const f: FiltrosFeed = { ...FILTROS_VAZIOS };
  for (const k of CHAVES) f[k] = p.get(k) ?? "";
  f.modo = p.get("modo") === "lista" ? "lista" : "grupo";
  return f;
}

/** Devolve novos params com os filtros aplicados; preserva projeto/periodo/tv e o resto. */
export function escreverFiltros(ant: URLSearchParams, f: Partial<FiltrosFeed>): URLSearchParams {
  const n = new URLSearchParams(ant);
  for (const [k, v] of Object.entries(f)) {
    if (k === "modo") {
      if (v === "lista") n.set("modo", "lista");
      else n.delete("modo");
    } else if (v) n.set(k, String(v));
    else n.delete(k);
  }
  return n;
}

function inicioDoDia(dia: string): number {
  return new Date(`${dia}T00:00:00`).getTime();
}
function fimDoDia(dia: string): number {
  return new Date(`${dia}T23:59:59.999`).getTime();
}

/** Limite inferior (ms): `de` manda; sem ele vale o período global. */
export function limiteInferior(f: FiltrosFeed, periodo: Periodo, agora = Date.now()): number {
  if (f.de) return inicioDoDia(f.de);
  if (periodo === "24h") return agora - 24 * 3600_000;
  if (periodo === "7d") return agora - 7 * 86400_000;
  const d = new Date(agora);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function limiteSuperior(f: FiltrosFeed): number {
  return f.ate ? fimDoDia(f.ate) : Infinity;
}

export function textoBusca(m: Mensagem): string {
  return `${m.assunto ?? ""} ${m.id} ${m.de} ${m.para} ${(m.issues ?? []).map((i) => `#${i} ${i}`).join(" ")}`.toLowerCase();
}

/** Mesma regra do servidor (agente casa com de/para, tipo exato, q em texto) mais issue e datas. */
export function casaFiltro(m: Mensagem, f: FiltrosFeed, periodo: Periodo, agora = Date.now()): boolean {
  if (f.agente && m.de !== f.agente && m.para !== f.agente) return false;
  if (f.tipo && m.tipo !== f.tipo) return false;
  if (f.issue && !(m.issues ?? []).includes(Number(f.issue))) return false;
  if (f.q && !textoBusca(m).includes(f.q.toLowerCase())) return false;
  const t = Date.parse(m.ts);
  if (!Number.isNaN(t) && (t < limiteInferior(f, periodo, agora) || t > limiteSuperior(f))) return false;
  return true;
}

export function paiDe(m: Mensagem): string | null {
  const p = (m.responde_a ?? "").split(",")[0].trim();
  return p || null;
}

/** Sobe por `responde_a` até a raiz; se o pai não está carregado, a raiz é o último id conhecido. */
export function raizDe(m: Mensagem, porId: Map<string, Mensagem>): string {
  let atual = m;
  const visto = new Set<string>([m.id]);
  for (;;) {
    const p = paiDe(atual);
    if (!p || visto.has(p)) return atual.id;
    const pai = porId.get(p);
    if (!pai) return p;
    visto.add(p);
    atual = pai;
  }
}

export interface Grupo {
  raiz: string;
  mensagens: Mensagem[]; // cronológico crescente
  ultimo: number;
}

/** Agrupa por thread; grupos do mais recentemente ativo ao mais antigo. */
export function agrupar(msgs: Mensagem[], todas: Mensagem[] = msgs): Grupo[] {
  const porId = new Map(todas.map((m) => [m.id, m]));
  const mapa = new Map<string, Mensagem[]>();
  for (const m of msgs) {
    const r = raizDe(m, porId);
    const l = mapa.get(r);
    if (l) l.push(m);
    else mapa.set(r, [m]);
  }
  const grupos: Grupo[] = [];
  for (const [raiz, mensagens] of mapa) {
    mensagens.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
    grupos.push({ raiz, mensagens, ultimo: Date.parse(mensagens[mensagens.length - 1].ts) || 0 });
  }
  return grupos.sort((a, b) => b.ultimo - a.ultimo);
}

/** Campos para o painel expandido, sem `prev`; ordem fixa para os conhecidos. */
const ORDEM = ["id", "ts", "de", "para", "tipo", "assunto", "modo", "prazo", "branch", "veredito", "responde_a", "issues"];
export function camposDaMensagem(m: Mensagem): Array<[string, unknown]> {
  const r = m as unknown as Record<string, unknown>;
  const chaves = Object.keys(r).filter((k) => k !== "prev" && r[k] !== undefined && r[k] !== null && r[k] !== "");
  chaves.sort((a, b) => {
    const ia = ORDEM.indexOf(a);
    const ib = ORDEM.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return chaves.map((k) => [k, r[k]]);
}

/** Mescla mantendo ordem decrescente por ts e sem ids repetidos. */
export function mesclar(novas: Mensagem[], atuais: Mensagem[]): Mensagem[] {
  const ids = new Set(atuais.map((m) => m.id));
  const extra = novas.filter((m) => !ids.has(m.id));
  if (!extra.length) return atuais;
  return [...extra, ...atuais].sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
}
