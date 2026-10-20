import { AlertTriangle, Building2, Globe2, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useEventoWorkspace } from "../../api/useStream";
import { EmptyState, PageHeader, Skeleton } from "../../components/ui";
import { useContextoPainel } from "../../context/ContextoPainel";
import "../Geral/Geral.css";
import { CardWorkspace } from "./CardWorkspace";
import { FaixaTotais } from "./FaixaTotais";

const PULSO_MS = 1500;

/** Office do prédio, levando período e modo TV. */
function destinoPredio(search: string): string {
  const atual = new URLSearchParams(search);
  const n = new URLSearchParams({ modo: "predio" });
  for (const k of ["periodo", "tv"]) if (atual.get(k)) n.set(k, atual.get(k)!);
  return `/office?${n.toString()}`;
}

export default function Workspaces() {
  const { workspaces, workspacesCarregando, recarregarWorkspaces } = useContextoPainel();
  const { search } = useLocation();
  const [pulsando, setPulsando] = useState<ReadonlySet<string>>(new Set());
  const [aoVivo, setAoVivo] = useState<Readonly<Record<string, number>>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  const pulsar = (id: string) => {
    setPulsando((s) => new Set(s).add(id));
    const antigo = timers.current.get(id);
    if (antigo) clearTimeout(antigo);
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        setPulsando((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
      }, PULSO_MS),
    );
  };

  // push: a mensagem do squad pulsa o card do Workspace certo (a lista em si é atualizada pelo evento `workspace`, no contexto)
  useEventoWorkspace("mensagem", (_m, ws) => {
    setAoVivo((a) => ({ ...a, [ws]: (a[ws] ?? 0) + 1 }));
    pulsar(ws);
  });

  return (
    <>
      <PageHeader
        icone={Globe2}
        titulo="Workspaces"
        subtitulo="Todas as máquinas com o agent-board na tailnet"
        acoes={
          <>
          {workspaces.length > 1 && (
            <Link
              to={destinoPredio(search)}
              className="inline-flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-muted px-3 py-1.5 text-sm font-medium text-accent-hover transition-colors hover:border-accent/60 hover:bg-accent/25"
            >
              <Building2 className="h-4 w-4" aria-hidden="true" /> Office do prédio
            </Link>
          )}
          <button type="button" onClick={recarregarWorkspaces} className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-texto-suave transition-colors hover:bg-surface-4 hover:text-texto">
            <RefreshCw className={`h-4 w-4 ${workspacesCarregando ? "animate-spin" : ""}`} aria-hidden="true" /> Atualizar
          </button>
          </>
        }
      />

      {workspacesCarregando && workspaces.length === 0 ? (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(24rem,1fr))]">
          {[0, 1, 2].map((k) => <Skeleton key={k} className="h-80 w-full" />)}
        </div>
      ) : workspaces.length === 0 ? (
        <EmptyState icone={AlertTriangle} titulo="Nenhum Workspace encontrado" descricao="O painel não conseguiu listar os Workspaces. Confira se o servidor está no ar." />
      ) : (
        <>
          <FaixaTotais workspaces={workspaces} />
          <section aria-label="Workspaces" className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(24rem,1fr))]" data-testid="grade-workspaces">
            {workspaces.map((w) => (
              <CardWorkspace key={w.id} w={w} pulsando={pulsando.has(w.id)} aoVivo={aoVivo[w.id] ?? 0} search={search} />
            ))}
          </section>
        </>
      )}
    </>
  );
}
