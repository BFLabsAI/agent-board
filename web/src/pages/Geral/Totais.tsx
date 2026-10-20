import clsx from "clsx";
import { AlertTriangle, Bot, ClipboardCheck, Hourglass, Inbox, LayoutGrid, Workflow, Zap, type LucideIcon } from "lucide-react";
import type { TotaisGeral } from "../../api/tipos";
import { Skeleton } from "../../components/ui";
import { formatarNumero } from "../../lib/formato";

export type Tom = "neutro" | "verde" | "ambar" | "vermelho" | "roxo" | "azul";

export const TONS: Record<Tom, { icone: string; destaque: string; valor: string }> = {
  neutro: { icone: "text-texto-suave", destaque: "", valor: "text-texto" },
  verde: { icone: "text-emerald-400", destaque: "", valor: "text-texto" },
  roxo: { icone: "text-violet-400", destaque: "", valor: "text-texto" },
  azul: { icone: "text-sky-400", destaque: "", valor: "text-texto" },
  ambar: { icone: "text-amber-400", destaque: "border-amber-500/40 bg-amber-500/[0.07]", valor: "text-amber-300" },
  vermelho: { icone: "text-red-400", destaque: "border-red-500/40 bg-red-500/[0.07]", valor: "text-red-300" },
};

interface Item {
  chave: keyof TotaisGeral;
  rotulo: string;
  icone: LucideIcon;
  tom: Tom;
  /** só destaca quando o valor é maior que 0 (algo pede ação) */
  alerta?: boolean;
}

const ITENS: Item[] = [
  { chave: "squads", rotulo: "Squads", icone: LayoutGrid, tom: "neutro" },
  { chave: "agentes", rotulo: "Agentes", icone: Bot, tom: "neutro" },
  { chave: "trabalhando", rotulo: "Trabalhando agora", icone: Zap, tom: "verde" },
  { chave: "esperando", rotulo: "Esperando você", icone: Hourglass, tom: "ambar", alerta: true },
  { chave: "subagentes_rodando", rotulo: "Sub-agents rodando", icone: Workflow, tom: "roxo" },
  { chave: "abertos", rotulo: "Pedidos abertos", icone: Inbox, tom: "azul" },
  { chave: "atrasados", rotulo: "Atrasados", icone: AlertTriangle, tom: "vermelho", alerta: true },
  { chave: "revisao", rotulo: "Entregas p/ revisar", icone: ClipboardCheck, tom: "ambar", alerta: true },
];

export function Totais({ totais, carregando }: { totais: TotaisGeral | null; carregando: boolean }) {
  return (
    <section aria-label="Totais de todos os squads" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 2xl:grid-cols-8">
      {ITENS.map(({ chave, rotulo, icone: Icone, tom, alerta }) => {
        const valor = totais?.[chave] ?? 0;
        const aceso = !!alerta && valor > 0;
        const t = TONS[tom];
        return (
          <div
            key={chave}
            data-testid={`total-${chave}`}
            data-destaque={aceso || undefined}
            className={clsx(
              "rounded-xl border border-border bg-surface-3 px-4 py-3.5 shadow-card transition-colors",
              aceso && t.destaque,
            )}
          >
            <div className="mb-2 flex min-h-[2rem] items-start justify-between gap-2">
              <span className="text-[10px] font-medium uppercase leading-tight tracking-[0.08em] text-texto-suave">{rotulo}</span>
              <Icone className={clsx("h-4 w-4 shrink-0", t.icone)} aria-hidden="true" />
            </div>
            {carregando && !totais ? (
              <Skeleton className="h-8 w-14" />
            ) : (
              <span className={clsx("text-2xl font-semibold leading-none tabular-nums", aceso ? t.valor : "text-texto")} aria-label={`${rotulo}: ${valor}`}>
                {formatarNumero(valor)}
              </span>
            )}
          </div>
        );
      })}
    </section>
  );
}
