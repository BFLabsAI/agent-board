/** Geometria do Andar: uma sala isométrica por squad, em grade. Puro, sem React. */
import type { Agente } from "../../../api/tipos";
import { pontos, type PosMesa, type Pt } from "../Hub/geometria";

export const ALTURA_PAREDE = 46;
export const ESPESSURA_LAJE = 14;
const ALTURA_PLACA = 128;
const GAP_X = 70;
const GAP_Y = 10;

export interface DimSala {
  /** meia-largura e meia-altura do losango do piso */
  a: number;
  b: number;
}

export interface LayoutSala {
  master: Agente | null;
  mesas: PosMesa[];
}

const RING_1 = { rx: 270, ry: 162 };
const RING_2 = { rx: 460, ry: 276 };

function escalaSala(outros: number): number {
  if (outros <= 6) return 0.85;
  if (outros <= 12) return 0.72;
  return 0.62;
}

/** Master no centro; managers e researchers em anéis ao redor (até 7 no interno). */
export function layoutSala(agentes: Agente[]): LayoutSala {
  const master = agentes.find((a) => a.papel === "master") ?? null;
  const outros = agentes
    .filter((a) => a !== master)
    .sort((a, b) => Number(a.papel === "researcher") - Number(b.papel === "researcher") || a.agente.localeCompare(b.agente));
  const escala = escalaSala(outros.length);
  const interno = outros.length > 7 ? 6 : outros.length;
  const mesas: PosMesa[] = [];
  const colocar = (lista: Agente[], ring: { rx: number; ry: number }, fase: number) => {
    lista.forEach((a, i) => {
      // número ímpar: gira meia fatia para nenhuma mesa cair atrás do quadro do master
      const ajuste = lista.length % 2 === 1 ? -180 / lista.length : 0;
      const phi = ((90 + fase + ajuste + ((i + 0.5) * 360) / lista.length) * Math.PI) / 180;
      mesas.push({ agente: a, x: Math.cos(phi) * ring.rx, y: Math.sin(phi) * ring.ry, escala, ala: "anel" });
    });
  };
  colocar(outros.slice(0, interno), RING_1, 0);
  const externo = outros.slice(interno);
  colocar(externo, RING_2, externo.length ? 360 / externo.length / 2 : 0);
  return { master, mesas };
}

/** Piso grande o bastante para o maior anel entre as salas (todas as salas têm o mesmo tamanho). */
export function dimensaoSala(maxOutros: number): DimSala {
  const ring = maxOutros > 7 ? RING_2 : RING_1;
  const a = Math.round(Math.SQRT2 * (ring.rx + 62));
  const b = Math.max(Math.round(a / 1.732), Math.round(Math.SQRT2 * (ring.ry + 52)));
  return { a, b };
}

export function colunasPara(n: number): number {
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  return 4;
}

export interface PosSala {
  /** origem da sala (centro do piso) no desenho */
  x: number;
  y: number;
}

export interface LayoutAndar {
  cols: number;
  dim: DimSala;
  salas: PosSala[];
  w: number;
  h: number;
}

/** Grade de salas; a última linha incompleta fica centralizada. */
export function layoutAndar(maxOutrosPorSala: number[]): LayoutAndar {
  const n = maxOutrosPorSala.length;
  const dim = dimensaoSala(Math.max(0, ...maxOutrosPorSala));
  const cols = colunasPara(n);
  const slotW = 2 * dim.a + 40;
  const topo = ALTURA_PAREDE + 24;
  const slotH = topo + 2 * dim.b + ESPESSURA_LAJE + ALTURA_PLACA;
  const pad = 40;
  const linhas = Math.max(1, Math.ceil(n / cols));
  const w = cols * slotW + (cols - 1) * GAP_X + 2 * pad;
  const h = linhas * slotH + (linhas - 1) * GAP_Y + 2 * pad;
  const salas: PosSala[] = [];
  for (let i = 0; i < n; i++) {
    const l = Math.floor(i / cols);
    const naLinha = Math.min(cols, n - l * cols);
    const c = i - l * cols;
    const larg = naLinha * slotW + (naLinha - 1) * GAP_X;
    const x0 = pad + (w - 2 * pad - larg) / 2;
    salas.push({ x: x0 + c * (slotW + GAP_X) + slotW / 2, y: pad + l * (slotH + GAP_Y) + topo + dim.b });
  }
  return { cols, dim, salas, w, h };
}

export interface GeoPiso {
  topo: string;
  laje: string;
  lajeEsq: string;
  lajeDir: string;
  paredeEsq: string;
  paredeDir: string;
  arestaEsq: [Pt, Pt];
  arestaDir: [Pt, Pt];
}

/** Polígonos do piso em losango, da laje e das duas paredes baixas do fundo. */
export function geoPiso({ a, b }: DimSala): GeoPiso {
  const T: Pt = [0, -b], R: Pt = [a, 0], B: Pt = [0, b], L: Pt = [-a, 0];
  const up = (p: Pt, z: number): Pt => [p[0], p[1] - z];
  const dn = (p: Pt, z: number): Pt => [p[0], p[1] + z];
  return {
    topo: pontos([T, R, B, L]),
    laje: pontos([L, B, R, dn(R, ESPESSURA_LAJE), dn(B, ESPESSURA_LAJE), dn(L, ESPESSURA_LAJE)]),
    lajeEsq: pontos([L, B, dn(B, ESPESSURA_LAJE), dn(L, ESPESSURA_LAJE)]),
    lajeDir: pontos([B, R, dn(R, ESPESSURA_LAJE), dn(B, ESPESSURA_LAJE)]),
    paredeEsq: pontos([L, T, up(T, ALTURA_PAREDE), up(L, ALTURA_PAREDE)]),
    paredeDir: pontos([T, R, up(R, ALTURA_PAREDE), up(T, ALTURA_PAREDE)]),
    arestaEsq: [up(L, ALTURA_PAREDE), up(T, ALTURA_PAREDE)],
    arestaDir: [up(T, ALTURA_PAREDE), up(R, ALTURA_PAREDE)],
  };
}

