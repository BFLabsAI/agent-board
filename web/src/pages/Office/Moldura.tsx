import { Building, Building2, Expand, LayoutGrid, Layers, Minimize2, Network, Orbit } from "lucide-react";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader, Segmented, Skeleton } from "../../components/ui";
import { useContextoPainel } from "../../context/ContextoPainel";
import { PROJETO_TODOS } from "../../api/stream";

export type Modo = "hub" | "mapa" | "grade" | "andar" | "predio";
const MODOS = [
  { valor: "hub" as const, rotulo: "Hub", icone: Orbit },
  { valor: "mapa" as const, rotulo: "Mapa", icone: Network },
  { valor: "grade" as const, rotulo: "Grade", icone: LayoutGrid },
  { valor: "andar" as const, rotulo: "Andar", icone: Layers },
  { valor: "predio" as const, rotulo: "Prédio", icone: Building },
];

/** `?modo=andar` ou `?projeto=*` abrem o andar com todos os squads. */
export function modoDe(params: URLSearchParams): Modo {
  const v = params.get("modo");
  if (v === "predio") return "predio";
  if (v === "andar" || params.get("projeto") === PROJETO_TODOS) return "andar";
  return v === "mapa" || v === "grade" ? v : "hub";
}

export function EsqueletoCena() {
  return (
    <div className="flex h-full items-center justify-center" aria-busy="true" aria-label="Carregando o escritório">
      <Skeleton className="h-[60%] w-[70%] rounded-2xl" />
    </div>
  );
}

/**
 * Casca do Office: cabeçalho, seletor de modo, modo TV e a área escura da cena.
 * `corpo` é a cena; `sobre` são as camadas por cima (logs ao vivo, gaveta).
 */
export function Moldura({ modo, corpo, sobre }: { modo: Modo; corpo: ReactNode; sobre?: ReactNode }) {
  const [, setParams] = useSearchParams();
  const { tv, workspaces } = useContextoPainel();
  const raiz = useRef<HTMLDivElement>(null);

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

  const escolherModo = (m: Modo) =>
    setParams(
      (ant) => {
        const n = new URLSearchParams(ant);
        if (m === "hub") n.delete("modo");
        else n.set("modo", m);
        // o andar é de todos os squads: sem projeto único na URL
        if (m === "andar" || m === "predio" || n.get("projeto") === PROJETO_TODOS) n.delete("projeto");
        // o prédio é de todos os Workspaces
        if (m === "predio") n.delete("workspace");
        return n;
      },
      { replace: true },
    );

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

  // o Prédio só faz sentido com mais de um Workspace (fica de fora; aberto por URL, mostra a explicação)
  const opcoesModo = workspaces.length > 1 || modo === "predio" ? MODOS : MODOS.filter((o) => o.valor !== "predio");
  const seletor = <Segmented opcoes={opcoesModo} valor={modo} onChange={escolherModo} ariaLabel="Modo de visualização" tamanho={tv ? "sm" : "md"} />;
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

  return (
    <div
      ref={raiz}
      data-testid="office"
      data-modo={modo}
      className={tv ? "fixed inset-0 z-40 flex flex-col bg-surface-0 p-3" : "flex h-[calc(100vh-4rem)] min-h-[560px] flex-col"}
    >
      {!tv && (
        <PageHeader
          icone={Building2}
          titulo="Office"
          subtitulo={modo === "predio" ? "Todos os workspaces, um andar para cada" : modo === "andar" ? "Todos os squads, uma sala para cada" : "O time no escritório, ao vivo"}
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
        {sobre}
      </div>
    </div>
  );
}
