import type { SubAgente } from "../../api/tipos";
import { textoDuracao, useAgora } from "./subagentes";

/** Duração do sub-agent; relógio de 1 s só enquanto ele roda. Sem duração, não renderiza nada. */
export function DuracaoSub({ sub, className }: { sub: SubAgente; className?: string }) {
  const rodando = sub.status === "rodando";
  const agora = useAgora(rodando);
  const t = textoDuracao(sub, agora);
  if (t === null) return null;
  return (
    <span className={className} data-testid="duracao-sub" data-ao-vivo={rodando || undefined}>
      {t}
    </span>
  );
}
