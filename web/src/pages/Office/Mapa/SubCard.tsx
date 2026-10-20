import clsx from "clsx";
import type { SubAgente } from "../../../api/tipos";
import { DuracaoSub } from "../DuracaoSub";
import { clarear, descricaoSub, ESTILO_SUB, nomeSub, tipoDetalhe, textoAtividade } from "../subagentes";
import { truncar } from "../../../lib/formato";
import { alturaSub } from "./layout";

/**
 * Sub-card de sub-agent em destaque (rodando ou perdido), sob o pai. Só mostra as linhas que existem:
 * descrição, atividade e duração ausentes não ganham placeholder.
 */
export function SubCard({ sub, corPai, largura, aoAbrir }: { sub: SubAgente; corPai: string; largura: number; aoAbrir: (id: string) => void }) {
  const e = ESTILO_SUB[sub.status];
  const tipo = nomeSub(sub);
  const detalhe = tipoDetalhe(sub);
  const descricao = descricaoSub(sub);
  const atividade = textoAtividade(sub);
  return (
    <button
      type="button"
      data-testid="sub-card"
      data-sub={sub.id}
      data-status={sub.status}
      onClick={() => aoAbrir(sub.id)}
      aria-label={`Sub-agent ${tipo}, ${e.rotulo}${descricao ? `: ${descricao}` : ""}`}
      title={[tipo, detalhe, descricao, atividade].filter(Boolean).join("\n")}
      style={{
        width: largura,
        height: alturaSub(sub),
        borderTopColor: clarear(corPai, 0.4),
        ...(sub.status === "rodando" ? { boxShadow: `0 0 0 1px ${e.hex}33, 0 6px 18px -10px ${e.hex}` } : null),
      }}
      className={clsx(
        "flex flex-col justify-center gap-[3px] rounded-lg border border-t-[3px] bg-surface-2/95 px-2.5 text-left transition-colors",
        "hover:bg-surface-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        sub.status === "perdido" ? "border-dashed border-amber-400/50" : "border-border",
      )}
    >
      <span className="flex h-4 items-center gap-1.5 text-[11px] leading-none">
        <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", sub.status === "rodando" && "animate-pulse-dot")} style={{ background: e.hex }} aria-hidden="true" />
        <span className="min-w-0 truncate font-semibold text-texto">{tipo}</span>
        {detalhe && <span className="min-w-0 flex-1 truncate text-[10px] text-texto-fraco" data-testid="sub-tipo">{detalhe}</span>}
        {!detalhe && <span className="flex-1" />}
        {sub.status === "perdido" && <span className={clsx("shrink-0", e.texto)}>{e.rotulo}</span>}
        <DuracaoSub sub={sub} className="shrink-0 font-mono tabular-nums text-texto-suave" />
      </span>
      {descricao && <span className="block h-[17px] truncate text-[11px] leading-[17px] text-texto-suave">{truncar(descricao, 90)}</span>}
      {atividade && (
        <span className="block h-[15px] truncate font-mono text-[10px] leading-[15px] text-texto-fraco" data-testid="sub-atividade">
          {atividade}
        </span>
      )}
    </button>
  );
}
