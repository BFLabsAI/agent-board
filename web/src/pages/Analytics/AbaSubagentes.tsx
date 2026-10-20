import { Clock, PlayCircle, TriangleAlert, Workflow } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Analytics } from "../../api/tipos";
import { AgentAvatar, EmptyState } from "../../components/ui";
import { formatarNumero, formatarPercentual, nomeCurto } from "../../lib/formato";
import { ESTILO_SUB, formatarSegundos } from "../../lib/subStatus";
import { CardGrafico, COR, EIXO, TooltipEscuro, diaCurto, diaLongo } from "./graficos";
import { KpiCard } from "./Kpis";

/** Cores dos tipos de sub-agent (família índigo/violeta/azul, como o resto do painel). */
const PALETA = ["#a78bfa", "#60a5fa", "#2dd4bf", "#f472b6", "#fbbf24", "#818cf8"];

type SubAnalytics = Analytics["subagentes"];

/** Tolera o servidor ainda sem o campo (ou com partes dele ausentes). */
export function normalizarSub(s: Partial<SubAnalytics> | null | undefined): SubAnalytics {
  return {
    por_agente: Array.isArray(s?.por_agente) ? s.por_agente : [],
    por_tipo: Array.isArray(s?.por_tipo) ? s.por_tipo : [],
    por_dia_30: Array.isArray(s?.por_dia_30) ? s.por_dia_30 : [],
  };
}

export function kpisSub(s: SubAnalytics) {
  const total = s.por_agente.reduce((n, a) => n + a.n, 0);
  const rodando = s.por_agente.reduce((n, a) => n + a.rodando, 0);
  const erro = s.por_agente.reduce((n, a) => n + a.erro, 0);
  const comDur = s.por_tipo.filter((t) => t.duracao_media_s !== null);
  const pesos = comDur.reduce((n, t) => n + t.n, 0);
  const duracao = pesos > 0 ? comDur.reduce((n, t) => n + (t.duracao_media_s as number) * t.n, 0) / pesos : null;
  return { total, rodando, erro, taxaErro: total > 0 ? erro / total : null, duracao };
}

