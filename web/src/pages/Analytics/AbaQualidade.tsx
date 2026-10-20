import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, TempoRelativo } from "../../components/ui";
import { formatarDataHora, formatarDuracaoMin, formatarPercentual, nomeCurto } from "../../lib/formato";
import type { Analytics } from "../../api/tipos";
import { CardGrafico, COR, EIXO, TooltipEscuro, diaCurto, diaLongo } from "./graficos";

export function AbaQualidade({ dados }: { dados: Analytics }) {
  const julgados = dados.por_agente
    .map((a) => ({ ...a, julgadas: a.aprovadas + a.rejeitadas, taxa: a.aprovadas + a.rejeitadas > 0 ? a.rejeitadas / (a.aprovadas + a.rejeitadas) : 0 }))
    .filter((a) => a.julgadas > 0)
    .sort((a, b) => b.taxa - a.taxa);
  const alertas = [...dados.alertas].sort((a, b) => b.ate.localeCompare(a.ate));
  const temVeredito = dados.ultimos_30d.some((d) => d.aprovadas + d.rejeitadas > 0);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <CardGrafico titulo="Taxa de rejeição por agente" subtitulo="Rejeitadas sobre revisadas, 30 dias">
        {julgados.length === 0 ? (
          <p className="py-10 text-center text-sm text-texto-fraco">Nenhuma entrega revisada no período.</p>
        ) : (
          <ul className="space-y-3.5">
            {julgados.map((a) => (
              <li key={a.agente} data-testid="taxa-rejeicao">
                <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-texto" title={a.agente}>{nomeCurto(a.agente)}</span>
                  <span className="shrink-0 font-mono text-texto">
                    {formatarPercentual(a.taxa)} <span className="text-xs text-texto-fraco">({a.rejeitadas}/{a.julgadas})</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(a.taxa > 0 ? 3 : 0, a.taxa * 100)}%`, background: a.taxa >= 0.3 ? COR.rejeitadas : a.taxa >= 0.15 ? "#fbbf24" : COR.aprovadas }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardGrafico>

      <CardGrafico titulo="Alertas de ping-pong" subtitulo="Pares que trocaram muitas mensagens em pouco tempo" className="xl:col-span-2">
        {alertas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <ShieldCheck className="h-8 w-8 text-emerald-400" aria-hidden="true" />
            <p className="text-sm text-texto">Nenhum ping-pong detectado</p>
            <p className="text-xs text-texto-fraco">Nenhum par de agentes entrou em vai-e-vem nos últimos 30 dias.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {alertas.map((a) => (
              <li key={`${a.de}-${a.para}-${a.ate}`} data-testid="alerta-pingpong" className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
                <span className="min-w-0 truncate text-texto">
                  {nomeCurto(a.de)} <span className="text-texto-fraco">⇄</span> {nomeCurto(a.para)}
                </span>
                <Badge tom="amarelo">{a.n} mensagens</Badge>
                <span className="text-xs text-texto-suave">em {formatarDuracaoMin(a.janela_min)}</span>
                <span className="ml-auto text-xs text-texto-fraco" title={formatarDataHora(a.ate)}>
                  até {formatarDataHora(a.ate)} · <TempoRelativo iso={a.ate} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardGrafico>

      <CardGrafico titulo="Aprovadas × rejeitadas por dia" subtitulo="Últimos 30 dias" className="xl:col-span-3">
        {!temVeredito ? (
          <p className="py-10 text-center text-sm text-texto-fraco">Nenhuma revisão registrada no período.</p>
        ) : (
          <>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={dados.ultimos_30d} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={COR.grade} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="dia" tickFormatter={diaCurto} minTickGap={28} {...EIXO} />
                  <YAxis allowDecimals={false} {...EIXO} />
                  <Tooltip content={<TooltipEscuro rotulo={diaLongo} />} cursor={{ fill: COR.cursor }} />
                  <Bar dataKey="aprovadas" name="Aprovadas" stackId="v" fill={COR.aprovadas} />
                  <Bar dataKey="rejeitadas" name="Rejeitadas" stackId="v" fill={COR.rejeitadas} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex gap-4 text-xs text-texto-suave">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR.aprovadas }} /> Aprovadas</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR.rejeitadas }} /> Rejeitadas</span>
            </div>
          </>
        )}
      </CardGrafico>
    </div>
  );
}
