import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Squad } from "../../../api/tipos";
import { truncar } from "../../../lib/formato";
import { ESTILO_SAUDE, subsRodando } from "../../Geral/lib";
import { ALTURA_PLATAFORMA, ligacao, pontoMaster, rotaEntre, trechoIda, type Ligacao, type Pt } from "../Hub/geometria";
import { Mesa } from "../Hub/Mesa";
import { CamadaBaloes, CamadaPulsos } from "../Hub/Pulsos";
import { SalaFrente, SalaFundo } from "../Hub/SalaMaster";
import { usePulsos } from "../Hub/usePulsos";
import { useReduzirMovimento } from "../useReduzirMovimento";
import { estiloPapel } from "../../../lib/cores";
import { geoPiso, layoutSala, type DimSala } from "./layout";

/** Máximo de pulsos em voo por sala (o Hub solo usa 4). */
const MAX_PULSOS_SALA = 2;
export type OrcamentoPulsos = { usados: number; max: number };
const PISCA_MS = 1200;
const NOOP = () => undefined;

const COR_SAUDE = { ok: "#34d399", atencao: "#fbbf24", critico: "#f87171" } as const;

export interface PropsSala {
  squad: Squad;
  dim: DimSala;
  /** nome do agente selecionado deste squad (ou null) */
  selecionado: string | null;
  aoSelecionar: (projeto: string, agente: string) => void;
  aoSelecionarSub: (projeto: string, agente: string, subId: string) => void;
  aoEntrar: (projeto: string) => void;
  /** Prédio: Workspace da sala (filtra os eventos do stream `workspace=*`) */
  workspace?: string;
  /** pulsos simultâneos desta sala (padrão 2; o Prédio usa 1) */
  maxPulsos?: number;
  /** teto de pulsos compartilhado entre as salas do prédio */
  orcamento?: OrcamentoPulsos;
}

/** Texto longo em até `n` linhas de `larg` caracteres (o erro do squad vem do servidor: só texto). */
function quebrar(t: string, larg: number, n: number): string[] {
  const palavras = t.split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    if ((atual + " " + p).trim().length > larg && atual) {
      linhas.push(atual);
      atual = p;
    } else atual = (atual + " " + p).trim();
  }
  if (atual) linhas.push(atual);
  const corte = linhas.slice(0, n);
  if (linhas.length > n) corte[n - 1] = truncar(corte[n - 1] + "…", larg);
  return corte.map((l) => truncar(l, larg));
}

