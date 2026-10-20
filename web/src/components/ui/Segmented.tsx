import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

export interface OpcaoSegmentada<V extends string> {
  valor: V;
  rotulo: string;
  icone?: LucideIcon;
}

/** Toggle de opções mutuamente exclusivas ("Agentes | Tarefas"). */
export function Segmented<V extends string>({
  opcoes,
  valor,
  onChange,
  ariaLabel,
  tamanho = "md",
  cheio,
  className,
}: {
  opcoes: ReadonlyArray<OpcaoSegmentada<V>>;
  valor: V;
  onChange: (v: V) => void;
  ariaLabel: string;
  tamanho?: "sm" | "md";
  /** ocupa toda a largura, com botões do mesmo tamanho */
  cheio?: boolean;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={clsx("gap-1 rounded-lg border border-border bg-surface-1 p-1", cheio ? "flex" : "inline-flex", className)}
    >
      {opcoes.map(({ valor: v, rotulo, icone: Icone }) => {
        const ativo = v === valor;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => onChange(v)}
            className={clsx(
              "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors", cheio && "flex-1",
              tamanho === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
              ativo ? "bg-accent-muted text-accent-hover shadow-[inset_0_0_0_1px_rgba(99,102,241,0.35)]" : "text-texto-suave hover:bg-surface-4 hover:text-texto",
            )}
          >
            {Icone && <Icone className="h-3.5 w-3.5" aria-hidden="true" />}
            {rotulo}
          </button>
        );
      })}
    </div>
  );
}
