import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Contêiner com rolagem horizontal visível e gradientes nas bordas
 * que indicam que há mais conteúdo para o lado.
 */
export function RolagemX({
  children, className, interno, rotulo,
}: {
  children: ReactNode;
  className?: string;
  /** classes do elemento que rola */
  interno?: string;
  rotulo?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [esq, setEsq] = useState(false);
  const [dir, setDir] = useState(false);

  const medir = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEsq(el.scrollLeft > 4);
    setDir(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    medir();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    return () => ro?.disconnect();
  }, [medir]);

  return (
    <div className={clsx("relative", className)}>
      <div
        ref={ref}
        onScroll={medir}
        data-rolagem-x
        role={rotulo ? "region" : undefined}
        aria-label={rotulo}
        tabIndex={rotulo ? 0 : undefined}
        className={clsx("barra-x h-full overflow-x-auto", interno)}
      >
        {children}
      </div>
      <div
        aria-hidden="true"
        data-fade="esq"
        className={clsx("pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-surface-0 via-surface-0/80 to-transparent transition-opacity", esq ? "opacity-100" : "opacity-0")}
      />
      <div
        aria-hidden="true"
        data-fade="dir"
        className={clsx("pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-surface-0 via-surface-0/80 to-transparent transition-opacity", dir ? "opacity-100" : "opacity-0")}
      />
      {[
        { lado: "esq" as const, ativo: esq, Icone: ChevronLeft, rotulo: "Rolar para a esquerda", dx: -1 },
        { lado: "dir" as const, ativo: dir, Icone: ChevronRight, rotulo: "Há mais conteúdo: rolar para a direita", dx: 1 },
      ].map(({ lado, ativo, Icone, rotulo: r, dx }) => (
        <button
          key={lado}
          type="button"
          tabIndex={-1}
          aria-hidden={!ativo}
          aria-label={r}
          data-seta={lado}
          onClick={() => ref.current?.scrollBy({ left: dx * Math.max(200, (ref.current?.clientWidth ?? 400) * 0.7), behavior: "smooth" })}
          className={clsx(
            "absolute top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border-light bg-surface-4/95 text-texto shadow-card transition-opacity hover:bg-surface-5",
            lado === "esq" ? "left-1" : "right-1",
            ativo ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <Icone className="h-4 w-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
