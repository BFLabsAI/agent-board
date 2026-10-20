import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icone: Icone,
  titulo,
  descricao,
  acao,
}: {
  icone: LucideIcon;
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center animate-fade-in">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-4 text-texto-fraco">
        <Icone className="h-6 w-6" aria-hidden="true" />
      </div>
      <h2 className="text-base font-medium text-texto">{titulo}</h2>
      {descricao && <p className="max-w-md text-sm text-texto-suave">{descricao}</p>}
      {acao}
    </div>
  );
}
