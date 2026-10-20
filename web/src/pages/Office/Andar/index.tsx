import { Building2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { cliente } from "../../../api/cliente";
import type { Squad, Tarefa } from "../../../api/tipos";
import { useApi } from "../../../api/useApi";
import { useEventoSquad } from "../../../api/useStream";
import { EmptyState } from "../../../components/ui";
import { CAMINHO_OFFICE, CHAVE_PROJETO } from "../../../context/ContextoPainel";
import { gravarLocal } from "../../../lib/armazenamento";
import { aplicarAgente, aplicarMensagem, aplicarSub } from "../../Geral/lib";
import { CanvasZoom } from "../CanvasZoom";
import { Gaveta } from "../Gaveta";
import { DEFS_SALA } from "../Hub/SalaMaster";
import { MATRIZ_CHAO } from "../Hub/geometria";
import { useReduzirMovimento } from "../useReduzirMovimento";
import { EsqueletoCena, Moldura } from "../Moldura";
import "../Hub/hub.css";
import "./andar.css";
import { layoutAndar } from "./layout";
import { DEFS_ANDAR, Sala } from "./Sala";

interface Selecao {
  projeto: string;
  agente: string;
}

/** Modo Andar: uma sala isométrica por squad, todas ao vivo pelo stream de todos os squads. */
export default function Andar() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reduzido = useReduzirMovimento();
  const api = useApi((c, s) => cliente.geral({ periodo: c.periodo }, s));
  const [squads, setSquads] = useState<Squad[]>([]);
  const [sel, setSel] = useState<Selecao | null>(null);
  const [subFoco, setSubFoco] = useState<string | null>(null);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const refazer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (api.dados) setSquads(api.dados.squads);
  }, [api.dados]);
  useEffect(() => () => { if (refazer.current) clearTimeout(refazer.current); }, []);

  useEventoSquad("mensagem", (m, projeto) => setSquads((l) => aplicarMensagem(l, { ...m, projeto })));
  useEventoSquad("agente", (a, projeto) => setSquads((l) => aplicarAgente(l, projeto, a)));
  useEventoSquad("subagente", (sub, projeto) => setSquads((l) => aplicarSub(l, projeto, sub)));
  // tarefa nova ou em novo estado: refaz os números do servidor (abertos, revisão, saúde), agrupando rajadas
  const { recarregar } = api;
  useEventoSquad("tarefa", (t, projeto) => {
    if (sel?.projeto === projeto) setTarefas((l) => (l.some((x) => x.id === t.id) ? l.map((x) => (x.id === t.id ? t : x)) : [t, ...l]));
    if (refazer.current) clearTimeout(refazer.current);
    refazer.current = setTimeout(recarregar, 500);
  });

  // tarefas do squad do agente aberto (a gaveta lista as dele)
  const projetoAberto = sel?.projeto ?? null;
  useEffect(() => {
    setTarefas([]);
    if (!projetoAberto) return;
    const ac = new AbortController();
    cliente.tarefas({ projeto: projetoAberto }, ac.signal).then((t) => { if (!ac.signal.aborted) setTarefas(t); }).catch(() => undefined);
    return () => ac.abort();
  }, [projetoAberto]);

  const agenteAberto = useMemo(
    () => (sel ? (squads.find((s) => s.projeto === sel.projeto)?.agentes.find((a) => a.agente === sel.agente) ?? null) : null),
    [squads, sel],
  );
  useEffect(() => {
    if (sel && squads.length > 0 && !agenteAberto) setSel(null);
  }, [sel, squads, agenteAberto]);

  const aoSelecionar = useCallback((projeto: string, agente: string) => {
    setSubFoco(null);
    setSel((s) => (s && s.projeto === projeto && s.agente === agente ? null : { projeto, agente }));
  }, []);
  const aoSelecionarSub = useCallback((projeto: string, agente: string, subId: string) => {
    setSel({ projeto, agente });
    setSubFoco(subId);
  }, []);
  // clicar na placa entra no squad: Office dele, no modo Hub
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const aoEntrar = useCallback(
    (projeto: string) => {
      gravarLocal(CHAVE_PROJETO, projeto);
      const n = new URLSearchParams({ projeto });
      for (const k of ["periodo", "tv"]) {
        const v = paramsRef.current.get(k);
        if (v) n.set(k, v);
      }
      navigate({ pathname: CAMINHO_OFFICE, search: `?${n.toString()}` });
    },
    [navigate],
  );

  const lay = useMemo(() => layoutAndar(squads.map((s) => Math.max(0, s.agentes.length - 1))), [squads]);

  let corpo;
  if (api.erro && squads.length === 0) {
    corpo = <EmptyState icone={Building2} titulo="Não foi possível carregar os squads" descricao={api.erro.message} />;
  } else if (!api.dados && squads.length === 0) {
    corpo = <EsqueletoCena />;
  } else if (squads.length === 0) {
    corpo = (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState icone={Building2} titulo="Nenhum squad cadastrado" descricao="Cadastre um projeto no agent-board para ele ganhar uma sala no andar." />
      </div>
    );
  } else {
    corpo = (
      <CanvasZoom key="andar">
        <svg
          className="hub-svg andar-svg block select-none overflow-visible"
          width={lay.w}
          height={lay.h}
          viewBox={`0 0 ${lay.w} ${lay.h}`}
          role="group"
          aria-label="Andar com uma sala por squad"
          data-testid="andar-svg"
          data-reduzido={reduzido || undefined}
        >
          <defs>
            <pattern id="andar-grid" width={64} height={64} patternUnits="userSpaceOnUse" patternTransform={MATRIZ_CHAO}>
              <path d="M64 0H0V64" fill="none" stroke="#818cf8" strokeOpacity={0.16} strokeWidth={0.9} />
            </pattern>
            {DEFS_SALA}
            {DEFS_ANDAR}
          </defs>
          {squads.map((s, i) => (
            <g key={s.projeto} transform={`translate(${Math.round(lay.salas[i].x)} ${Math.round(lay.salas[i].y)})`}>
              <Sala
                squad={s}
                dim={lay.dim}
                selecionado={sel?.projeto === s.projeto ? sel.agente : null}
                aoSelecionar={aoSelecionar}
                aoSelecionarSub={aoSelecionarSub}
                aoEntrar={aoEntrar}
              />
            </g>
          ))}
        </svg>
      </CanvasZoom>
    );
  }

  return (
    <Moldura
      modo="andar"
      corpo={corpo}
      sobre={<Gaveta agente={agenteAberto} projeto={sel?.projeto} tarefas={tarefas} subFoco={subFoco} aoFechar={() => { setSel(null); setSubFoco(null); }} />}
    />
  );
}
