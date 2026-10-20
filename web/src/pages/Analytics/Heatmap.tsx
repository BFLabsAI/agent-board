import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatarNumero } from "../../lib/formato";
import { Card } from "../../components/ui";
import type { Analytics } from "../../api/tipos";
import { diaLongo } from "./graficos";
import { GAP_HEAT, janelaHeatmap, montarHeatmap } from "./calculos";

const ESQ = 34;
const TOPO = 20;
const FONTE = 11;
const LARGURA_PADRAO = 640;
const NIVEIS = ["#1f1f30", "rgba(99,102,241,0.30)", "rgba(99,102,241,0.55)", "rgba(129,140,248,0.80)", "#a5b4fc"] as const;
const DIAS = ["Dom", "", "Ter", "", "Qui", "", "Sáb"];

/** Largura do elemento, acompanhando o redimensionamento (ResizeObserver). */
function useLarguraEl() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState<number>(LARGURA_PADRAO);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ler = () => {
      const n = el.clientWidth;
      if (n > 0) setW(n);
    };
    ler();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(ler);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function Heatmap({ dados }: { dados: Analytics["heatmap"] }) {
  const todo = useMemo(() => montarHeatmap(dados), [dados]);
  const [medidor, largura] = useLarguraEl();
  const janela = useMemo(() => janelaHeatmap(todo.celulas, todo.colunas, largura - ESQ), [todo, largura]);
  const { inicio, visiveis, cel: CEL, rola } = janela;
  const PASSO = CEL + GAP_HEAT;
  const celulas = useMemo(() => todo.celulas.filter((c) => c.col >= inicio).map((c) => ({ ...c, col: c.col - inicio })), [todo, inicio]);
  const meses = useMemo(() => todo.meses.filter((m) => m.col >= inicio).map((m) => ({ ...m, col: m.col - inicio })), [todo, inicio]);
  const [dica, setDica] = useState<{ x: number; y: number; dia: string; n: number } | null>(null);
  const larguraSvg = ESQ + visiveis * PASSO - GAP_HEAT;
  const altura = TOPO + 7 * PASSO;
  const rolagem = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rolagem.current;
    if (el && rola) el.scrollLeft = el.scrollWidth;
  }, [rola, larguraSvg]);

  return (
    <Card className="flex min-w-0 flex-col">
      <h3 className="mb-4 text-base font-semibold text-texto">Atividade nas últimas {visiveis} {visiveis === 1 ? "semana" : "semanas"}</h3>
      {celulas.length === 0 ? (
        <p className="py-10 text-center text-sm text-texto-fraco">Sem mensagens no histórico.</p>
      ) : (
        <div ref={medidor} className="relative my-auto">
          <div ref={rolagem} className={rola ? "barra-x overflow-x-auto pb-2" : undefined}>
          <svg
            width={larguraSvg}
            height={altura}
            className="block max-w-none"
            role="img"
            aria-label={`Mapa de calor com ${formatarNumero(celulas.reduce((s, c) => s + c.n, 0))} mensagens em ${celulas.length} dias`}
            onMouseLeave={() => setDica(null)}
          >
            {meses.map((m) => (
              <text key={`${m.col}-${m.rotulo}`} x={ESQ + m.col * PASSO} y={12} fontSize={FONTE} fill="#9ca3af">
                {m.rotulo}
              </text>
            ))}
            {DIAS.map((d, i) =>
              d ? (
                <text key={d} x={0} y={TOPO + i * PASSO + CEL - 1} fontSize={FONTE} fill="#9ca3af">
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
                rx={CEL >= 13 ? 3 : 2}
                fill={NIVEIS[c.nivel]}
                stroke={c.nivel === 0 ? "#2a2a3d" : "none"}
                strokeWidth={0.5}
                className="cursor-default transition-opacity hover:opacity-70"
                onMouseEnter={() => setDica({ x: ESQ + c.col * PASSO + CEL / 2, y: TOPO + c.linha * PASSO, dia: c.dia, n: c.n })}
              />
            ))}
          </svg>
          </div>
          {dica && (
            <div
              role="tooltip"
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border-light bg-surface-5 px-2.5 py-1.5 text-xs shadow-lg"
              style={{ left: dica.x - (rola ? (rolagem.current?.scrollLeft ?? 0) : 0), top: dica.y, marginTop: -4 }}
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
