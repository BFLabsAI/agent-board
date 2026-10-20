import { Building2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { cliente } from "../../../api/cliente";
import type { Squad, Tarefa, WorkspaceResumo } from "../../../api/tipos";
import { useEventoWorkspace, useRecarregar } from "../../../api/useStream";
import { EmptyState } from "../../../components/ui";
import { CAMINHO_OFFICE, CHAVE_PROJETO, useContextoPainel } from "../../../context/ContextoPainel";
import { gravarLocal } from "../../../lib/armazenamento";
import { aplicarAgente, aplicarMensagem, aplicarSub } from "../../Geral/lib";
import { CanvasZoom } from "../CanvasZoom";
import { Gaveta } from "../Gaveta";
import { DEFS_SALA } from "../Hub/SalaMaster";
import { MATRIZ_CHAO } from "../Hub/geometria";
import { DEFS_ANDAR } from "../Andar/Sala";
import { EsqueletoCena, Moldura } from "../Moldura";
import { useReduzirMovimento } from "../useReduzirMovimento";
import "../Hub/hub.css";
import "../Andar/andar.css";
import "./predio.css";
import { layoutPredio, type LayoutPredio } from "./layout";
import { DEFS_PREDIO, Piso, type EstadoSquads } from "./Piso";

/** Pulsos em voo no prédio todo. */
const MAX_PULSOS_PREDIO = 6;

interface Selecao {
  workspace: string;
  projeto: string;
  agente: string;
}

const COR_SAUDE = { ok: "#34d399", atencao: "#fbbf24", critico: "#f87171", offline: "#6b7280" } as const;

/** Modo Prédio: um andar por Workspace, com as salas dos squads, ao vivo pelo stream `workspace=*`. */
export default function Predio() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reduzido = useReduzirMovimento();
  const { workspaces, workspacesCarregando, periodo, tv } = useContextoPainel();
  const [estados, setEstados] = useState<Record<string, EstadoSquads>>({});
  const [sel, setSel] = useState<Selecao | null>(null);
  const [subFoco, setSubFoco] = useState<string | null>(null);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [tique, setTique] = useState(0);
  const orcamento = useRef({ usados: 0, max: MAX_PULSOS_PREDIO }).current;
  const refazer = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const online = useMemo(() => workspaces.filter((w) => w.online), [workspaces]);
  const chaveOnline = online.map((w) => w.id).join("|");
  const localDe = useRef(new Map<string, boolean>());
  localDe.current = new Map(workspaces.map((w) => [w.id, w.local]));
  /** id para o cliente: o local não leva prefixo */
  const idApi = useCallback((id: string) => (localDe.current.get(id) ? null : id), []);

  // carrega os squads de cada Workspace online (de novo quando um volta, o período muda ou o stream reconecta)
  useEffect(() => {
    const ac = new AbortController();
    for (const w of online) {
      cliente
        .geral({ periodo, workspace: w.local ? null : w.id }, ac.signal)
        .then((g) => !ac.signal.aborted && setEstados((e) => ({ ...e, [w.id]: { squads: g.squads, erro: null } })))
        .catch((err: Error) => {
          if (ac.signal.aborted) return;
          setEstados((e) => ({ ...e, [w.id]: { squads: e[w.id]?.squads ?? null, erro: err.message || "falha de rede" } }));
        });
    }
    return () => ac.abort();
  }, [chaveOnline, periodo, tique]);
  useRecarregar(() => setTique((t) => t + 1));
  useEffect(() => {
    const t = refazer.current;
    return () => t.forEach(clearTimeout);
  }, []);

  const aplicar = useCallback((ws: string, f: (l: Squad[]) => Squad[]) => {
    setEstados((e) => (e[ws]?.squads ? { ...e, [ws]: { ...e[ws], squads: f(e[ws].squads!) } } : e));
  }, []);
  useEventoWorkspace("mensagem", (m, ws) => aplicar(ws, (l) => (m.projeto ? aplicarMensagem(l, { ...m, projeto: m.projeto }) : l)));
  useEventoWorkspace("agente", (a, ws) => a.projeto && aplicar(ws, (l) => aplicarAgente(l, a.projeto!, a)));
  useEventoWorkspace("subagente", (s, ws) => s.projeto && aplicar(ws, (l) => aplicarSub(l, s.projeto!, s)));
  // tarefa nova ou em novo estado: refaz os números do Workspace, agrupando rajadas
  useEventoWorkspace("tarefa", (t, ws) => {
    if (sel?.workspace === ws && sel.projeto === t.projeto) setTarefas((l) => (l.some((x) => x.id === t.id) ? l.map((x) => (x.id === t.id ? t : x)) : [t, ...l]));
    const antigo = refazer.current.get(ws);
    if (antigo) clearTimeout(antigo);
    refazer.current.set(
      ws,
      setTimeout(() => {
        refazer.current.delete(ws);
        cliente
          .geral({ periodo, workspace: idApi(ws) })
          .then((g) => setEstados((e) => ({ ...e, [ws]: { squads: g.squads, erro: null } })))
          .catch(() => undefined);
      }, 500),
    );
  });

  // tarefas do squad do agente aberto (a gaveta lista as dele)
  const chaveSel = sel ? `${sel.workspace}/${sel.projeto}` : null;
  useEffect(() => {
    setTarefas([]);
    if (!sel) return;
    const ac = new AbortController();
    cliente.tarefas({ projeto: sel.projeto, workspace: idApi(sel.workspace) }, ac.signal).then((t) => { if (!ac.signal.aborted) setTarefas(t); }).catch(() => undefined);
    return () => ac.abort();
  }, [chaveSel]);

  const agenteAberto = useMemo(
    () => (sel ? (estados[sel.workspace]?.squads?.find((s) => s.projeto === sel.projeto)?.agentes.find((a) => a.agente === sel.agente) ?? null) : null),
    [estados, sel],
  );
  useEffect(() => {
    if (sel && estados[sel.workspace]?.squads && !agenteAberto) setSel(null);
  }, [sel, estados, agenteAberto]);

  const aoSelecionar = useCallback((workspace: string, projeto: string, agente: string) => {
    setSubFoco(null);
    setSel((s) => (s && s.workspace === workspace && s.projeto === projeto && s.agente === agente ? null : { workspace, projeto, agente }));
  }, []);
  const aoSelecionarSub = useCallback((workspace: string, projeto: string, agente: string, subId: string) => {
    setSel({ workspace, projeto, agente });
    setSubFoco(subId);
  }, []);

  const paramsRef = useRef(params);
  paramsRef.current = params;
  const manter = () => {
    const n = new URLSearchParams();
    for (const k of ["periodo", "tv"]) {
      const v = paramsRef.current.get(k);
      if (v) n.set(k, v);
    }
    return n;
  };
  // placa do andar: Office desse Workspace, no modo Andar
  const aoEntrarPiso = useCallback(
    (workspace: string) => {
      const n = manter();
      n.set("modo", "andar");
      n.set("workspace", workspace);
      navigate({ pathname: CAMINHO_OFFICE, search: `?${n.toString()}` });
    },
    [navigate],
  );
  // placa da sala: Office do squad (Hub), naquele Workspace
  const aoEntrarSala = useCallback(
    (workspace: string, projeto: string) => {
      if (localDe.current.get(workspace)) gravarLocal(CHAVE_PROJETO, projeto);
      const n = manter();
      n.set("workspace", workspace);
      n.set("projeto", projeto);
      navigate({ pathname: CAMINHO_OFFICE, search: `?${n.toString()}` });
    },
    [navigate],
  );

  const entradas = useMemo(
    () =>
      workspaces.map((w) => {
        const squads = w.online ? (estados[w.id]?.squads ?? []) : [];
        return { salas: squads.length, maxOutros: Math.max(0, ...squads.map((s) => s.agentes.length - 1)) };
      }),
    [workspaces, estados],
  );
  // tela larga (monitor da holding): com 3 andares ou mais, a grade de 2 colunas aproveita melhor que a torre
  const [area, setArea] = useState<{ w: number; h: number } | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = areaRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setArea((a) => (a && a.w === el.clientWidth && a.h === el.clientHeight ? a : { w: el.clientWidth, h: el.clientHeight })));
    ro.observe(el);
    return () => ro.disconnect();
  }, [workspaces.length > 1]);
  const lay = useMemo<LayoutPredio>(() => {
    const torre = layoutPredio(entradas, 1);
    if (!area || !area.w || !area.h || entradas.length < 3) return torre;
    const grade = layoutPredio(entradas, 2);
    const ajuste = (l: LayoutPredio) => Math.min(area.w / l.w, area.h / l.h);
    return ajuste(grade) > ajuste(torre) * 1.15 ? grade : torre;
  }, [entradas, area]);

  const trabalhando = useMemo(
    () => Object.values(estados).reduce((n, e) => n + (e.squads ?? []).reduce((m, s) => m + s.agentes.filter((a) => a.status === "trabalhando").length, 0), 0),
    [estados],
  );

  let corpo;
  if (workspaces.length <= 1 && !workspacesCarregando) {
    corpo = (
      <div className="flex h-full items-center justify-center p-6" data-testid="predio-indisponivel">
        <EmptyState
          icone={Building2}
          titulo="O prédio precisa de mais de um Workspace"
          descricao="Este painel só enxerga um Workspace. Conecte outras máquinas com o agent-board na tailnet para ganhar um andar para cada uma."
        />
      </div>
    );
  } else if (workspaces.length === 0) {
    corpo = <EsqueletoCena />;
  } else {
    const larg = lay.largura;
    const torre = lay.colunas === 1;
    // no modo TV os botões ficam por cima do canto: reserva uma faixa no topo
    const margem = tv ? 170 : 40;
    const colunaY = -34;
    const colunaH = lay.h + 34 + 40;
    corpo = (
      <div ref={areaRef} className="h-full w-full">
      <CanvasZoom key={`predio-${lay.colunas}`}>
        <svg
          className="hub-svg andar-svg predio-svg block select-none overflow-visible"
          width={lay.w}
          height={lay.h + margem}
          viewBox={`0 ${-margem} ${lay.w} ${lay.h + margem}`}
          role="group"
          aria-label="Prédio com um andar por Workspace"
          data-testid="predio-svg"
          data-reduzido={reduzido || undefined}
        >
          <defs>
            <pattern id="andar-grid" width={64} height={64} patternUnits="userSpaceOnUse" patternTransform={MATRIZ_CHAO}>
              <path d="M64 0H0V64" fill="none" stroke="#818cf8" strokeOpacity={0.16} strokeWidth={0.9} />
            </pattern>
            {DEFS_SALA}
            {DEFS_ANDAR}
            {DEFS_PREDIO}
          </defs>
          {/* estrutura: colunas laterais, base e cobertura */}
          {torre && <g aria-hidden="true">
            <rect x={-44} y={colunaY} width={20} height={colunaH} rx={6} fill="url(#predio-coluna)" stroke="#6366f1" strokeOpacity={0.3} />
            <rect x={larg + 24} y={colunaY} width={20} height={colunaH} rx={6} fill="url(#predio-coluna)" stroke="#6366f1" strokeOpacity={0.3} />
            <rect x={-70} y={lay.h + 28} width={larg + 140} height={22} rx={8} fill="#0d0d1c" stroke="#6366f1" strokeOpacity={0.35} />
            <rect x={-70} y={colunaY - 8} width={larg + 140} height={14} rx={6} fill="#0d0d1c" stroke="#6366f1" strokeOpacity={0.35} />
          </g>}
          {workspaces.map((w, i) => (
            <Piso
              key={w.id}
              w={w as WorkspaceResumo}
              numero={workspaces.length - i}
              estado={estados[w.id]}
              pos={lay.pisos[i]}
              largura={larg}
              dim={lay.dim}
              orcamento={orcamento}
              selecionado={sel?.workspace === w.id ? sel : null}
              aoSelecionar={aoSelecionar}
              aoSelecionarSub={aoSelecionarSub}
              aoEntrarSala={aoEntrarSala}
              aoEntrarPiso={aoEntrarPiso}
            />
          ))}
        </svg>
      </CanvasZoom>
      </div>
    );
  }

  const nOnline = online.length;
  return (
    <Moldura
      modo="predio"
      corpo={
        <>
          {corpo}
          {workspaces.length > 1 && (
            <div
              data-testid="resumo-predio"
              className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-3 rounded-lg border border-border bg-surface-2/90 px-3 py-1.5 text-xs text-texto-suave backdrop-blur"
            >
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: COR_SAUDE.ok }} aria-hidden="true" />{nOnline} online</span>
              {workspaces.length - nOnline > 0 && (
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: COR_SAUDE.offline }} aria-hidden="true" />{workspaces.length - nOnline} offline</span>
              )}
              <span className="tabular-nums">{trabalhando} {trabalhando === 1 ? "agente trabalhando" : "agentes trabalhando"}</span>
            </div>
          )}
        </>
      }
      sobre={<Gaveta agente={agenteAberto} projeto={sel?.projeto} workspace={sel?.workspace} tarefas={tarefas} subFoco={subFoco} aoFechar={() => { setSel(null); setSubFoco(null); }} />}
    />
  );
}
