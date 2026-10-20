import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AgentAvatar, EmptyState } from "../../components/ui";
import { Users } from "lucide-react";
import { formatarDuracaoMin, nomeCurto } from "../../lib/formato";
import type { Analytics } from "../../api/tipos";
import { CardGrafico, COR, EIXO, TooltipEscuro } from "./graficos";

type PorAgente = Analytics["por_agente"][number];

export function AbaAgentes({ dados }: { dados: Analytics }) {
  const agentes = dados.por_agente;
  if (agentes.length === 0) {
    return <EmptyState icone={Users} titulo="Nenhum agente com atividade" descricao="Quando o time trocar mensagens, os números por agente aparecem aqui." />;
  }
  const grafico = agentes.map((a) => ({ ...a, nome: nomeCurto(a.agente) }));
  const ranking = agentes.filter((a) => a.p50_min !== null).sort((a, b) => (a.p50_min as number) - (b.p50_min as number));
  const maxTempo = Math.max(1, ...ranking.map((a) => a.p90_min ?? a.p50_min ?? 0));

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <CardGrafico titulo="Mensagens por agente" subtitulo="Enviadas, recebidas e entregas, 30 dias" className="xl:col-span-2">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={grafico} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={COR.grade} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="nome" {...EIXO} />
              <YAxis allowDecimals={false} {...EIXO} />
              <Tooltip content={<TooltipEscuro rotulo={(l) => agentes.find((a) => nomeCurto(a.agente) === l)?.agente ?? String(l)} />} cursor={{ fill: COR.cursor }} />
              <Bar dataKey="enviadas" name="Enviadas" fill={COR.enviadas} radius={[3, 3, 0, 0]} />
              <Bar dataKey="recebidas" name="Recebidas" fill={COR.recebidas} radius={[3, 3, 0, 0]} />
              <Bar dataKey="entregas" name="Entregas" fill={COR.entregas} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex gap-4 text-xs text-texto-suave">
          {[
            [COR.enviadas, "Enviadas"],
            [COR.recebidas, "Recebidas"],
            [COR.entregas, "Entregas"],
          ].map(([cor, r]) => (
            <span key={r} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: cor }} /> {r}
            </span>
          ))}
        </div>
      </CardGrafico>

      <CardGrafico titulo="Tempo de resposta" subtitulo="Ranking pela mediana (p50); a marca é o p90">
        {ranking.length === 0 ? (
          <p className="py-10 text-center text-sm text-texto-fraco">Sem respostas medidas no período.</p>
        ) : (
          <ol className="space-y-3">
            {ranking.map((a, i) => (
              <li key={a.agente} data-testid="rank-tempo">
                <div className="mb-1 flex items-center gap-2 text-sm">
                  <span className="w-4 font-mono text-xs text-texto-fraco">{i + 1}</span>
                  <span className="truncate text-texto" title={a.agente}>{nomeCurto(a.agente)}</span>
                  <span className="ml-auto font-mono text-texto">{formatarDuracaoMin(a.p50_min)}</span>
                  <span className="font-mono text-xs text-texto-fraco">p90 {formatarDuracaoMin(a.p90_min)}</span>
                </div>
                <div className="relative h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-accent-hover/80 transition-all duration-500" style={{ width: `${((a.p50_min as number) / maxTempo) * 100}%` }} />
                  {a.p90_min !== null && <div className="absolute top-0 h-full w-0.5 bg-amber-400" style={{ left: `calc(${(a.p90_min / maxTempo) * 100}% - 1px)` }} />}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardGrafico>

      <CardGrafico titulo="Detalhe por agente" subtitulo="Últimos 30 dias" className="xl:col-span-3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-[0.1em] text-texto-fraco">
                <th className="pb-2 font-medium">Agente</th>
                {["Enviadas", "Recebidas", "Entregas", "Aprovadas", "Rejeitadas", "p50", "p90"].map((c) => (
                  <th key={c} className="pb-2 text-right font-medium">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agentes.map((a) => (
                <LinhaAgente key={a.agente} a={a} />
              ))}
            </tbody>
          </table>
        </div>
      </CardGrafico>
    </div>
  );
}

function LinhaAgente({ a }: { a: PorAgente }) {
  const num = "py-2.5 text-right font-mono tabular-nums";
  return (
    <tr className="border-b border-border/50 transition-colors last:border-0 hover:bg-surface-4/60">
      <td className="py-2.5">
        <div className="flex items-center gap-2.5">
          <AgentAvatar nome={a.agente} tamanho={28} />
          <span className="truncate text-texto" title={a.agente}>{nomeCurto(a.agente)}</span>
        </div>
      </td>
      <td className={`${num} text-texto`}>{a.enviadas}</td>
      <td className={`${num} text-texto`}>{a.recebidas}</td>
      <td className={`${num} text-texto`}>{a.entregas}</td>
      <td className={`${num} text-emerald-400`}>{a.aprovadas}</td>
      <td className={`${num} ${a.rejeitadas > 0 ? "text-rose-400" : "text-texto-fraco"}`}>{a.rejeitadas}</td>
      <td className={`${num} text-texto-suave`}>{formatarDuracaoMin(a.p50_min)}</td>
      <td className={`${num} text-texto-suave`}>{formatarDuracaoMin(a.p90_min)}</td>
    </tr>
  );
}
