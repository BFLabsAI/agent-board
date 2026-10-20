import type { ColunaWorkflow, Workflows } from "../../api/tipos";
import { papelDoNome } from "../../lib/formato";

export type No = Workflows["nos"][number];
export type Aresta = Workflows["arestas"][number];

export const ID_MAIS = "__mais";
export const MAX_ISSUES = 8;

export const COLUNAS_GRAFO = [
  { titulo: "MASTER", colunas: ["master"] },
  { titulo: "MANAGERS / RESEARCHERS", colunas: ["manager", "researcher"] },
  { titulo: "SUB-AGENTS", colunas: ["subagente"] },
  { titulo: "ISSUES", colunas: ["issue"] },
  { titulo: "REVISÃO", colunas: ["revisao"] },
  { titulo: "RESULTADO", colunas: ["resultado"] },
] as const satisfies ReadonlyArray<{ titulo: string; colunas: ReadonlyArray<ColunaWorkflow> }>;

export function indiceColuna(c: ColunaWorkflow): number {
  return COLUNAS_GRAFO.findIndex((g) => (g.colunas as ReadonlyArray<string>).includes(c));
}

/** Colunas do grafo. A coluna SUB-AGENTS só existe se o servidor mandou nós de sub-agent (JSON antigo não tem). */
export function colunasDoGrafo(nos: ReadonlyArray<Pick<No, "coluna">> = [{ coluna: "subagente" }]): typeof COLUNAS_GRAFO[number][] {
  const tem = temSubagentes(nos);
  return COLUNAS_GRAFO.filter((c) => tem || c.titulo !== "SUB-AGENTS");
}

export function temSubagentes(nos: ReadonlyArray<Pick<No, "coluna">>): boolean {
  return nos.some((n) => n.coluna === "subagente");
}

export const COR_SUBAGENTE = "#f472b6";

const CLARO: Record<string, string> = { master: "#fcd34d", manager: "#a5b4fc", researcher: "#6ee7b7" };
/** Cor do time de sub-agents: a do agente pai em tom mais claro. */
export function corSub(id: string): string {
  return CLARO[papelDoNome(id.replace(/^sub:/, ""))] ?? COR_SUBAGENTE;
}

export function ehSub(c: ColunaWorkflow): boolean {
  return c === "subagente";
}

const ORDEM_RESULTADO = ["aprovado", "rejeitado", "concluido", "atrasado", "em_aberto"];

/** Cor de cada nó: por coluna; resultado pela situação. */
export function corNo(no: Pick<No, "id" | "coluna">): string {
  switch (no.coluna) {
    case "master":
      return "#f59e0b";
    case "manager":
      return "#6366f1";
    case "researcher":
      return "#10b981";
    case "issue":
      return "#38bdf8";
    case "revisao":
      return "#a78bfa";
    case "subagente":
      return corSub(no.id);
    default:
      return (
        { aprovado: "#34d399", rejeitado: "#f87171", concluido: "#2dd4bf", atrasado: "#fb923c", em_aberto: "#94a3b8" }[no.id] ??
        "#94a3b8"
      );
  }
}

export const CHAVES_RESULTADO = ORDEM_RESULTADO;

function somar(arestas: Aresta[]): Aresta[] {
  const m = new Map<string, Aresta>();
  for (const a of arestas) {
    const k = `${a.de}\u0000${a.para}`;
    const ant = m.get(k);
    if (ant) ant.n += a.n;
    else m.set(k, { ...a });
  }
  return [...m.values()];
}

/** Mantém os maiores `max` issues e agrupa o resto em "+N mais". Descarta arestas órfãs. */
export function agruparIssues(nos: No[], arestas: Aresta[], max = MAX_ISSUES): { nos: No[]; arestas: Aresta[] } {
  const ids = new Set(nos.map((n) => n.id));
  const validas = arestas.filter((a) => ids.has(a.de) && ids.has(a.para));
  const issues = nos.filter((n) => n.coluna === "issue");
  if (issues.length <= max) return { nos, arestas: somar(validas) };
  const ordenadas = [...issues].sort((a, b) => b.n - a.n);
  const manter = new Set(ordenadas.slice(0, max).map((n) => n.id));
  const resto = ordenadas.slice(max);
  const mais: No = { id: ID_MAIS, coluna: "issue", rotulo: `+${resto.length} mais`, n: resto.reduce((s, n) => s + n.n, 0) };
  const mapa = (id: string) => (ids.has(id) && issues.some((i) => i.id === id) && !manter.has(id) ? ID_MAIS : id);
  const novos = [...nos.filter((n) => n.coluna !== "issue"), ...ordenadas.slice(0, max), mais];
  return { nos: novos, arestas: somar(validas.map((a) => ({ ...a, de: mapa(a.de), para: mapa(a.para) }))) };
}

