import { memo, useCallback, type KeyboardEvent } from "react";
import type { Squad, WorkspaceResumo } from "../../../api/tipos";
import { ROTULO_SAUDE_WORKSPACE } from "../../../api/workspaces";
import { truncar } from "../../../lib/formato";
import { Sala, type OrcamentoPulsos } from "../Andar/Sala";
import type { DimSala } from "../Andar/layout";
import { ESPESSURA_PISO, LARGURA_PLACA, type PosPiso } from "./layout";

const COR = { ok: "#34d399", atencao: "#fbbf24", critico: "#f87171", offline: "#6b7280" } as const;

export interface EstadoSquads {
  squads: Squad[] | null;
  erro: string | null;
}

export interface PropsPiso {
  w: WorkspaceResumo;
  /** número do andar (de baixo para cima, começando em 1) */
  numero: number;
  estado: EstadoSquads | undefined;
  pos: PosPiso;
  largura: number;
  dim: DimSala;
  orcamento: OrcamentoPulsos;
  /** "projeto/agente" selecionado neste andar, ou null */
  selecionado: { projeto: string; agente: string } | null;
  aoSelecionar: (workspace: string, projeto: string, agente: string) => void;
  aoSelecionarSub: (workspace: string, projeto: string, agente: string, subId: string) => void;
  aoEntrarSala: (workspace: string, projeto: string) => void;
  aoEntrarPiso: (workspace: string) => void;
}

function Texto({ x, y, tam, cor, peso = 400, ancora = "start", children, mono }: { x: number; y: number; tam: number; cor: string; peso?: number; ancora?: "start" | "middle" | "end"; children: React.ReactNode; mono?: boolean }) {
  return (
    <text x={x} y={y} fontSize={tam} fontWeight={peso} fill={cor} textAnchor={ancora} fontFamily={mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined}>
      {children}
    </text>
  );
}

