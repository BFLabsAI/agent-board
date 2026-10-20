import clsx from "clsx";
import type { EstadoTarefa, StatusAgente } from "../../api/tipos";
import { estiloStatus } from "../../lib/cores";

export function StatusDot({
  status,
  pulsar,
  className,
}: {
  status: StatusAgente | EstadoTarefa;
  pulsar?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-status={status}
      className={clsx("inline-block h-1.5 w-1.5 shrink-0 rounded-full", estiloStatus(status).ponto, pulsar && "animate-pulse-dot", className)}
    />
  );
}
