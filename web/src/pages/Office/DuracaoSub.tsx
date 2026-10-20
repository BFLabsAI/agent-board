import type { SubAgente } from "../../api/tipos";
import { textoDuracao, useAgora } from "./subagentes";

/** Duração do sub-agent; relógio de 1 s só enquanto ele roda. */
export function DuracaoSub({ sub, className }: { sub: SubAgente; className?: string }) {
  const rodando = sub.status === "rodando";
  const agora = useAgora(rodando);
  return (
    <span className={className} data-testid="duracao-sub" data-ao-vivo={rodando || undefined}>
      {textoDuracao(sub, agora)}
    </span>
  );
}