export function AbaSubagentes({ dados }: { dados: Analytics }) {
  const sub = normalizarSub(dados.subagentes);
  const k = kpisSub(sub);
  if (k.total === 0 && sub.por_dia_30.every((d) => d.n === 0)) {
    return <EmptyState icone={Workflow} titulo="Nenhum sub-agent no período" descricao="Quando os agentes rodarem sub-agents (Agent/Task), o histórico aparece aqui." />;
  }
  const porAgente = [...sub.por_agente]
    .sort((a, b) => b.n - a.n)
    .map((a) => ({ ...a, nome: nomeCurto(a.agente), concluidos: Math.max(0, a.n - a.rodando - a.erro) }));
  const porTipo = [...sub.por_tipo].sort((a, b) => b.n - a.n);
  const totalTipos = porTipo.reduce((n, t) => n + t.n, 0);
  const cor = (i: number) => PALETA[i % PALETA.length];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard rotulo="Sub-agents" valor={formatarNumero(k.total)} sub="em 30 d" icone={Workflow} tom="roxo" carregando={false} />
        <KpiCard rotulo="Rodando agora" valor={formatarNumero(k.rodando)} sub={k.rodando === 1 ? "sub-agent ativo" : "sub-agents ativos"} icone={PlayCircle} tom="verde" carregando={false} />
        <KpiCard rotulo="Taxa de erro" valor={formatarPercentual(k.taxaErro, 1)} sub={`${formatarNumero(k.erro)} com erro`} icone={TriangleAlert} tom={k.erro > 0 ? "amarelo" : "azul"} carregando={false} />
        <KpiCard rotulo="Duração média" valor={formatarSegundos(k.duracao)} sub="por sub-agent" icone={Clock} tom="azul" carregando={false} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <CardGrafico titulo="Sub-agents por agente" subtitulo="Concluídos, rodando e com erro, 30 dias" className="xl:col-span-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={porAgente} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={COR.grade} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="nome" {...EIXO} />
                <YAxis allowDecimals={false} {...EIXO} />
                <Tooltip content={<TooltipEscuro rotulo={(l) => porAgente.find((a) => a.nome === l)?.agente ?? String(l)} />} cursor={{ fill: COR.cursor }} />
                <Bar dataKey="concluidos" name="Concluídos" stackId="s" fill="#a78bfa" />
                <Bar dataKey="rodando" name="Rodando" stackId="s" fill={ESTILO_SUB.rodando.hex} />
                <Bar dataKey="erro" name="Erro" stackId="s" fill={ESTILO_SUB.erro.hex} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex gap-4 text-xs text-texto-suave">
            {[["#a78bfa", "Concluídos"], [ESTILO_SUB.rodando.hex, "Rodando"], [ESTILO_SUB.erro.hex, "Erro"]].map(([c, r]) => (
              <span key={r} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} /> {r}</span>
            ))}
          </div>
        </CardGrafico>

        <CardGrafico titulo="Por tipo" subtitulo="Últimos 30 dias">
          {totalTipos === 0 ? (
            <p className="py-16 text-center text-sm text-texto-fraco">Sem sub-agents no período.</p>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="relative h-40 w-40 shrink-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <PieChart>
                    <Pie isAnimationActive={false} data={porTipo} dataKey="n" nameKey="tipo" innerRadius={50} outerRadius={72} paddingAngle={2} stroke="none">
                      {porTipo.map((t, i) => <Cell key={t.tipo} fill={cor(i)} />)}
                    </Pie>
                    <Tooltip content={<TooltipEscuro />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-semibold text-texto">{formatarNumero(totalTipos)}</span>
                  <span className="text-[11px] text-texto-fraco">total</span>
                </div>
              </div>
              <ul className="w-full space-y-1.5 text-sm" data-testid="legenda-tipos">
                {porTipo.map((t, i) => (
                  <li key={t.tipo} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: cor(i) }} />
                    <span className="truncate font-mono text-xs text-texto-suave">{t.tipo}</span>
                    <span className="ml-auto font-mono text-texto">{formatarNumero(t.n)}</span>
                    <span className="w-10 text-right font-mono text-xs text-texto-fraco">{Math.round((t.n / totalTipos) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardGrafico>

        <CardGrafico titulo="Sub-agents por dia" subtitulo="Últimos 30 dias" className="xl:col-span-3">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={sub.por_dia_30} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={COR.grade} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="dia" tickFormatter={diaCurto} minTickGap={28} {...EIXO} />
                <YAxis allowDecimals={false} {...EIXO} />
                <Tooltip content={<TooltipEscuro rotulo={diaLongo} />} cursor={{ stroke: COR.grade }} />
                <Line type="monotone" dataKey="n" name="Sub-agents" stroke="#a78bfa" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardGrafico>

        <CardGrafico titulo="Duração média por tipo" subtitulo="Tempo de cada sub-agent concluído" className="xl:col-span-1">
          <table className="w-full text-sm" data-testid="tabela-tipos">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-[0.1em] text-texto-fraco">
                <th className="pb-2 font-medium">Tipo</th>
                <th className="pb-2 text-right font-medium">Sub-agents</th>
                <th className="pb-2 text-right font-medium">Duração</th>
              </tr>
            </thead>
            <tbody>
              {porTipo.map((t, i) => (
                <tr key={t.tipo} className="border-b border-border/50 last:border-0 hover:bg-surface-4/60">
                  <td className="py-2.5"><span className="inline-flex items-center gap-2 font-mono text-xs text-texto"><span className="h-2 w-2 rounded-sm" style={{ background: cor(i) }} />{t.tipo}</span></td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-texto">{t.n}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-texto-suave">{formatarSegundos(t.duracao_media_s)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardGrafico>

        <CardGrafico titulo="Duração média por agente" subtitulo="Quem roda mais e quanto demora" className="xl:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm" data-testid="tabela-agentes">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-[0.1em] text-texto-fraco">
                  <th className="pb-2 font-medium">Agente</th>
                  {["Sub-agents", "Rodando", "Erro", "Duração"].map((c) => <th key={c} className="pb-2 text-right font-medium">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {porAgente.map((a) => (
                  <tr key={a.agente} className="border-b border-border/50 last:border-0 hover:bg-surface-4/60">
                    <td className="py-2.5">
                      <div className="flex items-center gap-2.5">
                        <AgentAvatar nome={a.agente} tamanho={24} />
                        <span className="truncate text-texto" title={a.agente}>{a.nome}</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-texto">{a.n}</td>
                    <td className={`py-2.5 text-right font-mono tabular-nums ${a.rodando > 0 ? "text-emerald-400" : "text-texto-fraco"}`}>{a.rodando}</td>
                    <td className={`py-2.5 text-right font-mono tabular-nums ${a.erro > 0 ? "text-rose-400" : "text-texto-fraco"}`}>{a.erro}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-texto-suave">{formatarSegundos(a.duracao_media_s)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardGrafico>
      </div>
    </div>
  );
}
