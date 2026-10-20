import { GitBranch } from "lucide-react";
import type { Tarefa } from "../../../api/tipos";
import { StatusDot } from "../../../components/ui";
import { estiloStatus } from "../../../lib/cores";
import { truncar } from "../../../lib/formato";
import { L } from "./layout";

/** Cartão pequeno pendurado sob o agente: assunto truncado, estado e issue. Só texto, nada de HTML da API. */
export function CartaoTarefa({ tarefa }: { tarefa: Tarefa }) {
  const e = estiloStatus(tarefa.estado);
  return (
    <div
      data-testid="cartao-tarefa"
      data-estado={tarefa.estado}
      title={tarefa.assunto}
      style={{ height: L.tarefaAlt }}
      className="relative flex flex-col justify-center gap-1 rounded-lg border border-border bg-surface-2/95 px-2.5 text-left shadow-card before:absolute before:-left-[15px] before:top-1/2 before:h-px before:w-[14px] before:bg-border-light"
    >
      <span className="line-clamp-1 text-[12px] font-medium leading-tight text-texto">{truncar(tarefa.assunto, 56)}</span>
      <span className="flex items-center gap-2 text-[11px] leading-none">
        <span className={`inline-flex items-center gap-1.5 ${e.texto}`}>
          <StatusDot status={tarefa.estado} />
          {e.rotulo}
        </span>
        {tarefa.issues.length > 0 && (
          <span className="inline-flex items-center gap-0.5 font-mono text-texto-fraco">
            <GitBranch className="h-3 w-3" aria-hidden="true" />#{tarefa.issues[0]}
            {tarefa.issues.length > 1 && <span>+{tarefa.issues.length - 1}</span>}
          </span>
        )}
      </span>
    </div>
  );
}
