import { BarChart3, Clock, Download, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useStream } from "../../api/useStream";
import { Badge } from "../../components/ui";

function Relogio() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1 font-mono text-xs text-texto-suave"
      data-testid="relogio"
    >
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      <time dateTime={agora.toISOString()}>{agora.toLocaleTimeString("pt-BR")}</time>
    </span>
  );
}

const BOTAO =
  "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-texto-suave transition-colors hover:bg-surface-4 hover:text-texto disabled:pointer-events-none disabled:opacity-40";

export function Cabecalho({
  onRecarregar,
  onExportar,
  recarregando,
  semDados,
}: {
  onRecarregar: () => void;
  onExportar: () => void;
  recarregando: boolean;
  semDados: boolean;
}) {
  const { status } = useStream();
  const vivo = status === "conectado";
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent-muted text-accent-hover">
          <BarChart3 className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold leading-tight text-texto">Analytics</h1>
            <Badge tom={vivo ? "verde" : "amarelo"}>
              <span className={vivo ? "h-1.5 w-1.5 animate-pulse-dot rounded-full bg-emerald-400" : "h-1.5 w-1.5 rounded-full bg-amber-400"} />
              {vivo ? "Live" : status === "offline" ? "Offline" : "Conectando"}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <p
              className="text-sm text-texto-suave"
              title="Esta tela é fixa nos últimos 30 dias: o seletor de período da barra lateral não se aplica aqui."
              data-testid="subtitulo-30d"
            >
              Volume, tempos e rejeições do time · fixo em 30 dias (ignora o período global)
            </p>
            <Relogio />
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" onClick={onRecarregar} className={BOTAO}>
          <RefreshCw className={recarregando ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" /> Recarregar
        </button>
        <button type="button" onClick={onExportar} disabled={semDados} className={BOTAO}>
          <Download className="h-4 w-4" aria-hidden="true" /> Exportar
        </button>
      </div>
    </header>
  );
}
