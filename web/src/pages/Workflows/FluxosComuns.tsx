import { ArrowRight } from "lucide-react";
import clsx from "clsx";
import type { Workflows } from "../../api/tipos";
import { ESTILO_TIPO_MSG } from "../../lib/cores";
import { formatarNumero } from "../../lib/formato";
import { chipDoTipo } from "./derivar";

export function FluxosComuns({ fluxos }: { fluxos: Workflows["fluxos"] }) {
  const max = Math.max(1, ...fluxos.map((f) => f.n));
  const total = fluxos.reduce((s, f) => s + f.n, 0) || 1;
  return (
    <ol className="divide-y divide-border" aria-label="Fluxos mais comuns">
      {fluxos.map((f, i) => (
        <li key={f.sequencia.join(">")} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-4/40" data-testid="fluxo">
          <span className="w-6 shrink-0 text-center text-sm font-semibold text-texto-fraco">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {f.sequencia.map((t, j) => {
                const c = chipDoTipo(t);
                const e = ESTILO_TIPO_MSG[c.chave];
                return (
                  <span key={j} className="inline-flex items-center gap-1.5">
                    {j > 0 && <ArrowRight className="h-3.5 w-3.5 text-texto-fraco" aria-label="depois" />}
                    <span className={clsx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", e.texto, e.fundo, e.borda)}>
                      <span className={clsx("h-1.5 w-1.5 rounded-full", e.ponto)} />
                      {c.rotulo}
                    </span>
                  </span>
                );
              })}
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-1" role="presentation">
              <div className="h-full rounded-full bg-gradient-to-r from-accent to-sky-400 transition-[width] duration-500" style={{ width: `${(f.n / max) * 100}%` }} />
            </div>
          </div>
          <div className="w-20 shrink-0 text-right">
            <p className="text-lg font-semibold leading-tight text-texto">{formatarNumero(f.n)}</p>
            <p className="text-[11px] text-texto-fraco">{Math.round((f.n / total) * 100)}% do total</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
