import { memo } from "react";
import { caixa, P, pontos, type Biblioteca as Lib } from "./geometria";

const LOMBADAS = ["#10b981", "#34d399", "#6366f1", "#f59e0b", "#60a5fa", "#a78bfa", "#fb7185", "#2dd4bf", "#94a3b8"];

function Prateleiras({ largura, altura, semente }: { largura: number; altura: number; semente: number }) {
  const linhas = 3;
  const alt = altura / linhas;
  const itens: { x: number; y: number; w: number; h: number; c: string }[] = [];
  let s = semente;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let l = 0; l < linhas; l++) {
    let x = 3;
    while (x < largura - 6) {
      const w = 3 + rnd() * 4;
      const h = alt * (0.55 + rnd() * 0.32);
      itens.push({ x, y: (l + 1) * alt - 4 - h, w, h, c: LOMBADAS[Math.floor(rnd() * LOMBADAS.length)] });
      x += w + 0.8;
    }
  }
  return (
    <g>
      <rect x={0} y={0} width={largura} height={altura} fill="#0f0f1a" />
      {itens.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill={b.c} fillOpacity={0.78} />
      ))}
      {Array.from({ length: linhas }, (_, l) => (
        <rect key={l} x={0} y={(l + 1) * alt - 4} width={largura} height={2.4} fill="#2a2a3d" />
      ))}
    </g>
  );
}

/** Ala dos researchers: laje, estantes ao fundo e o letreiro no chão. */
export const BibliotecaCena = memo(function BibliotecaCena({ lib }: { lib: Lib }) {
  const { origem, mundo: w } = lib;
  const cx = (w.x0 + w.x1) / 2, cy = (w.y0 + w.y1) / 2;
  const laje = caixa(cx, cy, w.x1 - w.x0, w.y1 - w.y0, -9, 0);
  const alto = 98;
  const larguraX = w.x1 - w.x0 - 26;
  const larguraY = w.y1 - w.y0 - 26;
  const [ax, ay] = P(w.x0 + 26, w.y0 + 22, alto);
  const [bx, by] = P(w.x0 + 22, w.y0 + 26, alto);
  const estX = caixa((w.x0 + w.x1) / 2 + 13, w.y0 + 11, larguraX, 22, 0, alto);
  const estY = caixa(w.x0 + 11, (w.y0 + w.y1) / 2 + 13, 22, larguraY, 0, alto);
  const [tx, ty] = P(w.x0 + 44, w.y1 - 14);
  return (
    <g transform={`translate(${origem[0]} ${origem[1]})`} data-testid="biblioteca">
      <polygon points={pontos([P(w.x0 - 40, w.y0 - 40, -9), P(w.x1 + 40, w.y0 - 40, -9), P(w.x1 + 40, w.y1 + 40, -9), P(w.x0 - 40, w.y1 + 40, -9)])} fill="#10b981" fillOpacity={0.035} />
      <polygon points={laje.esq} fill="#0d1a17" stroke="#10b981" strokeOpacity={0.4} />
      <polygon points={laje.dir} fill="#08110f" stroke="#10b981" strokeOpacity={0.35} />
      <polygon points={laje.topo} fill="#101c1a" stroke="#10b981" strokeOpacity={0.7} strokeWidth={1.3} />
      <polygon points={laje.topo} fill="url(#hub-tapete)" />
      {/* estante do fundo (plano y) e da lateral (plano x) */}
      <polygon points={estX.dir} fill="#0a0a12" />
      <polygon points={estX.topo} fill="#1a1a28" />
      <g transform={`matrix(0.866 0.5 0 1 ${ax} ${ay})`}>
        <Prateleiras largura={larguraX} altura={alto} semente={7} />
      </g>
      <polygon points={estY.topo} fill="#1a1a28" />
      <g transform={`matrix(-0.866 0.5 0 1 ${bx} ${by})`}>
        <Prateleiras largura={larguraY} altura={alto} semente={19} />
      </g>
      <polygon points={estY.dir} fill="none" stroke="#10b981" strokeOpacity={0.3} />
      <g transform={`matrix(0.866 0.5 -0.866 0.5 ${tx} ${ty})`}>
        <text fontSize={15} fontWeight={700} letterSpacing={5} fill="#34d399" fillOpacity={0.55}>BIBLIOTECA</text>
      </g>
    </g>
  );
});

export const DEFS_BIBLIOTECA = (
  <linearGradient id="hub-tapete" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stopColor="#10b981" stopOpacity="0.14" />
    <stop offset="1" stopColor="#10b981" stopOpacity="0.02" />
  </linearGradient>
);