export interface NoPos extends No {
  x: number;
  y: number;
  w: number;
  h: number;
  cor: string;
}

export const LARGURA = 1200;
export const LARG_NO = 156;
export const ALT_NO = 34;
export const ALT_SUB = 34;
const PASSO = 46;
const PASSO_SUB = 40;
const ALTURA_MIN = 380;
export const TOPO = 56;
export const FOLGA = 28;

function ordemNo(a: No, b: No): number {
  if (a.coluna === "resultado" && b.coluna === "resultado") return ORDEM_RESULTADO.indexOf(a.id) - ORDEM_RESULTADO.indexOf(b.id);
  if (a.id === ID_MAIS) return 1;
  if (b.id === ID_MAIS) return -1;
  if (a.coluna !== b.coluna) return a.coluna === "researcher" ? 1 : -1;
  if (a.coluna === "issue") return b.n - a.n;
  return 0;
}

/** Posição de cada coluna principal, a partir de FOLGA. */
export function xColuna(i: number, total: number = COLUNAS_GRAFO.length): number {
  return FOLGA + i * ((LARGURA - 2 * FOLGA - LARG_NO) / (total - 1));
}

/**
 * Layout em colunas. Os nós de sub-agents ficam alinhados verticalmente ao agente pai;
 * se dois colidirem, o de baixo desce, e a altura cresce se faltar espaço.
 */
export function layoutGrafo(nos: No[]): { pos: NoPos[]; alturaGrafo: number; altura: number } {
  const colunas = colunasDoGrafo(nos);
  const cols = colunas.map((g) => nos.filter((n) => (g.colunas as ReadonlyArray<string>).includes(n.coluna)).sort(ordemNo));
  const iSub = colunas.findIndex((g) => (g.colunas as ReadonlyArray<string>).includes("subagente"));
  const maior = Math.max(1, ...cols.map((c) => c.length));
  let alturaGrafo = Math.max(ALTURA_MIN, maior * PASSO + TOPO + 40);
  const montar = (alt: number) => {
    const util = alt - TOPO;
    const pos: NoPos[] = [];
    const pais = new Map<string, NoPos>();
    cols.forEach((c, i) => {
      if (i === iSub) return;
      const ini = TOPO + (util - c.length * PASSO) / 2 + (PASSO - ALT_NO) / 2;
      c.forEach((n, j) => {
        const p = { ...n, x: xColuna(i, colunas.length), y: ini + j * PASSO, w: LARG_NO, h: ALT_NO, cor: corNo(n) };
        pos.push(p);
        pais.set(n.id, p);
      });
    });
    let fundo = 0;
    if (iSub >= 0) {
      const desejado = (n: No) => {
        const pai = pais.get(n.id.replace(/^sub:/, ""));
        return pai ? pai.y + pai.h / 2 - ALT_SUB / 2 : TOPO;
      };
      const subs = cols[iSub].map((n) => ({ n, y: desejado(n) })).sort((a, b) => a.y - b.y);
      let ant = -Infinity;
      for (const s of subs) {
        const y = Math.max(s.y, ant + PASSO_SUB);
        ant = y;
        fundo = Math.max(fundo, y + ALT_SUB);
        pos.push({ ...s.n, x: xColuna(iSub, colunas.length), y, w: LARG_NO, h: ALT_SUB, cor: corNo(s.n) });
      }
    }
    return { pos, fundo };
  };
  let r = montar(alturaGrafo);
  if (r.fundo > alturaGrafo - 24) {
    alturaGrafo = r.fundo + 24;
    r = montar(alturaGrafo);
  }
  return { pos: r.pos, alturaGrafo, altura: alturaGrafo };
}

