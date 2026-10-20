import { useCallback, useMemo, useState } from "react";
import { estiloPapel, ESTILO_STATUS_AGENTE } from "../../../lib/cores";
import { truncar } from "../../../lib/formato";
import type { Agente, Tarefa } from "../../../api/tipos";
import type { PropsModoOffice } from "../tipos";
import { BibliotecaCena, DEFS_BIBLIOTECA } from "./Biblioteca";
import { calcularLayout, ligacao, MATRIZ_CHAO, pontoMaster, rotaEntre, trechoIda, ALTURA_PLATAFORMA, type Ligacao, type Pt } from "./geometria";
import { Mesa } from "./Mesa";
import { CamadaBaloes, CamadaPulsos } from "./Pulsos";
import { DEFS_SALA, SalaFrente, SalaFundo } from "./SalaMaster";
import { usePulsos } from "./usePulsos";
import { useReduzirMovimento } from "../useReduzirMovimento";
import "./hub.css";

const ABERTOS = new Set(["aberto", "em_andamento", "atrasado"]);

function contarTarefas(tarefas: Tarefa[]) {
  let abertos = 0, revisao = 0;
  const atrasados = new Set<string>();
  for (const t of tarefas) {
    if (ABERTOS.has(t.estado)) abertos++;
    if (t.estado === "aguardando_revisao") revisao++;
    if (t.estado === "atrasado") atrasados.add(t.para);
  }
  return { abertos, revisao, atrasados };
}

const MOTES = Array.from({ length: 16 }, (_, i) => ({
  fx: ((i * 37) % 100) / 100,
  fy: ((i * 61 + 13) % 100) / 100,
  r: 1 + (i % 3) * 0.6,
  atraso: -(i * 1.7),
}));

