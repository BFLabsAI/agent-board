import clsx from "clsx";
import { AlertOctagon, AlertTriangle, Repeat } from "lucide-react";
import type { Cadeia } from "../../api/tipos";
import { LinkPainel } from "../../components/LinkPainel";
import { formatarNumero, nomeCurto } from "../../lib/formato";
import type { AlertaPingPong } from "./dados";

const TOM = {
  vermelho: "border-red-500/40 bg-red-500/10 text-red-200",
  laranja: "border-orange-500/40 bg-orange-500/10 text-orange-200",
} as const;

function Linha({ tom, icone: Icone, children }: { tom: keyof typeof TOM; icone: typeof AlertOctagon; children: React.ReactNode }) {
  return (
    <div className={clsx("flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm animate-slide-up", TOM[tom])}>
      <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Faixa de alertas no topo: cadeia de hash, ping-pong e tarefas atrasadas. */
export function FaixaAlertas({
  cadeia,
  atrasados,
  pingPong,
}: {
  cadeia?: Cadeia | null;
  atrasados: number;
  pingPong: AlertaPingPong[];
}) {
  const quebrada = cadeia && !cadeia.integra;
  if (!quebrada && atrasados <= 0 && pingPong.length === 0) return null;
  return (
    <section aria-label="Alertas" className="mb-6 flex flex-col gap-2">
      {quebrada && (
        <Linha tom="vermelho" icone={AlertOctagon}>
          <strong className="font-semibold">Cadeia de hash não íntegra.</strong>{" "}
          <span className="text-red-200/80">
            O log de comunicações foi alterado fora do fluxo
            {cadeia.problemas.length > 0 && <>: {cadeia.problemas[0]}</>}
            {cadeia.problemas.length > 1 && <> (e mais {formatarNumero(cadeia.problemas.length - 1)})</>}.
          </span>
        </Linha>
      )}
      {pingPong.map((a) => (
        <Linha key={`${a.de}|${a.para}|${a.ate}`} tom="laranja" icone={Repeat}>
          <strong className="font-semibold">Ping-pong:</strong>{" "}
          <span className="text-orange-200/80">
            {nomeCurto(a.de)} ↔ {nomeCurto(a.para)} trocaram {formatarNumero(a.n)} mensagens em {a.janela_min} min sem entrega.
          </span>
        </Linha>
      ))}
      {atrasados > 0 && (
        <Linha tom="vermelho" icone={AlertTriangle}>
          <strong className="font-semibold">
            {formatarNumero(atrasados)} {atrasados === 1 ? "tarefa atrasada" : "tarefas atrasadas"}.
          </strong>{" "}
          <LinkPainel to="/kanban" className="text-red-100 underline underline-offset-2 hover:text-white">
            Ver no Kanban
          </LinkPainel>
        </Linha>
      )}
    </section>
  );
}