/** Tooltip perto do ponteiro, sempre inteiro dentro da caixa (card). Coordenadas relativas à caixa. */
export function posicionarTooltip(
  ponteiro: { x: number; y: number },
  caixa: { w: number; h: number },
  tip: { w: number; h: number },
  deslocamento = 14,
): { left: number; top: number } {
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, Math.max(min, max)));
  let left = ponteiro.x + deslocamento;
  if (left + tip.w > caixa.w - 4) left = ponteiro.x - deslocamento - tip.w;
  let top = ponteiro.y + deslocamento;
  if (top + tip.h > caixa.h - 4) top = ponteiro.y - deslocamento - tip.h;
  return { left: clamp(left, 4, caixa.w - tip.w - 4), top: clamp(top, 4, caixa.h - tip.h - 4) };
}

/** Quantos caracteres cabem no rótulo sem invadir a pílula da contagem. */
export function maxCharsRotulo(w: number, nTxt: string): number {
  const pill = larguraPilula(nTxt);
  return Math.max(4, Math.floor((w - pill - 8 - 12 - 4) / 7.2));
}
export function larguraPilula(nTxt: string): number {
  return Math.max(26, nTxt.length * 7 + 12);
}

export const chaveAresta = (a: { de: string; para: string }) => `${a.de}>${a.para}`;

/** Nós e arestas no caminho do nó: tudo que ele alcança para frente e para trás. */
export function caminhoDe(id: string, arestas: Aresta[]): { nos: Set<string>; arestas: Set<string> } {
  const nos = new Set([id]);
  const es = new Set<string>();
  const varrer = (sentido: "frente" | "tras") => {
    const fila = [id];
    const visto = new Set([id]);
    while (fila.length) {
      const atual = fila.shift()!;
      for (const a of arestas) {
        const de = sentido === "frente" ? a.de : a.para;
        const para = sentido === "frente" ? a.para : a.de;
        if (de !== atual) continue;
        es.add(chaveAresta(a));
        nos.add(para);
        if (!visto.has(para)) {
          visto.add(para);
          fila.push(para);
        }
      }
    }
  };
  varrer("frente");
  varrer("tras");
  return { nos, arestas: es };
}

export function ehAgente(c: ColunaWorkflow): boolean {
  return c === "master" || c === "manager" || c === "researcher";
}

/** Filtro dos fluxos para os nós de resultado; nulo quando o nó não filtra fluxos. */
export function filtroFluxos(no: Pick<No, "id" | "coluna"> | undefined): ((seq: string[]) => boolean) | null {
  if (!no || no.coluna !== "resultado") return null;
  const ultimo = (s: string[]) => s[s.length - 1] ?? "";
  switch (no.id) {
    case "aprovado":
      return (s) => ultimo(s) === "resposta:aprovado";
    case "rejeitado":
      return (s) => ultimo(s) === "resposta:rejeitado";
    case "em_aberto":
      return (s) => !ultimo(s).startsWith("resposta");
    default:
      return null;
  }
}

export interface AgenteCom {
  id: string;
  papel: "master" | "manager" | "researcher";
  enviadas: number;
  recebidas: number;
}

export function agentesDaComunicacao(com: Workflows["comunicacao"]): AgenteCom[] {
  const m = new Map<string, AgenteCom>();
  const pega = (id: string) => {
    let a = m.get(id);
    if (!a) {
      const p = papelDoNome(id);
      const novo: AgenteCom = { id, papel: p === "master" ? "master" : p === "researcher" ? "researcher" : "manager", enviadas: 0, recebidas: 0 };
      m.set(id, novo);
      a = novo;
    }
    return a;
  };
  for (const e of com) {
    const de = pega(e.de);
    const para = pega(e.para);
    de.enviadas += e.n;
    para.recebidas += e.n;
  }
  const ordem = { master: 0, manager: 1, researcher: 2 };
  return [...m.values()].sort((a, b) => ordem[a.papel] - ordem[b.papel] || a.id.localeCompare(b.id));
}

export interface ChipFluxo {
  chave: "pedido" | "andamento" | "entrega" | "resposta" | "rejeicao" | "nota";
  rotulo: string;
}

export function chipDoTipo(tipo: string): ChipFluxo {
  const [base, veredito] = tipo.split(":");
  if (base === "resposta") {
    if (veredito === "rejeitado") return { chave: "rejeicao", rotulo: "Rejeitado" };
    if (veredito === "aprovado") return { chave: "resposta", rotulo: "Aprovado" };
    return { chave: "resposta", rotulo: "Resposta" };
  }
  if (base === "pedido" || base === "andamento" || base === "entrega") {
    return { chave: base, rotulo: base[0].toUpperCase() + base.slice(1) };
  }
  return { chave: "nota", rotulo: tipo };
}
