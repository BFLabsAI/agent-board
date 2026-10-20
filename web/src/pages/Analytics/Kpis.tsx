import clsx from "clsx";
import { Bot, CheckCircle2, MessageSquare, PackageCheck, Timer } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card, Skeleton } from "../../components/ui";
import { formatarCompacto, formatarDuracaoMin, formatarNumero, formatarPercentual } from "../../lib/formato";
import type { Kpis } from "./calculos";

const TOM = {
  azul: { valor: "text-sky-400", icone: "text-sky-400", brilho: "from-sky-500/10" },
  verde: { valor: "text-emerald-400", icone: "text-emerald-400", brilho: "from-emerald-500/10" },
  roxo: { valor: "text-violet-300", icone: "text-violet-400", brilho: "from-violet-500/10" },
  amarelo: { valor: "text-amber-300", icone: "text-amber-400", brilho: "from-amber-500/10" },
  rosa: { valor: "text-fuchsia-300", icone: "text-fuchsia-400", brilho: "from-fuchsia-500/10" },
} as const;

export function KpiCard({
  rotulo, valor, sub, icone: Icone, tom, carregando, titulo,
}: { titulo?: string; rotulo: string; valor: ReactNode; sub?: ReactNode; icone: LucideIcon; tom: keyof typeof TOM; carregando: boolean }) {
  const t = TOM[tom];
  return (
    <Card className={clsx("bg-gradient-to-br to-transparent p-5 transition-colors hover:border-border-light", t.brilho)} data-testid="kpi" title={titulo}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-texto-suave whitespace-nowrap">{rotulo}</span>
        <Icone className={clsx("h-5 w-5", t.icone)} aria-hidden="true" />
      </div>
      {carregando ? (
        <>
          <Skeleton className="h-9 w-24" />
          <Skeleton className="mt-3 h-4 w-32" />
        </>
      ) : (
        <>
          <div className={clsx("text-3xl font-semibold leading-none", t.valor)}>{valor}</div>
          <div className="mt-3 text-sm text-texto-fraco">{sub}</div>
        </>
      )}
    </Card>
  );
}

export function GradeKpis({
  kpis, p50, p90, trabalhando, carregando,
}: { kpis: Kpis | null; p50: number | null; p90: number | null; trabalhando: number | null; carregando: boolean }) {
  const k = kpis;
  return (
    <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-5">
      <KpiCard rotulo="Mensagens" valor={k ? formatarCompacto(k.mensagens) : 0} sub={k ? `em 30 d · ~${k.mediaDia.toFixed(1).replace(".", ",")} por dia` : ""} icone={MessageSquare} tom="azul" carregando={carregando} />
      <KpiCard rotulo="Entregas" valor={k ? formatarNumero(k.entregas) : 0} sub={k ? `${formatarNumero(k.aprovadas)} aprovadas` : ""} icone={PackageCheck} tom="verde" carregando={carregando} />
      <KpiCard rotulo="Aprovação" valor={formatarPercentual(k?.taxaAprovacao)} sub={k ? `${formatarNumero(k.rejeitadas)} rejeitadas` : ""} icone={CheckCircle2} tom="roxo" carregando={carregando} />
      <KpiCard rotulo="Tempo de resposta" valor={formatarDuracaoMin(p50)} sub={`p50 · p90 ${formatarDuracaoMin(p90)}`} icone={Timer} tom="amarelo" carregando={carregando} />
      <KpiCard titulo="Agentes cadastrados com mensagens enviadas ou recebidas nos últimos 30 dias (o período global não se aplica a esta tela)" rotulo="Agentes ativos" valor={k ? k.ativos : 0} sub={k ? `de ${k.totalAgentes} cadastrados${trabalhando !== null ? ` · ${trabalhando} trabalhando` : ""}` : ""} icone={Bot} tom="rosa" carregando={carregando} />
    </div>
  );
}
