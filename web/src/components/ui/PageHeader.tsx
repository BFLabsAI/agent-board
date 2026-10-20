import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader({
  icone: Icone,
  titulo,
  subtitulo,
  acoes,
}: {
  icone: LucideIcon;
  titulo: string;
  subtitulo?: string;
  acoes?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent-muted text-accent-hover">
          <Icone className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold leading-tight text-texto">{titulo}</h1>
          {subtitulo && <p className="truncate text-sm text-texto-suave">{subtitulo}</p>}
        </div>
      </div>
      {acoes && <div className="flex shrink-0 items-center gap-2">{acoes}</div>}
    </header>
  );
}
