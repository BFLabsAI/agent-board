import { Info } from "lucide-react";
import { useId } from "react";

/** Ícone (i) com explicação ao passar o mouse ou focar. Texto livre quebra em várias linhas. */
export function Dica({ texto, rotulo = "Mais informações" }: { texto: string; rotulo?: string }) {
  const id = useId();
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={rotulo}
        aria-describedby={id}
        className="rounded-full text-texto-fraco transition-colors hover:text-texto focus-visible:text-texto focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 w-64 rounded-lg border border-border-light bg-surface-5 px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-texto opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {texto}
      </span>
    </span>
  );
}
