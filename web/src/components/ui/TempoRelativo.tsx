import { useEffect, useState } from "react";
import { formatarDataHora, tempoRelativo } from "../../lib/formato";

/** Relógio compartilhado: um único intervalo para todos os componentes. */
const assinantes = new Set<(agora: number) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function assinar(fn: (agora: number) => void): () => void {
  assinantes.add(fn);
  if (!timer) timer = setInterval(() => assinantes.forEach((f) => f(Date.now())), 15_000);
  return () => {
    assinantes.delete(fn);
    if (assinantes.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useAgora(): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => assinar(setAgora), []);
  return agora;
}

/** "há 4 min", atualizando sozinho. O tooltip nativo traz a data completa. */
export function TempoRelativo({ iso, className }: { iso: string | null | undefined; className?: string }) {
  const agora = useAgora();
  if (!iso) return <span className={className}>—</span>;
  return (
    <time dateTime={iso} title={formatarDataHora(iso)} className={className}>
      {tempoRelativo(iso, agora)}
    </time>
  );
}
