import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "./Card";
import { Skeleton } from "./Skeleton";

export const TONS_ICONE = {
  accent: "text-accent-hover",
  verde: "text-emerald-400",
  amarelo: "text-amber-400",
  laranja: "text-orange-400",
  vermelho: "text-red-400",
  azul: "text-sky-400",
  roxo: "text-violet-400",
  cinza: "text-gray-400",
} as const;
export type TomIcone = keyof typeof TONS_ICONE;

export function StatCard({
  rotulo,
  valor,
  icone: Icone,
  tom = "accent",
  subtexto,
  carregando,
}: {
  rotulo: string;
  valor: ReactNode;
  icone: LucideIcon;
  tom?: TomIcone;
  subtexto?: ReactNode;
  carregando?: boolean;
}) {
  return (
    <Card className="p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-texto-suave">{rotulo}</span>
        <Icone className={clsx("h-5 w-5", TONS_ICONE[tom])} aria-hidden="true" />
      </div>
      {carregando ? (
        <Skeleton className="h-9 w-24" />
      ) : (
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold leading-none text-texto">{valor}</span>
          {subtexto && <span className="text-sm text-texto-fraco">{subtexto}</span>}
        </div>
      )}
    </Card>
  );
}
