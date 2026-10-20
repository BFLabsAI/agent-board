/** Geometria do Prédio: um andar por Workspace, empilhados; em cada andar, as salas dos squads em fila. Puro, sem React. */
import { ALTURA_PAREDE, ALTURA_PLACA, ESPESSURA_LAJE, dimensaoSala, type DimSala } from "../Andar/layout";

/** largura da placa do andar (coluna da esquerda) */
export const LARGURA_PLACA = 900;
/** altura mínima do andar (a placa precisa caber) */
export const ALTURA_MIN_PISO = 500;
export const ESPESSURA_PISO = 22;
export const GAP_PISOS = 40;
const PAD = 24;
const GAP_X = 50;
const GAP_Y = 6;
const MAX_COLS = 3;

export interface EntradaPiso {
  /** squads (salas) do andar; 0 para offline, carregando ou vazio */
  salas: number;
  /** maior número de agentes além do master entre as salas */
  maxOutros: number;
}

export interface PosPiso {
  /** canto superior esquerdo do andar no desenho */
  x: number;
  y: number;
  h: number;
  cols: number;
  /** centro do piso de cada sala, relativo ao topo-esquerdo do andar */
  salas: Array<{ x: number; y: number }>;
}

export interface LayoutPredio {
  dim: DimSala;
  /** largura de cada andar */
  largura: number;
  /** andares lado a lado (1 = o prédio empilhado) */
  colunas: number;
  w: number;
  h: number;
  pisos: PosPiso[];
}

export function colunasPiso(n: number): number {
  if (n <= 3) return Math.max(1, n);
  if (n === 4) return 2;
  return MAX_COLS;
}

/** Andares empilhados (colunas = 1) ou em grade, quando a tela larga aproveita melhor. */
export function layoutPredio(entradas: EntradaPiso[], colunas = 1): LayoutPredio {
  const dim = dimensaoSala(Math.max(0, ...entradas.map((e) => e.maxOutros)));
  const slotW = 2 * dim.a + 40;
  const topo = ALTURA_PAREDE + 24;
  const slotH = topo + 2 * dim.b + ESPESSURA_LAJE + ALTURA_PLACA;
  const maxCols = Math.max(1, ...entradas.map((e) => colunasPiso(e.salas)));
  const largura = LARGURA_PLACA + PAD + maxCols * slotW + (maxCols - 1) * GAP_X + PAD;
  const cols = Math.max(1, Math.min(colunas, entradas.length));
  const GAP_COL = 90;
  const alturas = entradas.map((e) => {
    const c = colunasPiso(e.salas);
    const linhas = Math.ceil(e.salas / c);
    return e.salas === 0 ? ALTURA_MIN_PISO : Math.max(ALTURA_MIN_PISO, 2 * PAD + linhas * slotH + (linhas - 1) * GAP_Y);
  });
  // altura de cada linha de andares = a do mais alto
  const linhasPisos = Math.ceil(entradas.length / cols);
  const altLinha = Array.from({ length: linhasPisos }, (_, l) => Math.max(...alturas.slice(l * cols, l * cols + cols)));
  const yLinha: number[] = [];
  let y = 0;
  for (const a of altLinha) {
    yLinha.push(y);
    y += a + ESPESSURA_PISO + GAP_PISOS;
  }
  const pisos = entradas.map((e, i): PosPiso => {
    const c = colunasPiso(e.salas);
    const linhas = Math.ceil(e.salas / c);
    const l = Math.floor(i / cols);
    const h = cols === 1 ? alturas[i] : altLinha[l];
    const salas = Array.from({ length: e.salas }, (_, k) => {
      const ln = Math.floor(k / c);
      const col = k - ln * c;
      return {
        x: LARGURA_PLACA + PAD + col * (slotW + GAP_X) + slotW / 2,
        y: (h - (linhas * slotH + (linhas - 1) * GAP_Y)) / 2 + ln * (slotH + GAP_Y) + topo + dim.b,
      };
    });
    return { x: (i % cols) * (largura + GAP_COL), y: yLinha[l], h, cols: c, salas };
  });
  return { dim, largura, colunas: cols, w: cols * largura + (cols - 1) * GAP_COL, h: Math.max(0, y - GAP_PISOS), pisos };
}
