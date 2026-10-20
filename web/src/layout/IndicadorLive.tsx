import clsx from "clsx";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { useStream } from "../api/useStream";

const ROTULOS = {
  conectado: "Live",
  conectando: "Conectando",
  reconectando: "Reconectando",
  offline: "Offline",
} as const;

export function IndicadorLive({ versao, recolhido }: { versao?: string; recolhido?: boolean }) {
  const { status } = useStream();
  const ok = status === "conectado";
  const Icone = ok ? Wifi : status === "offline" ? WifiOff : RefreshCw;
  return (
    <div
      role="status"
      aria-live="polite"
      data-status={status}
      className={clsx(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
        ok && "border-emerald-500/25 bg-emerald-500/5 text-emerald-400",
        (status === "reconectando" || status === "conectando") && "border-amber-500/25 bg-amber-500/5 text-amber-400",
        status === "offline" && "border-red-500/25 bg-red-500/5 text-red-400",
        recolhido && "justify-center px-0",
      )}
    >
      <Icone className={clsx("h-4 w-4 shrink-0", (status === "reconectando" || status === "conectando") && "animate-spin")} aria-hidden="true" />
      {!recolhido && (
        <>
          <span className="font-medium">{ROTULOS[status]}</span>
          {versao && <span className="ml-auto text-xs text-texto-fraco">v{versao}</span>}
        </>
      )}
      {recolhido && <span className="sr-only">{ROTULOS[status]}</span>}
    </div>
  );
}
