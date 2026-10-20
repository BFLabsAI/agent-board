import { memo } from "react";
import { ALTURA_PLATAFORMA as ALT, COS, MATRIZ_CHAO, P, RAIO_PLATAFORMA as RP, pontos } from "./geometria";

const RX = RP * COS * Math.SQRT2;
const RY = RP * 0.5 * Math.SQRT2;
const RG = 128; // raio do octógono de vidro
const ALTURA_VIDRO = 88;
const COR = "#f59e0b";

interface Painel {
  i: number;
  tras: boolean;
  poly: string;
  topo: [number, number][];
}

function paineis(): Painel[] {
  const out: Painel[] = [];
  for (let i = 0; i < 8; i++) {
    if (i === 1) continue; // porta, voltada para o espectador
    const a0 = ((i * 45 - 22.5) * Math.PI) / 180;
    const a1 = ((i * 45 + 22.5) * Math.PI) / 180;
    const [x0, y0, x1, y1] = [RG * Math.cos(a0), RG * Math.sin(a0), RG * Math.cos(a1), RG * Math.sin(a1)];
    const topo: [number, number][] = [P(x0, y0, ALT + ALTURA_VIDRO), P(x1, y1, ALT + ALTURA_VIDRO)];
    out.push({
      i,
      tras: (x0 + x1 + y0 + y1) / 2 < 0,
      poly: pontos([P(x0, y0, ALT + ALTURA_VIDRO), P(x1, y1, ALT + ALTURA_VIDRO), P(x1, y1, ALT), P(x0, y0, ALT)]),
      topo,
    });
  }
  return out;
}
const PAINEIS = paineis();

const Vidro = ({ p }: { p: Painel }) => (
  <g>
    <polygon points={p.poly} fill="url(#hub-vidro)" stroke="#7dd3fc" strokeOpacity={0.32} strokeWidth={0.9} />
    <line x1={p.topo[0][0]} y1={p.topo[0][1]} x2={p.topo[1][0]} y2={p.topo[1][1]} stroke="#e0f2fe" strokeOpacity={0.7} strokeWidth={1.4} />
  </g>
);

/** Base da sala: brilho, plataforma elevada, anéis girando e as paredes de vidro de trás. */
export const SalaFundo = memo(function SalaFundo() {
  return (
    <g data-testid="sala-master">
      <ellipse cx={0} cy={-ALT * 0.4} rx={RX * 2.1} ry={RY * 2.3} fill="url(#hub-brilho-master)" />
      {/* lateral da plataforma */}
      <path d={`M${-RX} ${-ALT} L${-RX} 0 A${RX} ${RY} 0 0 0 ${RX} 0 L${RX} ${-ALT} A${RX} ${RY} 0 0 1 ${-RX} ${-ALT} Z`} fill="url(#hub-lateral)" stroke={COR} strokeOpacity={0.5} strokeWidth={1} />
      <ellipse cx={0} cy={-ALT} rx={RX} ry={RY} fill="url(#hub-topo-master)" stroke={COR} strokeOpacity={0.85} strokeWidth={1.6} />
      {/* anéis em perspectiva, girando devagar */}
      <g transform={`translate(0 ${-ALT})`}>
        <g transform={MATRIZ_CHAO}>
          <circle r={RP * 0.9} fill="none" stroke={COR} strokeOpacity={0.5} strokeWidth={1.2} />
          <g className="hub-anel-gira">
            <circle r={RP * 0.76} fill="none" stroke="#fde68a" strokeOpacity={0.55} strokeWidth={2.2} strokeDasharray="3 11" />
            <circle r={RP * 0.76} fill="none" stroke={COR} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="60 80" />
          </g>
          <g className="hub-anel-gira-inv">
            <circle r={RP * 0.58} fill="none" stroke="#fbbf24" strokeOpacity={0.6} strokeWidth={1.6} strokeDasharray="30 12 6 12" />
          </g>
          <circle r={RP * 0.34} fill="none" stroke={COR} strokeOpacity={0.35} strokeWidth={1} />
        </g>
      </g>
      {PAINEIS.filter((p) => p.tras).map((p) => (
        <Vidro key={p.i} p={p} />
      ))}
    </g>
  );
});

/** Paredes de vidro da frente (por cima da mesa do master) e o quadro flutuante. */
export const SalaFrente = memo(function SalaFrente({ abertos, revisao }: { abertos: number; revisao: number }) {
  const pontosPoste = PAINEIS.filter((p) => !p.tras);
  return (
    <g>
      {pontosPoste.map((p) => (
        <Vidro key={p.i} p={p} />
      ))}
      <g transform={`translate(0 ${-ALT - ALTURA_VIDRO - 78})`} data-testid="quadro-master">
        <g className="hub-flutua">
          <line x1={-60} y1={34} x2={-90} y2={92} stroke={COR} strokeOpacity={0.25} strokeDasharray="2 4" />
          <line x1={60} y1={34} x2={90} y2={92} stroke={COR} strokeOpacity={0.25} strokeDasharray="2 4" />
          <rect x={-104} y={-32} width={208} height={66} rx={12} fill="#0c0c14" fillOpacity={0.88} stroke={COR} strokeOpacity={0.75} strokeWidth={1.4} />
          <rect x={-104} y={-32} width={208} height={66} rx={12} fill="url(#hub-quadro)" />
          <line x1={0} y1={-20} x2={0} y2={22} stroke={COR} strokeOpacity={0.25} />
          <text x={-52} y={5} textAnchor="middle" fontSize={26} fontWeight={800} fill="#fbbf24" data-testid="quadro-abertos">{abertos}</text>
          <text x={-52} y={21} textAnchor="middle" fontSize={9.5} fill="#cbd5e1" letterSpacing={0.4}>{abertos === 1 ? "pedido aberto" : "pedidos abertos"}</text>
          <text x={52} y={5} textAnchor="middle" fontSize={26} fontWeight={800} fill={revisao > 0 ? "#fcd34d" : "#94a3b8"} data-testid="quadro-revisao">{revisao}</text>
          <text x={52} y={21} textAnchor="middle" fontSize={9.5} fill="#cbd5e1" letterSpacing={0.4}>{revisao === 1 ? "entrega p/ revisar" : "entregas p/ revisar"}</text>
        </g>
      </g>
    </g>
  );
});

export const DEFS_SALA = (
  <>
    <radialGradient id="hub-brilho-master">
      <stop offset="0" stopColor="#f59e0b" stopOpacity="0.28" />
      <stop offset="0.45" stopColor="#f59e0b" stopOpacity="0.08" />
      <stop offset="1" stopColor="#f59e0b" stopOpacity="0" />
    </radialGradient>
    <radialGradient id="hub-topo-master">
      <stop offset="0" stopColor="#3a2a0e" />
      <stop offset="1" stopColor="#15110a" />
    </radialGradient>
    <linearGradient id="hub-lateral" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#4a3410" />
      <stop offset="1" stopColor="#120e07" />
    </linearGradient>
    <linearGradient id="hub-vidro" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#bae6fd" stopOpacity="0.2" />
      <stop offset="1" stopColor="#38bdf8" stopOpacity="0.035" />
    </linearGradient>
    <linearGradient id="hub-quadro" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#f59e0b" stopOpacity="0.16" />
      <stop offset="1" stopColor="#f59e0b" stopOpacity="0" />
    </linearGradient>
  </>
);
