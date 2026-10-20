import clsx from "clsx";
import { HelpCircle } from "lucide-react";
import type { ReactNode } from "react";

/** Dica do "?": abre ao passar o mouse ou focar, com quebra de linha. */
function DicaColuna({ titulo, entra, sai, alinhar }: { titulo: string; entra: string; sai: string; alinhar: "esq" | "dir" }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={`Como funciona a coluna ${titulo}`}
        className="rounded text-texto-fraco transition-colors hover:text-texto focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        className={clsx(
          "pointer-events-none absolute top-full z-50 mt-2 w-64 space-y-1.5 rounded-lg border border-border-light bg-surface-5 p-3 text-xs font-normal normal-case tracking-normal text-texto opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
          alinhar === "esq" ? "left-0" : "right-0",
        )}
      >
        <span className="block"><b className="text-texto">Entra:</b> <span className="text-texto-suave">{entra}</span></span>
        <span className="block"><b className="text-texto">Sai:</b> <span className="text-texto-suave">{sai}</span></span>
      </span>
    </span>
  );
}

/** Coluna rolável com altura cheia: título colorido, "?" e contador. */
export function Coluna({
  titulo, entra, sai, total, texto, ponto, destaque, alinhar = "esq", chave, brilho, extra, children,
}: {
  /** id estável da coluna (usado para rolar até ela) */
  chave?: string;
  /** pisca o cabeçalho (card chegou aqui) */
  brilho?: boolean;
  /** conteúdo logo abaixo do cabeçalho (ex.: abas de Fechadas) */
  extra?: ReactNode;
  titulo: string;
  entra: string;
  sai: string;
  total: number;
  texto: string;
  ponto: string;
  destaque?: boolean;
  alinhar?: "esq" | "dir";
  children: ReactNode;
}) {
  return (
    <section
      aria-label={titulo}
      data-coluna={titulo}
      data-chave={chave}
      className={clsx(
        "relative flex h-full min-w-[11rem] max-w-[20rem] grow basis-[12rem] flex-col rounded-xl border",
        destaque ? "border-red-500/40 bg-red-500/[0.04]" : "border-border bg-surface-1/60",
      )}
    >
      <span className={clsx("absolute inset-x-4 top-0 h-0.5 rounded-b-full opacity-70", ponto)} aria-hidden="true" />
      <header
        data-brilho={brilho || undefined}
        className={clsx("mx-1 mt-1 flex items-center gap-2 rounded-lg px-3 pb-3 pt-3 transition-colors duration-500", brilho && "bg-accent/25 ring-2 ring-accent/60")}
      >
        <span className={clsx("h-2 w-2 rounded-full", ponto)} aria-hidden="true" />
        <h2 className={clsx("text-xs font-semibold uppercase tracking-wider", texto)}>{titulo}</h2>
        <DicaColuna titulo={titulo} entra={entra} sai={sai} alinhar={alinhar} />
        <span className="ml-auto rounded-full bg-surface-4 px-2 py-0.5 text-xs tabular-nums text-texto-suave" data-contador>{total}</span>
      </header>
      {extra}
      <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-4">{children}</ul>
    </section>
  );
}
