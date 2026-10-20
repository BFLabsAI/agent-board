import { Building2, Expand, LayoutGrid, Minimize2, Network, Orbit } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { cliente } from "../../api/cliente";
import type { Agente, Tarefa } from "../../api/tipos";
import { useApi } from "../../api/useApi";
import { useEvento } from "../../api/useStream";
import { EmptyState, PageHeader, Segmented, Skeleton } from "../../components/ui";
import { useContextoPainel } from "../../context/ContextoPainel";
import { CanvasZoom } from "./CanvasZoom";
import { Gaveta } from "./Gaveta";
import Grade from "./Grade";
import Hub from "./Hub";
import { LiveLogs } from "./LiveLogs";
import Mapa from "./Mapa";

type Modo = "hub" | "mapa" | "grade";
const MODOS = [
  { valor: "hub" as const, rotulo: "Hub", icone: Orbit },
  { valor: "mapa" as const, rotulo: "Mapa", icone: Network },
  { valor: "grade" as const, rotulo: "Grade", icone: LayoutGrid },
];
const modoValido = (v: string | null): Modo => (v === "mapa" || v === "grade" ? v : "hub");

function EsqueletoCena() {
  return (
    <div className="flex h-full items-center justify-center" aria-busy="true" aria-label="Carregando o escritório">
      <Skeleton className="h-[60%] w-[70%] rounded-2xl" />
    </div>
  );
}

export default function Office() {
  const [params, setParams] = useSearchParams();
  const { tv } = useContextoPainel();
  const modo = modoValido(params.get("modo"));
  const raiz = useRef<HTMLDivElement>(null);

  const apiAgentes = useApi((c, s) => cliente.agentes(c, s));
  const apiTarefas = useApi((c, s) => cliente.tarefas(c, s));
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [selecionado, setSelecionado] = useState<string | null>(null);

  useEffect(() => {
    if (apiAgentes.dados) setAgentes(apiAgentes.dados);
  }, [apiAgentes.dados]);
  useEffect(() => {
    if (apiTarefas.dados) setTarefas(apiTarefas.dados);
  }, [apiTarefas.dados]);

  useEvento("agente", (a) => setAgentes((l) => (l.some((x) => x.agente === a.agente) ? l.map((x) => (x.agente === a.agente ? a : x)) : [...l, a])));
  useEvento("tarefa", (t) => setTarefas((l) => (l.some((x) => x.id === t.id) ? l.map((x) => (x.id === t.id ? t : x)) : [t, ...l])));

  const atualizar = useCallback(
    (chave: string, valor: string | null) =>
      setParams(
        (ant) => {
          const n = new URLSearchParams(ant);
          if (valor) n.set(chave, valor);
          else n.delete(chave);
          return n;
        },
        { replace: true },
      ),
    [setParams],
  );

  const escolherModo = (m: Modo) => atualizar("modo", m === "hub" ? null : m);

  // modo TV: ?tv=1 + tela cheia (a Fullscreen API exige gesto do usuário, então só o botão a aciona)
  const entrarTv = () => {
    atualizar("tv", "1");
    raiz.current?.requestFullscreen?.().catch(() => undefined);
  };
  const sairTv = useCallback(() => {
    atualizar("tv", null);
    if (typeof document !== "undefined" && document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
  }, [atualizar]);
  useEffect(() => {
    const fn = () => {
      if (!document.fullscreenElement && tv) atualizar("tv", null);
    };
    document.addEventListener("fullscreenchange", fn);
    return () => document.removeEventListener("fullscreenchange", fn);
  }, [tv, atualizar]);

  // o agente selecionado some da lista (troca de projeto): fecha a gaveta
  useEffect(() => {
    if (selecionado && agentes.length > 0 && !agentes.some((a) => a.agente === selecionado)) setSelecionado(null);
  }, [agentes, selecionado]);

  const aoSelecionar = useCallback((nome: string) => setSelecionado((s) => (s === nome ? null : nome)), []);
  const agenteAberto = useMemo(() => agentes.find((a) => a.agente === selecionado) ?? null, [agentes, selecionado]);

  const carregando = (apiAgentes.carregando || apiTarefas.carregando) && agentes.length === 0;
  const props = { agentes, tarefas, selecionado, aoSelecionar };

  const seletor = <Segmented opcoes={MODOS} valor={modo} onChange={escolherModo} ariaLabel="Modo de visualização" tamanho={tv ? "sm" : "md"} />;
  const botaoTv = (
    <button
      type="button"
      onClick={tv ? sairTv : entrarTv}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-1.5 text-sm text-texto-suave transition-colors hover:bg-surface-4 hover:text-texto"
    >
      {tv ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Expand className="h-4 w-4" aria-hidden="true" />}
      {tv ? "Sair do modo TV" : "Modo TV"}
    </button>
  );

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
    corpo = <CanvasZoom>{modo === "hub" ? <Hub {...props} /> : <Mapa {...props} />}</CanvasZoom>;
  }

  return (
    <div
      ref={raiz}
      data-testid="office"
      className={tv ? "fixed inset-0 z-40 flex flex-col bg-surface-0 p-3" : "flex h-[calc(100vh-4rem)] min-h-[560px] flex-col"}
    >
      {!tv && (
        <PageHeader
          icone={Building2}
          titulo="Office"
          subtitulo="O time no escritório, ao vivo"
          acoes={
            <>
              {seletor}
              {botaoTv}
            </>
          }
        />
      )}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-[radial-gradient(ellipse_at_50%_46%,#14142a_0%,#0a0a14_55%,#06060a_100%)]">
        {corpo}
        {tv && (
          <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
            {seletor}
            {botaoTv}
          </div>
        )}
        <LiveLogs deslocado={!!agenteAberto} />
        <Gaveta agente={agenteAberto} tarefas={tarefas} aoFechar={() => setSelecionado(null)} />
      </div>
    </div>
  );
}
