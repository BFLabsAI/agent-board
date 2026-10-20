import { Building2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { cliente } from "../../api/cliente";
import type { Agente, Tarefa } from "../../api/tipos";
import { useApi } from "../../api/useApi";
import { useEvento } from "../../api/useStream";
import { mesclarSub } from "./subagentes";
import { EmptyState } from "../../components/ui";
import Andar from "./Andar";
import { CanvasZoom } from "./CanvasZoom";
import { Gaveta } from "./Gaveta";
import Grade from "./Grade";
import Hub from "./Hub";
import { LiveLogs } from "./LiveLogs";
import Mapa from "./Mapa";
import Predio from "./Predio";
import { EsqueletoCena, modoDe, Moldura } from "./Moldura";

/** Um squad (projeto escolhido): Hub, Mapa e Grade. O Andar tem os próprios dados (todos os squads). */
function OfficeProjeto({ modo }: { modo: "hub" | "mapa" | "grade" }) {
  const apiAgentes = useApi((c, s) => cliente.agentes(c, s));
  const apiTarefas = useApi((c, s) => cliente.tarefas(c, s));
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [medidaMapa, setMedidaMapa] = useState<{ w: number; h: number } | null>(null);
  const aoMedir = useCallback((w: number, h: number) => setMedidaMapa((m) => (m && m.w === w && m.h === h ? m : { w, h })), []);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [subFoco, setSubFoco] = useState<string | null>(null);

  useEffect(() => {
    if (apiAgentes.dados) setAgentes(apiAgentes.dados);
  }, [apiAgentes.dados]);
  useEffect(() => {
    if (apiTarefas.dados) setTarefas(apiTarefas.dados);
  }, [apiTarefas.dados]);

  useEvento("agente", (a) => setAgentes((l) => (l.some((x) => x.agente === a.agente) ? l.map((x) => (x.agente === a.agente ? a : x)) : [...l, a])));
  useEvento("tarefa", (t) => setTarefas((l) => (l.some((x) => x.id === t.id) ? l.map((x) => (x.id === t.id ? t : x)) : [t, ...l])));

  // sub-agent novo/atualizado: entra no array do pai (insere ou substitui por id, ordenado)
  useEvento("subagente", (sub) =>
    setAgentes((l) => l.map((a) => (a.agente === sub.agente ? { ...a, subagentes: mesclarSub(a.subagentes ?? [], sub) } : a))),
  );

  // o agente selecionado some da lista (troca de projeto): fecha a gaveta
  useEffect(() => {
    if (selecionado && agentes.length > 0 && !agentes.some((a) => a.agente === selecionado)) setSelecionado(null);
  }, [agentes, selecionado]);

  const aoSelecionar = useCallback((nome: string) => {
    setSubFoco(null);
    setSelecionado((s) => (s === nome ? null : nome));
  }, []);
  const aoSelecionarSub = useCallback((nome: string, subId: string) => {
    setSelecionado(nome);
    setSubFoco(subId);
  }, []);
  const agenteAberto = useMemo(() => agentes.find((a) => a.agente === selecionado) ?? null, [agentes, selecionado]);

  const carregando = (apiAgentes.carregando || apiTarefas.carregando) && agentes.length === 0;
  const props = { agentes, tarefas, selecionado, aoSelecionar, aoSelecionarSub };

  let corpo;
  if (apiAgentes.erro && agentes.length === 0) {
    corpo = <EmptyState icone={Building2} titulo="Não foi possível carregar o time" descricao={apiAgentes.erro.message} />;
  } else if (carregando) {
    corpo = <EsqueletoCena />;
  } else if (agentes.length === 0) {
    corpo = (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState icone={Building2} titulo="Nenhum agente cadastrado" descricao="Cadastre os painéis do time (master, managers e researcher) para ver o escritório ganhar vida." />
      </div>
    );
  } else if (modo === "grade") {
    corpo = (
      <div className="h-full overflow-auto p-6">
        <Grade {...props} />
      </div>
    );
  } else {
    corpo = (
      <CanvasZoom key={modo} medida={modo === "mapa" ? medidaMapa : null}>
        {modo === "hub" ? <Hub {...props} /> : <Mapa {...props} aoMedir={aoMedir} />}
      </CanvasZoom>
    );
  }

  return (
    <Moldura
      modo={modo}
      corpo={corpo}
      sobre={
        <>
          <LiveLogs deslocado={!!agenteAberto} aoAbrir={() => setSelecionado(null)} />
          <Gaveta agente={agenteAberto} tarefas={tarefas} subFoco={subFoco} aoFechar={() => { setSelecionado(null); setSubFoco(null); }} />
        </>
      }
    />
  );
}

export default function Office() {
  const [params] = useSearchParams();
  const modo = modoDe(params);
  if (modo === "predio") return <Predio />;
  return modo === "andar" ? <Andar /> : <OfficeProjeto modo={modo} />;
}
