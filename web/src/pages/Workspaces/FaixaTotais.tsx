import clsx from "clsx";
import { AlertTriangle, Bot, ClipboardCheck, Globe2, Hourglass, LayoutGrid, Workflow, Zap, type LucideIcon } from "lucide-react";
import type { TotaisGeral, WorkspaceResumo } from "../../api/tipos";
import { formatarNumero } from "../../lib/formato";
import { TONS, type Tom } from "../Geral/Totais";

export function somarTotais(workspaces: WorkspaceResumo[]): TotaisGeral {
  const t: TotaisGeral = { squads: 0, agentes: 0, trabalhando: 0, esperando: 0, subagentes_rodando: 0, abertos: 0, atrasados: 0, revisao: 0, mensagens: 0 };
  for (const w of workspaces) {
    if (!w.online || !w.totais) continue;
    for (const k of Object.keys(t) as Array<keyof TotaisGeral>) t[k] += w.totais[k] ?? 0;
  }
  return t;
}

interface Item {
  id: string;
  rotulo: string;
  icone: LucideIcon;
  tom: Tom;
  alerta?: boolean;
  valor: (t: TotaisGeral, online: number) => number;
}

const ITENS: Item[] = [
  { id: "workspaces", rotulo: "Workspaces online", icone: Globe2, tom: "neutro", valor: (_t, o) => o },
  { id: "squads", rotulo: "Squads", icone: LayoutGrid, tom: "neutro", valor: (t) => t.squads },
  { id: "agentes", rotulo: "Agentes", icone: Bot, tom: "neutro", valor: (t) => t.agentes },
  { id: "trabalhando", rotulo: "Trabalhando agora", icone: Zap, tom: "verde", valor: (t) => t.trabalhando },
  { id: "esperando", rotulo: "Esperando você", icone: Hourglass, tom: "ambar", alerta: true, valor: (t) => t.esperando },
  { id: "subagentes_rodando", rotulo: "Sub-agents rodando", icone: Workflow, tom: "roxo", valor: (t) => t.subagentes_rodando },
  { id: "atrasados", rotulo: "Atrasados", icone: AlertTriangle, tom: "vermelho", alerta: true, valor: (t) => t.atrasados },
  { id: "revisao", rotulo: "Entregas p/ revisar", icone: ClipboardCheck, tom: "ambar", alerta: true, valor: (t) => t.revisao },
];

export function FaixaTotais({ workspaces }: { workspaces: WorkspaceResumo[] }) {
  const totais = somarTotais(workspaces);
  const online = workspaces.filter((w) => w.online).length;
  return (
    <section aria-label="Totais de todos os Workspaces" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 2xl:grid-cols-8">
      {ITENS.map(({ id, rotulo, icone: Icone, tom, alerta, valor }) => {
        const v = valor(totais, online);
        const aceso = !!alerta && v > 0;
        const t = TONS[tom];
        return (
          <div
            key={id}
            data-testid={`total-${id}`}
            data-destaque={aceso || undefined}
            className={clsx("rounded-xl border border-border bg-surface-3 px-4 py-3.5 shadow-card transition-colors", aceso && t.destaque)}
          >
            <div className="mb-2 flex min-h-[2rem] items-start justify-between gap-2">
              <span className="text-[10px] font-medium uppercase leading-tight tracking-[0.08em] text-texto-suave">{rotulo}</span>
              <Icone className={clsx("h-4 w-4 shrink-0", t.icone)} aria-hidden="true" />
            </div>
            <span className={clsx("text-2xl font-semibold leading-none tabular-nums", aceso ? t.valor : "text-texto")} aria-label={`${rotulo}: ${v}`}>
              {formatarNumero(v)}
              {id === "workspaces" && workspaces.length > online && (
                <span className="ml-1 text-sm font-medium text-texto-fraco">/ {workspaces.length}</span>
              )}
            </span>
          </div>
        );
      })}
    </section>
  );
}
