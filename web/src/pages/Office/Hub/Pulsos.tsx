import { memo, useCallback } from "react";
import { truncar } from "../../../lib/formato";
import type { Pt } from "./geometria";
import type { Balao, Pulso } from "./usePulsos";

const CAUDA: ReadonlyArray<{ r: number; o: number; atraso: number }> = [
  { r: 4.6, o: 1, atraso: 0 },
  { r: 3.6, o: 0.55, atraso: 0.07 },
  { r: 2.6, o: 0.32, atraso: 0.14 },
  { r: 1.8, o: 0.18, atraso: 0.21 },
];

type ElAnim = SVGElement & { beginElementAt?: (t: number) => void };

function PulsoSvg({ p, reduzido }: { p: Pulso; reduzido: boolean }) {
  const iniciar = useCallback(
    (g: SVGGElement | null) => {
      if (!g || reduzido) return;
      // SMIL só começa quando mandamos: assim o pulso nasce sempre no início do caminho
      g.querySelectorAll<ElAnim>("[data-anim]").forEach((el) => el.beginElementAt?.(Number(el.dataset.atraso ?? 0)));
    },
    [reduzido],
  );

  if (reduzido) {
    return (
      <ellipse cx={p.fim[0]} cy={p.fim[1]} rx={26} ry={13} fill="none" stroke={p.cor} strokeWidth={2} className="hub-chegada" data-testid="pulso" data-tipo={p.tipo} />
    );
  }
  const partes = p.pasta ? CAUDA.slice(0, 2) : CAUDA;
  return (
    <g ref={iniciar} data-testid="pulso" data-tipo={p.tipo} className="hub-pulso" style={{ ["--dur" as string]: `${p.dur + 0.35}s` }} pointerEvents="none">
      {partes.map((c, i) => (
        <g key={i} visibility="hidden">
          <set data-anim="" data-atraso={c.atraso} attributeName="visibility" to="visible" begin="indefinite" fill="freeze" />
          <animateMotion data-anim="" data-atraso={c.atraso} path={p.d} dur={`${p.dur}s`} begin="indefinite" fill="freeze" calcMode="linear" />
          <circle r={c.r * 2.8} fill={p.cor} fillOpacity={0.16 * c.o} />
          <circle r={c.r} fill={p.cor} fillOpacity={c.o} />
          {i === 0 && !p.pasta && <circle r={1.7} fill="#fff" />}
        </g>
      ))}
      {p.pasta && (
        <g visibility="hidden">
          <set data-anim="" data-atraso={0} attributeName="visibility" to="visible" begin="indefinite" fill="freeze" />
          <animateMotion data-anim="" data-atraso={0} path={p.d} dur={`${p.dur}s`} begin="indefinite" fill="freeze" calcMode="linear" />
          <g transform="translate(0 -9)" data-testid="pasta">
            <circle r={13} fill={p.cor} fillOpacity={0.22} cy={4} />
            <path d="M-8 -4 h5 l2 2.2 h9 v10.5 h-16 z" fill="#fcd34d" stroke="#fffbeb" strokeWidth={0.8} strokeLinejoin="round" />
            <path d="M-8 -1 h16" stroke="#b45309" strokeWidth={0.8} />
          </g>
        </g>
      )}
      <ellipse cx={p.fim[0]} cy={p.fim[1]} rx={26} ry={13} fill="none" stroke={p.cor} strokeWidth={2} className="hub-chegada" style={{ animationDelay: `${p.dur}s` }} />
    </g>
  );
}

export const CamadaPulsos = memo(function CamadaPulsos({ pulsos, reduzido }: { pulsos: Pulso[]; reduzido: boolean }) {
  return (
    <g aria-hidden="true">
      {pulsos.map((p) => (
        <PulsoSvg key={p.id} p={p} reduzido={reduzido} />
      ))}
    </g>
  );
});

export const CamadaBaloes = memo(function CamadaBaloes({ baloes, ancoras }: { baloes: Balao[]; ancoras: Map<string, Pt> }) {
  return (
    <g pointerEvents="none">
      {baloes.map((b) => {
        const a = ancoras.get(b.agente);
        if (!a) return null;
        const txt = truncar(b.texto, 34);
        const w = Math.max(70, txt.length * 5.9 + 26);
        return (
          <g key={b.id} transform={`translate(${a[0]} ${a[1]})`} data-testid="balao-fala">
            <g className="hub-balao-fala">
              <rect x={-w / 2} y={-28} width={w} height={28} rx={8} fill="#0c0c14" fillOpacity={0.95} stroke={b.cor} strokeWidth={1.2} />
              <path d="M-6 -0.6 L0 8 L6 -0.6 Z" fill="#0c0c14" stroke={b.cor} strokeWidth={1.2} strokeLinejoin="round" />
              <path d="M-5 -1.4 L5 -1.4" stroke="#0c0c14" strokeWidth={2.4} />
              <circle cx={-w / 2 + 14} cy={-14} r={3} fill={b.cor} />
              <text x={-w / 2 + 22} y={-10} fontSize={11} fill="#e4e4ed" fontWeight={500}>{txt}</text>
            </g>
          </g>
        );
      })}
    </g>
  );
});
