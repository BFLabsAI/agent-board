import clsx from "clsx";
import type { HTMLAttributes } from "react";

interface Props extends HTMLAttributes<HTMLDivElement> {
  /** realça a borda ao passar o mouse (cards clicáveis) */
  interativo?: boolean;
  semPadding?: boolean;
}

export function Card({ interativo, semPadding, className, ...resto }: Props) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-border bg-surface-3 shadow-card",
        !semPadding && "p-5",
        interativo && "transition-all duration-200 hover:border-border-light hover:bg-surface-4",
        className,
      )}
      {...resto}
    />
  );
}
