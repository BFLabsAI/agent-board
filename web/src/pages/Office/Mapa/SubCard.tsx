import clsx from "clsx";
import type { SubAgente } from "../../../api/tipos";
import { DuracaoSub } from "../DuracaoSub";
import { clarear, ESTILO_SUB, textoAtividade } from "../subagentes";
import { truncar } from "../../../lib/formato";
import { L } from "./layout";

/** Cartão menor pendurado sob o pai: borda superior no tom claro da cor do pai, status por cor. */
export function SubCard({ sub, corPai, aoAbrir }: { sub: SubAgente; corPai: string; aoAbrir: (id: string) => void }) {
  const e = ESTILO_SUB[sub.status];
  const tipo = sub.tipo ?? "sub-agent";
  return (
    <button
      type="button"
      data-testid="sub-card"
      data-sub={sub.id}
      data-status={sub.status}
      onClick={() => aoAbrir(sub.id)}
      aria-label={`Sub-agent ${tipo}, ${e.rotulo}${sub.descricao ? `: ${sub.descricao}` : ""}`}
      title={`${tipo} · ${sub.descricao ?? ""}\n${textoAtividade(sub)}`}
      style={{
        width: L.subW,
        height: L.subAlt,
        borderTopColor: clarear(corPai, 0.4),
        ...(sub.status === "rodando" ? { boxShadow: `0 0 0 1px ${e.hex}33, 0 6px 18px -10px ${e.hex}` } : null),
      }}
      className={clsx(
        "flex flex-col justify-between rounded-lg border border-t-[3px] bg-surface-2/95 px-2.5 py-1.5 text-left transition-colors",
        "hover:bg-surface-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        sub.status === "perdido" ? "border-dashed border-amber-400/50" : sub.status === "erro" ? "border-red-400/50" : "border-border",
        sub.status === "concluido" && "opacity-80",
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] leading-none">
        <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", sub.status === "rodando" && "animate-pulse-dot")} style={{ background: e.hex }} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-semibold text-texto">{tipo}</span>
        <span className={clsx("shrink-0", e.texto)}>{e.rotulo}</span>
      </span>
      <span className="line-clamp-2 text-[11px] leading-tight text-texto-suave">{truncar(sub.descricao, 70) || "sem descrição"}</span>
      <span className="flex items-center gap-2 text-[10px] leading-none text-texto-fraco">
        <span className="min-w-0 flex-1 truncate font-mono" data-testid="sub-atividade">{textoAtividade(sub)}</span>
        <DuracaoSub sub={sub} className="shrink-0 font-mono tabular-nums text-texto-suave" />
      </span>
    </button>
  );
}
