import type { ColunaWorkflow, Workflows } from "../../api/tipos";
import { papelDoNome } from "../../lib/formato";

export type No = Workflows["nos"][number];
export type Aresta = Workflows["arestas"][number];

export const ID_MAIS = "__mais";
export const MAX_ISSUES = 8;

export const COLUNAS_GRAFO = [
  { titulo: "MASTER", colunas: ["master"] },
  { titulo: "MANAGERS / RESEARCHERS", colunas: ["manager", "researcher"] },
  { titulo: "ISSUES", colunas: ["issue"] },
  { titulo: "REVISÃO", colunas: ["revisao"] },
  { titulo: "RESULTADO", colunas: ["resultado"] },
] as const satisfies ReadonlyArray<{ titulo: string; colunas: ReadonlyArray<ColunaWorkflow> }>;

export function indiceColuna(c: ColunaWorkflow): number {
  return COLUNAS_GRAFO.findIndex((g) => (g.colunas as ReadonlyArray<string>).includes(c));
}

/** Colunas do fluxo principal. Sub-agents ficam numa faixa própria abaixo do grafo, fora das colunas. */
export function colunasDoGrafo(): typeof COLUNAS_GRAFO[number][] {
  return [...COLUNAS_GRAFO];
}

/** A faixa SUB-AGENTS só aparece se o servidor mandou nós de sub-agent (JSON antigo não tem). */
export function temSubagentes(nos: ReadonlyArray<Pick<No, "coluna">>): boolean {
  return nos.some((n) => n.coluna === "subagente");
}

export const COR_SUBAGENTE = "#f472b6";

export function ehSub(c: ColunaWorkflow): boolean {
  return c === "subagente";
}

/** Sub-agent selecionado: ele e os agentes que o usam (só as arestas diretas). */
export function agentesDoSub(id: string, arestas: Aresta[]): { nos: Set<string>; arestas: Set<string> } {
  const nos = new Set([id]);
  const es = new Set<string>();
  for (const a of arestas) {
    if (a.para !== id) continue;
    nos.add(a.de);
    es.add(chaveAresta(a));
  }
  return { nos, arestas: es };
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
      return COR_SUBAGENTE;
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
export const LARG_SUB = 152;
export const ALT_SUB = 28;
const PASSO = 46;
const PASSO_SUB = 36;
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

export interface Faixa {
  /** topo da faixa SUB-AGENTS */
  y: number;
  h: number;
  /** x onde as pílulas começam (alinhado à coluna dos agentes) */
  x0: number;
}

/** Posição de cada coluna principal, a partir de FOLGA. */
export function xColuna(i: number, total: number = COLUNAS_GRAFO.length): number {
  return FOLGA + i * ((LARGURA - 2 * FOLGA - LARG_NO) / (total - 1));
}

/** Pílulas de sub-agent em linhas sob a coluna dos agentes; ordem por contagem. Função pura. */
export function layoutSubagentes(subs: No[], yTopo: number): { pos: NoPos[]; faixa: Faixa | null; altura: number } {
  if (!subs.length) return { pos: [], faixa: null, altura: yTopo };
  const ordenados = [...subs].sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
  const x0 = xColuna(1);
  const gap = 10;
  const porLinha = Math.max(1, Math.floor((LARGURA - FOLGA - x0 + gap) / (LARG_SUB + gap)));
  const linhas = Math.ceil(ordenados.length / porLinha);
  const cab = 14;
  const pos = ordenados.map((n, i) => ({
    ...n,
    x: x0 + (i % porLinha) * (LARG_SUB + gap),
    y: yTopo + cab + Math.floor(i / porLinha) * PASSO_SUB + (PASSO_SUB - ALT_SUB) / 2,
    w: LARG_SUB,
    h: ALT_SUB,
    cor: corNo(n),
  }));
  const h = cab + linhas * PASSO_SUB + 14;
  return { pos, faixa: { y: yTopo, h, x0 }, altura: yTopo + h };
}

export function layoutGrafo(nos: No[]): { pos: NoPos[]; subPos: NoPos[]; faixa: Faixa | null; alturaGrafo: number; altura: number } {
  const colunas = colunasDoGrafo();
  const cols = colunas.map((g) => nos.filter((n) => (g.colunas as ReadonlyArray<string>).includes(n.coluna)).sort(ordemNo));
  const maior = Math.max(1, ...cols.map((c) => c.length));
  const alturaGrafo = Math.max(ALTURA_MIN, maior * PASSO + TOPO + 40);
  const util = alturaGrafo - TOPO;
  const pos: NoPos[] = [];
  cols.forEach((c, i) => {
    const ini = TOPO + (util - c.length * PASSO) / 2 + (PASSO - ALT_NO) / 2;
    c.forEach((n, j) => pos.push({ ...n, x: xColuna(i, colunas.length), y: ini + j * PASSO, w: LARG_NO, h: ALT_NO, cor: corNo(n) }));
  });
  const sub = layoutSubagentes(nos.filter((n) => n.coluna === "subagente"), alturaGrafo - 8);
  return { pos, subPos: sub.pos, faixa: sub.faixa, alturaGrafo, altura: sub.faixa ? sub.altura : alturaGrafo };
}

/** Total de sub-agents disparados por agente (soma das arestas agente -> sub). */
export function subsPorAgente(arestas: Aresta[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of arestas) if (a.para.startsWith("sub:")) m.set(a.de, (m.get(a.de) ?? 0) + a.n);
  return m;
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
