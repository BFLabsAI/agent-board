import { useMemo, useState } from "react";
import { formatarNumero } from "../../lib/formato";
import { Card } from "../../components/ui";
import type { Analytics } from "../../api/tipos";
import { diaLongo } from "./graficos";
import { montarHeatmap } from "./calculos";

const CEL = 12;
const GAP = 3;
const PASSO = CEL + GAP;
const ESQ = 30;
const TOPO = 18;
const NIVEIS = ["#1f1f30", "rgba(99,102,241,0.30)", "rgba(99,102,241,0.55)", "rgba(129,140,248,0.80)", "#a5b4fc"] as const;
const DIAS = ["Dom", "", "Ter", "", "Qui", "", "Sáb"];

export function Heatmap({ dados }: { dados: Analytics["heatmap"] }) {
  const { celulas, colunas, meses } = useMemo(() => montarHeatmap(dados), [dados]);
  const [dica, setDica] = useState<{ x: number; y: number; dia: string; n: number } | null>(null);
  const largura = ESQ + colunas * PASSO;
  const altura = TOPO + 7 * PASSO;

  return (
    <Card className="flex min-w-0 flex-col">
      <h3 className="mb-4 text-base font-semibold text-texto">Atividade nas últimas 52 semanas</h3>
      {celulas.length === 0 ? (
        <p className="py-10 text-center text-sm text-texto-fraco">Sem mensagens no histórico.</p>
      ) : (
        <div className="relative my-auto">
          <svg
            viewBox={`0 0 ${largura} ${altura}`}
            className="w-full"
            role="img"
            aria-label={`Mapa de calor com ${formatarNumero(celulas.reduce((s, c) => s + c.n, 0))} mensagens em ${celulas.length} dias`}
            onMouseLeave={() => setDica(null)}
          >
            {meses.map((m) => (
              <text key={`${m.col}-${m.rotulo}`} x={ESQ + m.col * PASSO} y={10} fontSize={10} fill="#6b7280">
                {m.rotulo}
              </text>
            ))}
            {DIAS.map((d, i) =>
              d ? (
                <text key={d} x={0} y={TOPO + i * PASSO + CEL - 2} fontSize={10} fill="#6b7280">
                  {d}
                </text>
              ) : null,
            )}
            {celulas.map((c) => (
              <rect
                key={c.dia}
                data-testid="celula-heat"
                data-dia={c.dia}
                data-n={c.n}
                data-nivel={c.nivel}
                x={ESQ + c.col * PASSO}
                y={TOPO + c.linha * PASSO}
                width={CEL}
                height={CEL}
                rx={3}
                fill={NIVEIS[c.nivel]}
                stroke={c.nivel === 0 ? "#2a2a3d" : "none"}
                strokeWidth={0.5}
                className="cursor-default transition-opacity hover:opacity-70"
                onMouseEnter={() => setDica({ x: ESQ + c.col * PASSO + CEL / 2, y: TOPO + c.linha * PASSO, dia: c.dia, n: c.n })}
              />
            ))}
          </svg>
          {dica && (
            <div
              role="tooltip"
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border-light bg-surface-5 px-2.5 py-1.5 text-xs shadow-lg"
              style={{ left: `${(dica.x / largura) * 100}%`, top: `${(dica.y / altura) * 100}%`, marginTop: -4 }}
            >
              <span className="text-texto-suave">{diaLongo(dica.dia)}</span>
              <span className="ml-2 font-mono font-medium text-texto">
                {formatarNumero(dica.n)} {dica.n === 1 ? "mensagem" : "mensagens"}
              </span>
            </div>
          )}
          <div className="mt-3 flex items-center gap-1.5 text-xs text-texto-fraco">
            <span>Menos</span>
            {NIVEIS.map((cor, i) => (
              <span key={i} className="h-3 w-3 rounded-[3px] border border-border/60" style={{ background: cor }} />
            ))}
            <span>Mais</span>
          </div>
        </div>
      )}
    </Card>
  );
}
