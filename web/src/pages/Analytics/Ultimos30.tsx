import { Card } from "../../components/ui";
import { formatarNumero } from "../../lib/formato";
import type { Analytics } from "../../api/tipos";
import { diaCurto, diaLongo } from "./graficos";

export function Ultimos30({ dias }: { dias: Analytics["ultimos_30d"] }) {
  const total = dias.reduce((s, d) => s + d.mensagens, 0);
  const pico = dias.reduce<Analytics["ultimos_30d"][number] | null>((m, d) => (!m || d.mensagens > m.mensagens ? d : m), null);
  const max = pico?.mensagens ?? 0;
  return (
    <Card className="flex min-w-0 flex-col">
      <h3 className="text-base font-semibold text-texto">Últimos 30 dias</h3>
      <p className="mb-4 mt-0.5 text-xs text-texto-fraco">Mensagens por dia</p>
      {dias.length === 0 || total === 0 ? (
        <p className="flex flex-1 items-center justify-center py-10 text-sm text-texto-fraco">Nenhuma mensagem no período.</p>
      ) : (
        <>
          <div className="flex h-28 items-end gap-[3px]" role="img" aria-label={`Mensagens por dia nos últimos 30 dias, pico de ${max}`}>
            {dias.map((d) => (
              <div
                key={d.dia}
                data-testid="barra-dia"
                title={`${diaLongo(d.dia)}: ${d.mensagens} mensagens`}
                className="min-w-0 flex-1 rounded-t-sm bg-accent/70 transition-colors hover:bg-accent-hover"
                style={{ height: `${Math.max(d.mensagens > 0 ? 4 : 1, (d.mensagens / max) * 100)}%`, opacity: d.mensagens > 0 ? 1 : 0.3 }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-texto-fraco">
            <span>{diaCurto(dias[0].dia)}</span>
            <span>{diaCurto(dias[dias.length - 1].dia)}</span>
          </div>
        </>
      )}
      <dl className="mt-auto space-y-1.5 border-t border-border pt-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-texto-fraco">Dia de pico</dt>
          <dd className="font-mono text-texto">{pico && max > 0 ? `${diaCurto(pico.dia)} · ${formatarNumero(max)}` : "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-texto-fraco">Total (30 d)</dt>
          <dd className="font-mono text-texto">{formatarNumero(total)} mensagens</dd>
        </div>
      </dl>
    </Card>
  );
}
