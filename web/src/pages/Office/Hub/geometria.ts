/** Projeção isométrica (30°) e layout do Hub. Tudo puro, sem React, para testar fácil. */
import type { Agente } from "../../../api/tipos";

export const COS = 0.8660254;
export const SIN = 0.5;
export type Pt = [number, number];

/** Mundo (x, y, z) -> tela. x desce para a direita, y desce para a esquerda, z sobe. */
export const P = (x: number, y: number, z = 0): Pt => [(x - y) * COS, (x + y) * SIN - z];

const r1 = (n: number) => Math.round(n * 10) / 10;
export const pontos = (ps: Pt[]): string => ps.map(([x, y]) => `${r1(x)},${r1(y)}`).join(" ");

export interface Caixa {
  topo: string;
  /** face voltada para baixo-esquerda (y máximo) */
  esq: string;
  /** face voltada para baixo-direita (x máximo) */
  dir: string;
}

/** Caixa isométrica centrada em (cx, cy) do mundo, de z0 a z1. */
export function caixa(cx: number, cy: number, w: number, d: number, z0: number, z1: number): Caixa {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - d / 2, y1 = cy + d / 2;
  return {
    topo: pontos([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)]),
    esq: pontos([P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)]),
    dir: pontos([P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z0)]),
  };
}

/** Matriz SVG do plano do chão (círculo no plano vira elipse isométrica). */
export const MATRIZ_CHAO = `matrix(${COS} ${SIN} ${-COS} ${SIN} 0 0)`;

export const ALTURA_PLATAFORMA = 26;
export const RAIO_PLATAFORMA = 142;

export interface PosMesa {
  agente: Agente;
  x: number;
  y: number;
  escala: number;
  ala: "anel" | "biblioteca";
}

export interface Biblioteca {
  origem: Pt;
  cols: number;
  rows: number;
  /** retângulo da laje em coordenadas de mundo, relativo à origem */
  mundo: { x0: number; x1: number; y0: number; y1: number };
}

export interface LayoutHub {
  centro: Pt;
  master: Agente | null;
  mesas: PosMesa[];
  biblioteca: Biblioteca | null;
  aneis: { rx: number; ry: number }[];
  vb: { x: number; y: number; w: number; h: number };
}

const CELULA_X = 176;
const CELULA_Y = 124;

export function escalaPara(total: number): number {
  if (total <= 6) return 1;
  if (total <= 10) return 0.9;
  if (total <= 14) return 0.8;
  return 0.7;
}

