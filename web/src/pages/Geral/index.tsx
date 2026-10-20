import { AlertTriangle, LayoutGrid, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cliente } from "../../api/cliente";
import type { Squad } from "../../api/tipos";
import { useApi } from "../../api/useApi";
import { useEventoSquad } from "../../api/useStream";
import { EmptyState, PageHeader, Skeleton } from "../../components/ui";
import { CardSquad } from "./CardSquad";
import { FeedGeral } from "./FeedGeral";
import "./Geral.css";
import { aplicarAgente, aplicarMensagem, aplicarSub, totaisVivos } from "./lib";
import { Totais } from "./Totais";

const PULSO_MS = 1500;

export default function Geral() {
  const api = useApi((c, s) => cliente.geral({ periodo: c.periodo }, s));
  const [squads, setSquads] = useState<Squad[]>([]);
  const [pulsando, setPulsando] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const refazer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (api.dados) setSquads(api.dados.squads);
  }, [api.dados]);

  useEffect(() => {
    const t = timers.current;
    return () => {
      t.forEach(clearTimeout);
      if (refazer.current) clearTimeout(refazer.current);
    };
  }, []);

  // push: o card do squad que recebeu a mensagem pulsa e conta a mensagem
  useEventoSquad("mensagem", (m, projeto) => {
    setSquads((atual) => aplicarMensagem(atual, { ...m, projeto }));
    setPulsando((s) => new Set(s).add(projeto));
    const antigo = timers.current.get(projeto);
    if (antigo) clearTimeout(antigo);
    timers.current.set(
      projeto,
      setTimeout(() => {
        timers.current.delete(projeto);
        setPulsando((s) => {
          const n = new Set(s);
          n.delete(projeto);
          return n;
        });
      }, PULSO_MS),
    );
  });
  useEventoSquad("agente", (a, projeto) => setSquads((atual) => aplicarAgente(atual, projeto, a)));
  useEventoSquad("subagente", (sub, projeto) => setSquads((atual) => aplicarSub(atual, projeto, sub)));

  // tarefa nova ou mudou de estado: refaz os números do servidor (abertos, atrasados, revisão, saúde), agrupando rajadas
  const { recarregar } = api;
  useEventoSquad("tarefa", () => {
    if (refazer.current) clearTimeout(refazer.current);
    refazer.current = setTimeout(recarregar, 500);
  });

  const totais = useMemo(() => (squads.length ? totaisVivos(squads) : (api.dados?.totais ?? null)), [squads, api.dados]);
  const nomes = useMemo(() => squads.map((s) => s.projeto), [squads]);
  const semDados = !api.dados && squads.length === 0;

  return (
    <>
      <PageHeader
        icone={LayoutGrid}
        titulo="Visão geral"
        subtitulo="Todos os squads do servidor ao mesmo tempo"
        acoes={
          <button type="button" onClick={api.recarregar} className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-texto-suave transition-colors hover:bg-surface-4 hover:text-texto">
            <RefreshCw className={`h-4 w-4 ${api.carregando ? "animate-spin" : ""}`} aria-hidden="true" /> Atualizar
          </button>
        }
      />

      {api.erro && semDados ? (
        <EmptyState icone={AlertTriangle} titulo="Não foi possível carregar a visão geral" descricao={api.erro.message} />
      ) : (
        <>
          <Totais totais={totais} carregando={api.carregando} />
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_25rem]">
            <section aria-label="Squads" className="min-w-0">
              {semDados ? (
                <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(21rem,1fr))]">
                  {[0, 1, 2].map((k) => <Skeleton key={k} className="h-80 w-full" />)}
                </div>
              ) : squads.length === 0 ? (
                <EmptyState icone={LayoutGrid} titulo="Nenhum squad cadastrado" descricao="Cadastre um projeto no agent-board para ele aparecer aqui." />
              ) : (
                <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(21rem,1fr))]" data-testid="grade-squads">
                  {squads.map((s) => <CardSquad key={s.projeto} squad={s} pulsando={pulsando.has(s.projeto)} />)}
                </div>
              )}
            </section>
            <div className="min-w-0 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:[&>section]:max-h-[calc(100vh-3rem)]">
              <FeedGeral squads={nomes} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