export const Sala = memo(function Sala({ squad, dim, selecionado, aoSelecionar, aoSelecionarSub, aoEntrar, workspace, maxPulsos = MAX_PULSOS_SALA, orcamento }: PropsSala) {
  const reduzido = useReduzirMovimento();
  const { projeto, saude } = squad;
  const cor = COR_SAUDE[saude];
  const geo = useMemo(() => geoPiso(dim), [dim]);
  const lay = useMemo(() => layoutSala(squad.agentes), [squad.agentes]);
  const masterNome = lay.master?.agente ?? null;

  const ligs = useMemo(() => {
    const m = new Map<string, Ligacao>();
    lay.mesas.forEach((p, i) => m.set(p.agente.agente, ligacao(p.agente.agente, p, i)));
    return m;
  }, [lay]);
  const rota = useCallback((de: string, para: string) => rotaEntre(de, para, masterNome, ligs), [masterNome, ligs]);

  // a sala pisca levemente quando chega mensagem do squad
  const [pisca, setPisca] = useState(0);
  const timerPisca = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [piscando, setPiscando] = useState(false);
  const aoMensagem = useCallback(() => {
    setPisca((k) => k + 1);
    setPiscando(true);
    if (timerPisca.current) clearTimeout(timerPisca.current);
    timerPisca.current = setTimeout(() => setPiscando(false), PISCA_MS);
  }, []);
  useEffect(() => () => { if (timerPisca.current) clearTimeout(timerPisca.current); }, []);

  const { pulsos, baloes, flashes } = usePulsos(rota, reduzido, { projeto, workspace, orcamento, maxAtivos: maxPulsos, aoMensagem });

  const ancoras = useMemo(() => {
    const m = new Map<string, Pt>();
    lay.mesas.forEach((p) => m.set(p.agente.agente, [p.x + 20 * p.escala, p.y - 140 * p.escala]));
    if (masterNome) m.set(masterNome, [0, -ALTURA_PLATAFORMA - 212]);
    return m;
  }, [lay, masterNome]);

  const sel = useCallback((nome: string) => aoSelecionar(projeto, nome), [aoSelecionar, projeto]);
  const selSub = useCallback((nome: string, id: string) => aoSelecionarSub(projeto, nome, id), [aoSelecionarSub, projeto]);

  const tras = lay.mesas.filter((m) => m.y < -20).sort((a, b) => a.y - b.y);
  const frente = lay.mesas.filter((m) => m.y >= -20).sort((a, b) => a.y - b.y);
  const desenhar = (m: (typeof lay.mesas)[number]) => (
    <Mesa
      key={m.agente.agente}
      agente={m.agente}
      x={m.x}
      y={m.y}
      escala={m.escala}
      atrasado={false}
      selecionado={selecionado === m.agente.agente}
      flash={flashes[m.agente.agente] ?? null}
      aoSelecionar={sel}
      aoHover={NOOP}
      aoHoverSub={NOOP}
      aoSelecionarSub={selSub}
    />
  );

  const entrar = () => aoEntrar(projeto);
  const teclaPlaca = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      entrar();
    }
  };
  const nome = truncar(projeto, 22);
  const larguraPlaca = Math.max(360, nome.length * 22 + 220);
  const subs = subsRodando(squad.agentes);
  const yPlaca = dim.b + 24;
  const erro = squad.erro;

  return (
    <g data-testid="sala" data-squad={projeto} data-workspace={workspace} data-saude={saude} data-pulsando={piscando || undefined}>
      {/* laje, piso e paredes baixas do fundo */}
      <polygon points={geo.lajeEsq} fill="#0d0d1c" stroke={cor} strokeOpacity={0.35} strokeWidth={1.2} />
      <polygon points={geo.lajeDir} fill="#080813" stroke={cor} strokeOpacity={0.35} strokeWidth={1.2} />
      <polygon points={geo.topo} fill="url(#andar-piso)" />
      <polygon points={geo.topo} fill="url(#andar-grid)" />
      <polygon points={geo.paredeEsq} fill="url(#andar-parede)" stroke={cor} strokeOpacity={0.3} strokeWidth={1} />
      <polygon points={geo.paredeDir} fill="url(#andar-parede)" stroke={cor} strokeOpacity={0.3} strokeWidth={1} />
      <polyline points={[...geo.arestaEsq, geo.arestaDir[1]].map((p) => p.join(",")).join(" ")} fill="none" stroke={cor} strokeOpacity={0.85} strokeWidth={2.4} strokeLinejoin="round" />
      <polygon points={geo.topo} fill="none" stroke={cor} strokeOpacity={0.55} strokeWidth={2} strokeLinejoin="round" />
      {piscando && <polygon key={pisca} points={geo.topo} fill={cor} className="andar-pisca" pointerEvents="none" data-testid="sala-pisca" />}

      {/* linhas do master para cada mesa */}
      <g fill="none" aria-hidden="true">
        {[...ligs.values()].map((l) => {
          const ag = squad.agentes.find((a) => a.agente === l.agente);
          const c = estiloPapel(ag?.papel ?? "manager").hex;
          const d = trechoIda(l);
          return (
            <g key={l.agente} opacity={ag?.status === "offline" ? 0.4 : 1}>
              <path d={d} stroke={c} strokeOpacity={0.07} strokeWidth={7} strokeLinecap="round" />
              <path d={d} stroke={c} strokeOpacity={0.38} strokeWidth={1.2} strokeLinecap="round" />
              {ag?.status === "trabalhando" && <path d={d} stroke="#a7f3d0" strokeOpacity={0.55} strokeWidth={1.6} strokeDasharray="4 24" strokeLinecap="round" className="hub-fluxo" />}
              <circle cx={l.b[0]} cy={l.b[1]} r={3} fill={c} fillOpacity={0.6} />
            </g>
          );
        })}
      </g>

      <SalaFundo />
      {tras.map(desenhar)}
      {lay.master ? (
        <Mesa
          agente={lay.master}
          x={0}
          y={pontoMaster()[1]}
          escala={1}
          mestre
          atrasado={false}
          selecionado={selecionado === lay.master.agente}
          flash={flashes[lay.master.agente] ?? null}
          aoSelecionar={sel}
          aoHover={NOOP}
          aoHoverSub={NOOP}
          aoSelecionarSub={selSub}
        />
      ) : (
        !erro && <text x={0} y={-ALTURA_PLATAFORMA} textAnchor="middle" fontSize={22} fill="#6b7280">sem master cadastrado</text>
      )}
      <SalaFrente abertos={squad.indicadores.abertos} revisao={squad.indicadores.revisao} />
      {frente.map(desenhar)}

      <CamadaPulsos pulsos={pulsos} reduzido={reduzido} />
      <CamadaBaloes baloes={Object.values(baloes)} ancoras={ancoras} />

      {erro && (
        <g data-testid="erro-sala" role="alert" transform={`translate(0 ${dim.b * 0.42})`}>
          <rect x={-310} y={-58} width={620} height={116} rx={14} fill="#2a0e12" fillOpacity={0.94} stroke="#f87171" strokeOpacity={0.7} strokeWidth={1.6} />
          <text x={0} y={-26} textAnchor="middle" fontSize={22} fontWeight={700} fill="#fca5a5">Não foi possível ler este squad</text>
          {quebrar(erro, 52, 3).map((l, i) => (
            <text key={i} x={0} y={4 + i * 24} textAnchor="middle" fontSize={18} fill="#e4e4ed">{l}</text>
          ))}
        </g>
      )}
      {!erro && squad.agentes.length === 0 && (
        <text x={0} y={dim.b * 0.4} textAnchor="middle" fontSize={22} fill="#6b7280" data-testid="sala-vazia">Sem agentes cadastrados</text>
      )}

      {/* placa da sala: nome do squad e selo de saúde; clique entra no squad */}
      <g
        className="andar-placa"
        data-testid="placa-sala"
        data-squad={projeto}
        transform={`translate(0 ${yPlaca})`}
        role="link"
        tabIndex={0}
        aria-label={`Entrar no squad ${projeto}, saúde ${ESTILO_SAUDE[saude].rotulo}`}
        onClick={entrar}
        onKeyDown={teclaPlaca}
      >
        <title>{projeto}</title>
        <rect x={-larguraPlaca / 2} y={0} width={larguraPlaca} height={98} rx={18} fill="#0c0c14" fillOpacity={0.94} stroke={cor} strokeOpacity={0.75} strokeWidth={2} className="andar-placa-caixa" />
        <rect x={-larguraPlaca / 2 + 14} y={0} width={larguraPlaca - 28} height={5} rx={2} fill={cor} fillOpacity={0.8} />
        <text x={0} y={44} textAnchor="middle" fontSize={38} fontWeight={800} fill="#f4f4fb">{nome}</text>
        <g data-testid="selo-sala" data-saude={saude} transform="translate(0 77)">
          <circle cx={-larguraPlaca / 2 + 38} cy={-7} r={9} fill={cor} className={saude !== "ok" ? "hub-luz-pulsa" : undefined} />
          <text x={-larguraPlaca / 2 + 58} y={0} fontSize={23} fontWeight={700} fill={cor}>{ESTILO_SAUDE[saude].rotulo}</text>
          <text x={larguraPlaca / 2 - 24} y={0} textAnchor="end" fontSize={21} fill="#9ca3af">
            {squad.agentes.length} {squad.agentes.length === 1 ? "agente" : "agentes"}
            {subs > 0 ? ` · ${subs} ${subs === 1 ? "sub" : "subs"}` : ""}
          </text>
        </g>
      </g>
    </g>
  );
});

export const DEFS_ANDAR = (
  <>
    <linearGradient id="andar-piso" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#1a1a38" />
      <stop offset="1" stopColor="#101026" />
    </linearGradient>
    <linearGradient id="andar-parede" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#6366f1" stopOpacity="0.28" />
      <stop offset="1" stopColor="#6366f1" stopOpacity="0.05" />
    </linearGradient>
  </>
);