/** Um andar: a laje, a placa do Workspace à esquerda e as salas dos squads. */
export const Piso = memo(function Piso({ w, numero, estado, pos, largura, dim, orcamento, selecionado, aoSelecionar, aoSelecionarSub, aoEntrarSala, aoEntrarPiso }: PropsPiso) {
  const offline = !w.online;
  const cor = COR[w.saude];
  const squads = !offline ? (estado?.squads ?? []) : [];
  const { x: px0, y, h } = pos;
  const totalAgentes = squads.reduce((n, s) => n + s.agentes.length, 0);
  const podeEntrar = !offline;

  const entrar = useCallback(() => {
    if (podeEntrar) aoEntrarPiso(w.id);
  }, [podeEntrar, aoEntrarPiso, w.id]);
  const tecla = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      entrar();
    }
  };
  const sel = useCallback((p: string, a: string) => aoSelecionar(w.id, p, a), [aoSelecionar, w.id]);
  const selSub = useCallback((p: string, a: string, s: string) => aoSelecionarSub(w.id, p, a, s), [aoSelecionarSub, w.id]);
  const entrarSala = useCallback((p: string) => aoEntrarSala(w.id, p), [aoEntrarSala, w.id]);

  const px = 24;
  const caixaW = LARGURA_PLACA - 2 * px;
  const nome = truncar(w.nome, 14);
  const rotuloSaude = ROTULO_SAUDE_WORKSPACE[w.saude];

  return (
    <g data-testid="piso" data-workspace={w.id} data-saude={w.saude} data-online={w.online} transform={`translate(${px0} ${y})`} opacity={offline ? 0.9 : 1}>
      {/* laje: bandeja do andar e a espessura da frente */}
      <rect x={6} y={h} width={largura - 12} height={ESPESSURA_PISO} rx={4} fill={offline ? "#05050a" : "#080813"} stroke={cor} strokeOpacity={0.3} strokeWidth={1.2} />
      <rect x={0} y={0} width={largura} height={h} rx={20} fill={offline ? "url(#predio-piso-off)" : "url(#predio-piso)"} stroke={cor} strokeOpacity={offline ? 0.25 : 0.5} strokeWidth={2} />
      {!offline && <rect x={LARGURA_PLACA} y={10} width={largura - LARGURA_PLACA - 10} height={h - 20} rx={14} fill="url(#predio-chao)" />}
      <rect x={20} y={0} width={largura - 40} height={4} rx={2} fill={cor} fillOpacity={offline ? 0.25 : 0.7} />

      {/* placa do andar: clique entra no Office (modo Andar) do Workspace */}
      <g
        className={podeEntrar ? "predio-placa" : undefined}
        data-testid="placa-andar"
        data-workspace={w.id}
        data-saude={w.saude}
        role={podeEntrar ? "link" : "group"}
        tabIndex={podeEntrar ? 0 : undefined}
        aria-label={podeEntrar ? `Entrar no workspace ${w.nome}, saúde ${rotuloSaude}` : `Workspace ${w.nome}, offline`}
        aria-disabled={podeEntrar ? undefined : true}
        onClick={podeEntrar ? entrar : undefined}
        onKeyDown={podeEntrar ? tecla : undefined}
      >
        <title>{w.nome}</title>
        <rect className="predio-placa-caixa" x={px} y={px} width={caixaW} height={h - 2 * px} rx={18} fill="#0c0c14" fillOpacity={0.94} stroke={cor} strokeOpacity={0.75} strokeWidth={2} />
        <rect x={px + 14} y={px} width={caixaW - 28} height={5} rx={2} fill={cor} fillOpacity={0.8} />
        <Texto x={px + 36} y={px + 62} tam={30} cor="#6b7280" peso={700}>{`ANDAR ${numero}`}</Texto>
        {w.local && (
          <g transform={`translate(${px + caixaW - 36} ${px + 40})`}>
            <rect x={-210} y={-28} width={210} height={44} rx={10} fill="none" stroke="#6b7280" strokeOpacity={0.7} strokeWidth={1.6} />
            <Texto x={-105} y={4} tam={25} cor="#9ca3af" peso={600} ancora="middle">este painel</Texto>
          </g>
        )}
        <Texto x={px + 36} y={px + 172} tam={92} cor={offline ? "#9ca3af" : "#f4f4fb"} peso={800}>{nome}</Texto>

        <g data-testid="selo-andar" data-saude={w.saude} transform={`translate(${px + 36} ${px + 256})`}>
          <circle cx={15} cy={-13} r={15} fill={cor} className={w.saude === "atencao" || w.saude === "critico" ? "hub-luz-pulsa" : undefined} />
          <Texto x={46} y={0} tam={44} cor={cor} peso={700}>{rotuloSaude}</Texto>
        </g>

        <g transform={`translate(${px + 36} ${px + 328})`}>
          {w.versao && (
            <Texto x={0} y={0} tam={38} cor="#9ca3af" mono>
              <tspan data-testid="versao-andar">{`v${w.versao}`}</tspan>
            </Texto>
          )}
          {!offline && w.latencia_ms != null && (
            <Texto x={caixaW - 72} y={0} tam={38} cor="#9ca3af" ancora="end">
              <tspan data-testid="latencia-andar">{`${w.latencia_ms} ms`}</tspan>
            </Texto>
          )}
        </g>
        {w.desatualizado && (
          <g data-testid="aviso-desatualizado-andar" transform={`translate(${px + 36} ${px + 352})`}>
            <rect x={0} y={0} width={caixaW - 72} height={60} rx={30} fill="#fbbf24" fillOpacity={0.12} stroke="#fbbf24" strokeOpacity={0.5} strokeWidth={1.6} />
            <Texto x={(caixaW - 72) / 2} y={40} tam={32} cor="#fcd34d" peso={700} ancora="middle">atualize o agent-board</Texto>
          </g>
        )}
        {!offline && (
          <Texto x={px + 36} y={h - px - 30} tam={32} cor="#9ca3af">
            {`${squads.length} ${squads.length === 1 ? "squad" : "squads"} · ${totalAgentes} ${totalAgentes === 1 ? "agente" : "agentes"}`}
          </Texto>
        )}
        {offline && (
          <Texto x={px + 36} y={h - px - 30} tam={32} cor="#6b7280">sem agentes</Texto>
        )}
      </g>

      {offline && (
        <g data-testid="piso-offline" transform={`translate(${LARGURA_PLACA + (largura - LARGURA_PLACA) / 2} ${h / 2})`}>
          <Texto x={0} y={10} tam={150} cor="#374151" peso={800} ancora="middle">offline</Texto>
          {w.erro && <Texto x={0} y={80} tam={32} cor="#4b5563" ancora="middle">{truncar(w.erro, 64)}</Texto>}
        </g>
      )}
      {!offline && estado?.erro && squads.length === 0 && (
        <g role="alert" data-testid="piso-erro" transform={`translate(${LARGURA_PLACA + (largura - LARGURA_PLACA) / 2} ${h / 2})`}>
          <Texto x={0} y={0} tam={34} cor="#fca5a5" peso={700} ancora="middle">Não foi possível ler este workspace</Texto>
          <Texto x={0} y={44} tam={24} cor="#9ca3af" ancora="middle">{truncar(estado.erro, 70)}</Texto>
        </g>
      )}
      {!offline && !estado && (
        <Texto x={LARGURA_PLACA + (largura - LARGURA_PLACA) / 2} y={h / 2} tam={34} cor="#6b7280" ancora="middle">carregando salas…</Texto>
      )}
      {!offline && estado?.squads && squads.length === 0 && (
        <Texto x={LARGURA_PLACA + (largura - LARGURA_PLACA) / 2} y={h / 2} tam={34} cor="#6b7280" ancora="middle">Sem squads cadastrados</Texto>
      )}

      {squads.map((s, i) => {
        const p = pos.salas[i];
        if (!p) return null;
        return (
          <g key={s.projeto} transform={`translate(${Math.round(p.x)} ${Math.round(p.y)})`}>
            <Sala
              squad={s}
              dim={dim}
              workspace={w.id}
              maxPulsos={1}
              orcamento={orcamento}
              selecionado={selecionado?.projeto === s.projeto ? selecionado.agente : null}
              aoSelecionar={sel}
              aoSelecionarSub={selSub}
              aoEntrar={entrarSala}
            />
          </g>
        );
      })}
    </g>
  );
});

export const DEFS_PREDIO = (
  <>
    <linearGradient id="predio-piso" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#14142c" />
      <stop offset="1" stopColor="#0b0b1a" />
    </linearGradient>
    <linearGradient id="predio-piso-off" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#0a0a10" />
      <stop offset="1" stopColor="#050509" />
    </linearGradient>
    <linearGradient id="predio-chao" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#6366f1" stopOpacity="0.07" />
      <stop offset="1" stopColor="#6366f1" stopOpacity="0.01" />
    </linearGradient>
    <linearGradient id="predio-coluna" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="#1b1b36" />
      <stop offset="1" stopColor="#0d0d1c" />
    </linearGradient>
  </>
);
