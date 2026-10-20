import clsx from "clsx";
import { useId, type ReactNode } from "react";

/** Dica ao passar o mouse ou focar. CSS puro, sem portal. */
export function Tooltip({
  texto,
  children,
  lado = "cima",
}: {
  texto: string;
  children: ReactNode;
  lado?: "cima" | "baixo" | "direita";
}) {
  const id = useId();
  return (
    <span className="group relative inline-flex" aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className={clsx(
          "pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-border-light bg-surface-5 px-2 py-1 text-xs text-texto opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
          lado === "cima" && "bottom-full left-1/2 mb-1.5 -translate-x-1/2",
          lado === "baixo" && "left-1/2 top-full mt-1.5 -translate-x-1/2",
          lado === "direita" && "left-full top-1/2 ml-2 -translate-y-1/2",
        )}
      >
        {texto}
      </span>
    </span>
  );
}
