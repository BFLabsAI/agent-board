import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ESTILO_TIPO_MSG, chaveTipoMsg } from "../../lib/cores";
import { formatarNumero } from "../../lib/formato";
import type { Analytics } from "../../api/tipos";
import { CardGrafico, COR, EIXO, TooltipEscuro, diaCurto, diaLongo } from "./graficos";

export function AbaAtividade({ dados }: { dados: Analytics }) {
  const tipos = [...dados.tipos].sort((a, b) => b.n - a.n);
  const totalTipos = tipos.reduce((s, t) => s + t.n, 0);
  const horas = dados.horas.map((n, h) => ({ hora: `${String(h).padStart(2, "0")}h`, n }));
  const maxHora = Math.max(0, ...dados.horas);
  const picoHora = maxHora > 0 ? dados.horas.indexOf(maxHora) : -1;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <CardGrafico titulo="Mensagens e entregas por dia" subtitulo="Últimos 30 dias" className="xl:col-span-2">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={dados.ultimos_30d} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={COR.grade} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="dia" tickFormatter={diaCurto} minTickGap={28} {...EIXO} />
              <YAxis allowDecimals={false} {...EIXO} />
              <Tooltip content={<TooltipEscuro rotulo={diaLongo} />} cursor={{ stroke: COR.grade }} />
              <Line type="monotone" dataKey="mensagens" name="Mensagens" stroke={COR.mensagens} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="entregas" name="Entregas" stroke={COR.entregas} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex gap-4 text-xs text-texto-suave">
          <Legenda cor={COR.mensagens} rotulo="Mensagens" />
          <Legenda cor={COR.entregas} rotulo="Entregas" />
        </div>
      </CardGrafico>

      <CardGrafico titulo="Tipos de mensagem" subtitulo="Últimos 30 dias">
        {totalTipos === 0 ? (
          <p className="py-16 text-center text-sm text-texto-fraco">Sem mensagens no período.</p>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="relative h-40 w-40 shrink-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie isAnimationActive={false} data={tipos} dataKey="n" nameKey="tipo" innerRadius={50} outerRadius={72} paddingAngle={2} stroke="none">
                    {tipos.map((t) => (
                      <Cell key={t.tipo} fill={ESTILO_TIPO_MSG[chaveTipoMsg({ tipo: t.tipo })].hex} />
                    ))}
                  </Pie>
                  <Tooltip content={<TooltipEscuro />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-semibold text-texto">{formatarNumero(totalTipos)}</span>
                <span className="text-[11px] text-texto-fraco">total</span>
              </div>
            </div>
            <ul className="w-full space-y-1.5 text-sm">
              {tipos.map((t) => (
                <li key={t.tipo} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ESTILO_TIPO_MSG[chaveTipoMsg({ tipo: t.tipo })].hex }} />
                  <span className="truncate text-texto-suave">{t.tipo}</span>
                  <span className="ml-auto font-mono text-texto">{formatarNumero(t.n)}</span>
                  <span className="w-10 text-right font-mono text-xs text-texto-fraco">{Math.round((t.n / totalTipos) * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardGrafico>

      <CardGrafico titulo="Mensagens por hora do dia" subtitulo={picoHora >= 0 ? `Horário de pico: ${String(picoHora).padStart(2, "0")}h (${formatarNumero(maxHora)} mensagens)` : "Últimos 30 dias"} className="xl:col-span-3">
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={horas} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={COR.grade} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="hora" interval={1} {...EIXO} />
              <YAxis allowDecimals={false} {...EIXO} />
              <Tooltip content={<TooltipEscuro />} cursor={{ fill: COR.cursor }} />
              <Bar dataKey="n" name="Mensagens" radius={[3, 3, 0, 0]}>
                {horas.map((h, i) => (
                  <Cell key={h.hora} fill={i === picoHora ? "#a5b4fc" : COR.mensagens} fillOpacity={i === picoHora ? 1 : 0.7} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardGrafico>
    </div>
  );
}

function Legenda({ cor, rotulo }: { cor: string; rotulo: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-0.5 w-4 rounded" style={{ background: cor }} /> {rotulo}
    </span>
  );
}