export function calcularLayout(agentes: Agente[]): LayoutHub {
  const centro: Pt = [0, 0];
  const master = agentes.find((a) => a.papel === "master") ?? null;
  const resto = agentes.filter((a) => a !== master);
  const pesquisadores = resto.filter((a) => a.papel === "researcher").sort((a, b) => a.agente.localeCompare(b.agente));
  const gerentes = resto.filter((a) => a.papel !== "researcher").sort((a, b) => a.agente.localeCompare(b.agente));
  const escala = escalaPara(agentes.length);

  const mesas: PosMesa[] = [];
  const aneis: { rx: number; ry: number }[] = [];
  const RX1 = 410, RY1 = 250, RX2 = 660, RY2 = 390;

  const n = gerentes.length;
  const interno = n > 8 ? 7 : n;
  const externo = n - interno;
  const colocar = (lista: Agente[], rx: number, ry: number, fase: number) => {
    if (lista.length === 0) return;
    aneis.push({ rx, ry });
    lista.forEach((a, i) => {
      // número ímpar: gira meia fatia para nenhuma mesa cair atrás do quadro do master
      const ajuste = lista.length % 2 === 1 ? -180 / lista.length : 0;
      const phi = ((90 + fase + ajuste + ((i + 0.5) * 360) / lista.length) * Math.PI) / 180;
      mesas.push({ agente: a, x: Math.cos(phi) * rx, y: Math.sin(phi) * ry, escala, ala: "anel" });
    });
  };
  colocar(gerentes.slice(0, interno), RX1, RY1, 0);
  colocar(gerentes.slice(interno), RX2, RY2, 360 / Math.max(1, externo) / 2);

  let biblioteca: Biblioteca | null = null;
  if (pesquisadores.length > 0) {
    const rows = pesquisadores.length > 2 ? 2 : 1;
    const cols = Math.ceil(pesquisadores.length / rows);
    const rxMax = externo > 0 ? RX2 : RX1;
    const ryMax = externo > 0 ? RY2 : RY1;
    const origem: Pt = [rxMax + 240, -ryMax * 0.7];
    biblioteca = {
      origem, cols, rows,
      mundo: { x0: -100, x1: CELULA_X * (cols - 1) + 100, y0: -78, y1: CELULA_Y * (rows - 1) + 78 },
    };
    pesquisadores.forEach((a, i) => {
      const c = i % cols, l = Math.floor(i / cols);
      const [sx, sy] = P(c * CELULA_X, l * CELULA_Y);
      mesas.push({ agente: a, x: origem[0] + sx, y: origem[1] + sy, escala, ala: "biblioteca" });
    });
  }

  // caixa de enquadramento
  let x0 = -260, x1 = 260, y0 = -290, y1 = 125;
  for (const m of mesas) {
    x0 = Math.min(x0, m.x - 100 * m.escala);
    x1 = Math.max(x1, m.x + 100 * m.escala);
    y0 = Math.min(y0, m.y - 150 * m.escala);
    y1 = Math.max(y1, m.y + 90 * m.escala);
  }
  if (biblioteca) {
    const { origem: o, mundo: w } = biblioteca;
    const cantos = [P(w.x0, w.y0), P(w.x1, w.y0), P(w.x1, w.y1), P(w.x0, w.y1)];
    for (const [cx, cy] of cantos) {
      x0 = Math.min(x0, o[0] + cx - 20); x1 = Math.max(x1, o[0] + cx + 20);
      y0 = Math.min(y0, o[1] + cy - 130); y1 = Math.max(y1, o[1] + cy + 30);
    }
  }
  const pad = 36;
  return { centro, master, mesas, biblioteca, aneis, vb: { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad } };
}

/** Ponto de ligação da mesa (chão, sob a mesa) e do master (centro da plataforma). */
export function pontoMaster(): Pt {
  return [0, -ALTURA_PLATAFORMA];
}

export interface Ligacao {
  agente: string;
  a: Pt; // master
  c: Pt; // controle da curva
  b: Pt; // mesa
}

export function ligacao(agente: string, m: PosMesa, indice: number): Ligacao {
  const a = pontoMaster();
  const b: Pt = [m.x, m.y - 8 * m.escala];
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const lado = indice % 2 === 0 ? 1 : -1;
  const c: Pt = [mx + (-dy / len) * len * 0.1 * lado, my + (dx / len) * len * 0.1 * lado];
  return { agente, a, c, b };
}

const f = (p: Pt) => `${r1(p[0])} ${r1(p[1])}`;
/** Trecho do master até a mesa. */
export const trechoIda = (l: Ligacao) => `M ${f(l.a)} Q ${f(l.c)} ${f(l.b)}`;
/** Trecho da mesa até o master. */
export const trechoVolta = (l: Ligacao) => `M ${f(l.b)} Q ${f(l.c)} ${f(l.a)}`;
export const comprimento = (l: Ligacao) => Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]) * 1.04;

export interface Rota {
  d: string;
  len: number;
  fim: Pt;
}

/** Caminho do pulso entre dois agentes, sempre passando pela sala do master. null se algum não está no mapa. */
export function rotaEntre(de: string, para: string, masterNome: string | null, ligs: Map<string, Ligacao>): Rota | null {
  if (de === para) return null;
  const lde = de === masterNome ? null : (ligs.get(de) ?? undefined);
  const lpara = para === masterNome ? null : (ligs.get(para) ?? undefined);
  if (lde === undefined || lpara === undefined) return null;
  const partes: string[] = [];
  let len = 0;
  let fim: Pt = pontoMaster();
  if (lde) {
    partes.push(trechoVolta(lde));
    len += comprimento(lde);
  }
  if (lpara) {
    const ida = trechoIda(lpara);
    partes.push(lde ? ida.replace(/^M [^Q]+/, "") : ida);
    len += comprimento(lpara);
    fim = lpara.b;
  }
  return { d: partes.join(" "), len, fim };
}