/** Modo Hub: o escritório isométrico, com o master numa sala de vidro e as mesas ao redor. */
export default function Hub({ agentes, tarefas, selecionado, aoSelecionar }: PropsModoOffice) {
  const reduzido = useReduzirMovimento();
  const layout = useMemo(() => calcularLayout(agentes), [agentes]);
  const { abertos, revisao, atrasados } = useMemo(() => contarTarefas(tarefas), [tarefas]);
  const [hover, setHover] = useState<string | null>(null);

  const ligs = useMemo(() => {
    const m = new Map<string, Ligacao>();
    layout.mesas.forEach((p, i) => m.set(p.agente.agente, ligacao(p.agente.agente, p, i)));
    return m;
  }, [layout]);
  const masterNome = layout.master?.agente ?? null;

  const rota = useCallback((de: string, para: string) => rotaEntre(de, para, masterNome, ligs), [masterNome, ligs]);
  const { pulsos, baloes, flashes } = usePulsos(rota, reduzido);

  const ancoras = useMemo(() => {
    const m = new Map<string, Pt>();
    layout.mesas.forEach((p) => m.set(p.agente.agente, [p.x + 20 * p.escala, p.y - 140 * p.escala]));
    if (masterNome) m.set(masterNome, [0, -ALTURA_PLATAFORMA - 212]);
    return m;
  }, [layout, masterNome]);

  const { vb } = layout;
  const tras = layout.mesas.filter((m) => m.y < -20).sort((a, b) => a.y - b.y);
  const frente = layout.mesas.filter((m) => m.y >= -20).sort((a, b) => a.y - b.y);
  const maxRx = Math.max(...layout.aneis.map((a) => a.rx), 300);
  const maxRy = Math.max(...layout.aneis.map((a) => a.ry), 180);

  const desenhar = (m: (typeof layout.mesas)[number]) => (
    <Mesa
      key={m.agente.agente}
      agente={m.agente}
      x={m.x}
      y={m.y}
      escala={m.escala}
      atrasado={atrasados.has(m.agente.agente)}
      selecionado={selecionado === m.agente.agente}
      flash={flashes[m.agente.agente] ?? null}
      aoSelecionar={aoSelecionar}
      aoHover={setHover}
    />
  );

  const alvoTip: Agente | undefined = hover ? agentes.find((a) => a.agente === hover) : undefined;
  const posTip = hover ? (hover === masterNome ? { x: 0, y: -ALTURA_PLATAFORMA, escala: 1 } : layout.mesas.find((m) => m.agente.agente === hover)) : undefined;

  return (
    <svg
      className="hub-svg block select-none"
      width={vb.w}
      height={vb.h}
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      role="group"
      aria-label="Escritório isométrico do time"
      data-testid="hub-svg"
    >
      <defs>
        <radialGradient id="hub-piso">
          <stop offset="0" stopColor="#1b1b3a" stopOpacity="0.75" />
          <stop offset="1" stopColor="#1b1b3a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="hub-fade">
          <stop offset="0.25" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </radialGradient>
        <mask id="hub-mascara-grid">
          <ellipse cx={0} cy={20} rx={maxRx + 260} ry={maxRy + 190} fill="url(#hub-fade)" />
        </mask>
        <pattern id="hub-grid" width={64} height={64} patternUnits="userSpaceOnUse" patternTransform={MATRIZ_CHAO}>
          <path d="M64 0H0V64" fill="none" stroke="#818cf8" strokeOpacity={0.2} strokeWidth={0.9} />
        </pattern>
        {DEFS_SALA}
        {DEFS_BIBLIOTECA}
      </defs>

      <ellipse cx={0} cy={20} rx={maxRx + 260} ry={maxRy + 190} fill="url(#hub-piso)" />
      <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="url(#hub-grid)" mask="url(#hub-mascara-grid)" />
      {layout.aneis.map((a, i) => (
        <ellipse key={i} cx={0} cy={0} rx={a.rx} ry={a.ry} fill="none" stroke="#6366f1" strokeOpacity={0.14} strokeWidth={1.2} strokeDasharray="2 10" />
      ))}
      {!reduzido && (
        <g aria-hidden="true">
          {MOTES.map((m, i) => (
            <circle key={i} cx={vb.x + m.fx * vb.w} cy={vb.y + m.fy * vb.h} r={m.r} fill="#a5b4fc" fillOpacity={0.35} className="hub-deriva" style={{ animationDelay: `${m.atraso}s` }} />
          ))}
        </g>
      )}

      {/* linhas de conexão do master para cada mesa */}
      <g fill="none" aria-hidden="true" data-testid="linhas">
        {[...ligs.values()].map((l) => {
          const ag = agentes.find((a) => a.agente === l.agente);
          const cor = estiloPapel(ag?.papel ?? "manager").hex;
          const off = ag?.status === "offline";
          const d = trechoIda(l);
          return (
            <g key={l.agente} opacity={off ? 0.4 : 1}>
              <path d={d} stroke={cor} strokeOpacity={0.07} strokeWidth={7} strokeLinecap="round" />
              <path d={d} stroke={cor} strokeOpacity={0.38} strokeWidth={1.2} strokeLinecap="round" />
              {ag?.status === "trabalhando" && <path d={d} stroke="#a7f3d0" strokeOpacity={0.55} strokeWidth={1.6} strokeDasharray="4 24" strokeLinecap="round" className="hub-fluxo" />}
              <circle cx={l.b[0]} cy={l.b[1]} r={3} fill={cor} fillOpacity={0.6} />
            </g>
          );
        })}
      </g>

      <SalaFundo />
      {layout.biblioteca && <BibliotecaCena lib={layout.biblioteca} />}
      {tras.map(desenhar)}
      {layout.master ? (
        <Mesa
          agente={layout.master}
          x={0}
          y={pontoMaster()[1]}
          escala={1}
          mestre
          atrasado={atrasados.has(layout.master.agente)}
          selecionado={selecionado === layout.master.agente}
          flash={flashes[layout.master.agente] ?? null}
          aoSelecionar={aoSelecionar}
          aoHover={setHover}
        />
      ) : (
        <text x={0} y={-ALTURA_PLATAFORMA} textAnchor="middle" fontSize={13} fill="#6b7280">sem master cadastrado</text>
      )}
      <SalaFrente abertos={abertos} revisao={revisao} />
      {frente.map(desenhar)}

      <CamadaPulsos pulsos={pulsos} reduzido={reduzido} />
      <CamadaBaloes baloes={Object.values(baloes)} ancoras={ancoras} />

      {alvoTip && posTip && (
        <g transform={`translate(${posTip.x} ${posTip.y - 150 * posTip.escala})`} pointerEvents="none" data-testid="tooltip-mesa">
          <rect x={-92} y={-50} width={184} height={alvoTip.tarefa_atual ? 50 : 38} rx={8} fill="#2a2a3d" fillOpacity={0.97} stroke="#363650" />
          <text x={0} y={-33} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="#e4e4ed">{truncar(alvoTip.agente, 28)}</text>
          <text x={0} y={-18} textAnchor="middle" fontSize={11} fill="#9ca3af">
            {ESTILO_STATUS_AGENTE[alvoTip.status]?.rotulo ?? alvoTip.status}
            {alvoTip.pendentes > 0 ? ` · ${alvoTip.pendentes} pend.` : ""}
          </text>
          {alvoTip.tarefa_atual && <text x={0} y={-3} textAnchor="middle" fontSize={10} fill="#818cf8">{truncar(alvoTip.tarefa_atual.assunto, 30)}</text>}
        </g>
      )}
    </svg>
  );
}
