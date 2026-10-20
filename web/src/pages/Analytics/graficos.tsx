import type { ReactNode } from "react";
import { Card } from "../../components/ui";

/** Cores dos tokens (design-system/MASTER.md), em hex porque o Recharts pinta SVG. */
export const COR = {
  mensagens: "#818cf8",
  entregas: "#34d399",
  aprovadas: "#34d399",
  rejeitadas: "#fb7185",
  enviadas: "#818cf8",
  recebidas: "#60a5fa",
  eixo: "#6b7280",
  grade: "#2a2a3d",
  cursor: "rgba(129,140,248,0.08)",
} as const;

export const EIXO = { stroke: COR.eixo, fontSize: 11, tickLine: false, axisLine: false } as const;

interface ItemTooltip {
  name?: string | number;
  value?: string | number;
  color?: string;
  fill?: string;
  payload?: Record<string, unknown>;
}

/** Tooltip escuro padrão dos gráficos. `rotulo` formata o título a partir do rótulo do eixo. */
export function TooltipEscuro({
  active,
  payload,
  label,
  rotulo,
  unidade,
}: {
  active?: boolean;
  payload?: ItemTooltip[];
  label?: string | number;
  rotulo?: (l: string | number) => string;
  unidade?: string;
}) {
  if (!active || !payload?.length) return null;
  const titulo = label !== undefined ? (rotulo ? rotulo(label) : String(label)) : payload[0].name;
  return (
    <div className="rounded-lg border border-border-light bg-surface-5 px-3 py-2 text-xs shadow-lg">
      {titulo !== undefined && <div className="mb-1 font-medium text-texto">{titulo}</div>}
      {payload.map((p, i) => (
        <div key={`${p.name}-${i}`} className="flex items-center gap-2 text-texto-suave">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color ?? p.fill }} />
          <span>{p.name}</span>
          <span className="ml-auto pl-3 font-mono text-texto">
            {p.value}
            {unidade ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CardGrafico({
  titulo,
  subtitulo,
  className,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={className}>
      <h3 className="text-base font-semibold text-texto">{titulo}</h3>
      {subtitulo && <p className="mb-4 mt-0.5 text-xs text-texto-fraco">{subtitulo}</p>}
      {!subtitulo && <div className="mb-4" />}
      {children}
    </Card>
  );
}

/** "2026-10-20" -> "20/10". */
export function diaCurto(dia: string | number): string {
  const s = String(dia);
  return `${s.slice(8, 10)}/${s.slice(5, 7)}`;
}

export function diaLongo(dia: string | number): string {
  const s = String(dia);
  const d = new Date(`${s}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}
