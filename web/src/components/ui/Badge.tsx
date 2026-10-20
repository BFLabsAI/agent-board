import clsx from "clsx";
import type { ReactNode } from "react";
import type { EstadoTarefa, Mensagem, StatusAgente } from "../../api/tipos";
import { chaveTipoMsg, ESTILO_TIPO_MSG, estiloStatus } from "../../lib/cores";
import { StatusDot } from "./StatusDot";

const TONS = {
  neutro: "text-gray-300 bg-surface-4 border-border",
  accent: "text-accent-hover bg-accent-muted border-accent/30",
  verde: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  amarelo: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  vermelho: "text-red-300 bg-red-500/10 border-red-500/30",
  azul: "text-sky-300 bg-sky-500/10 border-sky-500/30",
} as const;
export type TomBadge = keyof typeof TONS;

export function Badge({ tom = "neutro", className, children }: { tom?: TomBadge; className?: string; children: ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium",
        TONS[tom],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Badge com bolinha, colorido pelo status do agente ou pelo estado da tarefa. */
export function StatusBadge({
  status,
  rotulo,
  className,
}: {
  status: StatusAgente | EstadoTarefa;
  rotulo?: string;
  className?: string;
}) {
  const e = estiloStatus(status);
  return (
    <span
      data-status={status}
      className={clsx(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium",
        e.texto, e.fundo, e.borda, className,
      )}
    >
      <StatusDot status={status} pulsar={status === "trabalhando"} />
      {rotulo ?? e.rotulo}
    </span>
  );
}

/** Badge do tipo da mensagem (pedido, andamento, entrega, resposta, rejeição). */
export function TipoMsgBadge({ mensagem, className }: { mensagem: Pick<Mensagem, "tipo" | "veredito">; className?: string }) {
  const chave = chaveTipoMsg(mensagem);
  const e = ESTILO_TIPO_MSG[chave];
  const rotulo = chave === "nota" && mensagem.tipo !== "nota" ? mensagem.tipo : e.rotulo;
  return (
    <span
      data-tipo={chave}
      className={clsx(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium",
        e.texto, e.fundo, e.borda, className,
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", e.ponto)} />
      {rotulo}
    </span>
  );
}
