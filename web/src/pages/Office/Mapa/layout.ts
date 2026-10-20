import type { Agente, Tarefa } from "../../../api/tipos";
import type { SubAgente } from "../../../api/tipos";
import { ordenarSubs, subsDe } from "../subagentes";
import { tarefasAbertasDe } from "./dados";

export const L = {
  larg: 248,
  largMaster: 312,
  alt: 118,
  altMaster: 142,
  gapX: 28,
  gapFila: 76,
  pad: 44,
  topo: 64,
  tarefaAlt: 52,
  tarefaGap: 8,
  tarefaIndent: 14,
  maxTarefas: 3,
  maisAlt: 22,
  subW: 176,
  subAlt: 92,
  subGap: 8,
  /** faixa dos conectores entre o card do pai e a coluna de sub-cards */
  subGapX: 30,
  maxSubs: 4,
} as const;

/** Sub-agents que cabem sob o pai (rodando primeiro) e quantos viram "+N". */
export function recortarSubs(subs: SubAgente[]): { mostradas: SubAgente[]; extra: number } {
  const ord = ordenarSubs(subs);
  return { mostradas: ord.slice(0, L.maxSubs), extra: Math.max(0, ord.length - L.maxSubs) };
}

/** Altura do bloco de sub-cards (0 sem sub-agents). */
export function alturaSubs(mostradas: number, extra: number): number {
  if (mostradas === 0) return 0;
  return 8 + mostradas * (L.subAlt + L.subGap) + (extra > 0 ? L.maisAlt : 0);
}

export interface NoMapa {
  agente: Agente;
  x: number;
  y: number;
  w: number;
  h: number;
  /** largura ocupada na fila: card + coluna de sub-cards, quando há */
  largTotal: number;
  subs: SubAgente[];
  subsExtra: number;
  tarefas: Tarefa[];
  /** quantas tarefas cabem; o resto vira "+N" */
  visiveis: number;
  /** altura do bloco pendurado (0 sem tarefas) */
  pendurado: number;
}

export interface Ligacao {
  d: string;
  de: string;
  para: string;
}

export interface LayoutMapa {
  nos: NoMapa[];
  ligacoes: Ligacao[];
  largura: number;
  altura: number;
}

function alturaPendurada(n: number): { visiveis: number; h: number } {
  if (n === 0) return { visiveis: 0, h: 0 };
  const visiveis = Math.min(n, L.maxTarefas);
  const h = 12 + visiveis * (L.tarefaAlt + L.tarefaGap) + (n > visiveis ? L.maisAlt : 0);
  return { visiveis, h };
}

/** Caminho em ângulo reto com cantos arredondados. */
export function caminho(brutos: [number, number][], r = 10): string {
  const pontos = brutos.filter((p, i) => i === 0 || p[0] !== brutos[i - 1][0] || p[1] !== brutos[i - 1][1]);
  if (pontos.length < 2) return "";
  let d = `M ${pontos[0][0]} ${pontos[0][1]}`;
  for (let i = 1; i < pontos.length - 1; i++) {
    const [px, py] = pontos[i - 1];
    const [cx, cy] = pontos[i];
    const [nx, ny] = pontos[i + 1];
    const l1 = Math.hypot(cx - px, cy - py);
    const l2 = Math.hypot(nx - cx, ny - cy);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const ax = cx - ((cx - px) / l1) * rr;
    const ay = cy - ((cy - py) / l1) * rr;
    const bx = cx + ((nx - cx) / l2) * rr;
    const by = cy + ((ny - cy) / l2) * rr;
    d += ` L ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
  }
  const ult = pontos[pontos.length - 1];
  return `${d} L ${ult[0]} ${ult[1]}`;
}

/** Posiciona o organograma: masters no topo, managers e researchers em filas. Tamanho natural, sem escala. */
export function calcularLayout(agentes: Agente[], tarefas: Tarefa[]): LayoutMapa {
  const masters = agentes.filter((a) => a.papel === "master");
  const researchers = agentes.filter((a) => a.papel === "researcher");
  const managers = agentes.filter((a) => a.papel !== "master" && a.papel !== "researcher");
  const filas = [masters, managers, researchers].filter((f) => f.length > 0);

  const medidas = filas.map((fila) =>
    fila.map((agente) => {
      const lista = tarefasAbertasDe(agente.agente, tarefas);
      const { visiveis, h } = alturaPendurada(lista.length);
      const eMaster = agente.papel === "master";
      const { mostradas, extra } = recortarSubs(subsDe(agente));
      const w = eMaster ? L.largMaster : L.larg;
      return {
        agente,
        tarefas: lista,
        visiveis,
        pendurado: Math.max(h, alturaSubs(mostradas.length, extra) > 0 ? alturaSubs(mostradas.length, extra) : 0),
        w,
        h: eMaster ? L.altMaster : L.alt,
        largTotal: mostradas.length > 0 ? w + L.subGapX + L.subW : w,
        subs: mostradas,
        subsExtra: extra,
      };
    }),
  );
  const largFila = medidas.map((f) => f.reduce((s, n) => s + n.largTotal, 0) + (f.length - 1) * L.gapX);
  const largura = Math.max(L.larg, ...largFila) + L.pad * 2;

  const nos: NoMapa[] = [];
  const topoFila: number[] = [];
  const baseFila: number[] = [];
  let y = L.topo;
  medidas.forEach((fila, i) => {
    topoFila.push(y);
    let x = (largura - largFila[i]) / 2;
    let maior = 0;
    for (const m of fila) {
      nos.push({ ...m, x, y });
      x += m.largTotal + L.gapX;
      maior = Math.max(maior, m.h + m.pendurado);
    }
    baseFila.push(y + maior);
    y += maior + L.gapFila;
  });
  const altura = y - L.gapFila + L.pad;

  const ligacoes: Ligacao[] = [];
  const pai = nos.find((n) => n.agente.papel === "master");
  if (pai) {
    const paiX = pai.x + pai.w / 2;
    const paiBase = baseFila[0];
    const idxFilaPai = 0;
    filas.forEach((_, fi) => {
      if (fi === idxFilaPai) return;
      const emFila = nos.filter((n) => n.y === topoFila[fi]);
      const barraY = topoFila[fi] - L.gapFila / 2;
      // researchers com managers no meio contornam pela margem esquerda
      const contorna = fi === 2;
      for (const n of emFila) {
        const cx = n.x + n.w / 2;
        const pts: [number, number][] = contorna
          ? [[pai.x, pai.y + pai.h / 2], [L.pad / 2, pai.y + pai.h / 2], [L.pad / 2, barraY], [cx, barraY], [cx, n.y]]
          : [[paiX, paiBase], [paiX, barraY], [cx, barraY], [cx, n.y]];
        ligacoes.push({ d: caminho(pts), de: pai.agente.agente, para: n.agente.agente });
      }
    });
  }
  return { nos, ligacoes, largura, altura };
}
