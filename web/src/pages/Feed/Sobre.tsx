import clsx from "clsx";
import { ChevronDown, Info } from "lucide-react";
import { useState } from "react";
import { TipoMsgBadge } from "../../components/ui";

const TIPOS: Array<{ tipo: string; veredito?: "aprovado" | "rejeitado"; texto: string }> = [
  { tipo: "pedido", texto: "Alguém pede trabalho a outro agente. Abre a conversa e pode trazer issue, branch e prazo." },
  { tipo: "andamento", texto: "Quem recebeu o pedido avisa onde está, sem encerrar nada." },
  { tipo: "entrega", texto: "O trabalho ficou pronto e vai para revisão. Fecha a ida e abre a volta." },
  { tipo: "resposta", veredito: "aprovado", texto: "Resposta a um pedido ou entrega. Com veredito aprovado, a tarefa está concluída." },
  { tipo: "resposta", veredito: "rejeitado", texto: "Veredito rejeitado: o trabalho volta para ajuste e a conversa continua." },
  { tipo: "nota", texto: "Registro sem destinatário a cobrar: decisões, avisos e contexto." },
];

const CICLO = ["pedido", "andamento", "entrega", "resposta / veredito"];

export function Sobre() {
  const [aberta, setAberta] = useState(false);
  return (
    <section className="mb-4 rounded-xl border border-border bg-surface-3">
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        aria-expanded={aberta}
        aria-controls="feed-sobre"
        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-surface-4"
      >
        <Info className="h-4 w-4 shrink-0 text-accent-hover" aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-wide text-texto">Sobre mensagens, filtros e agrupamento</span>
        <span className="hidden truncate text-xs text-texto-fraco sm:inline">
          {aberta ? "Clique para recolher" : "Clique para expandir: tipos, ciclo de vida, filtros"}
        </span>
        <ChevronDown className={clsx("ml-auto h-4 w-4 shrink-0 text-texto-fraco transition-transform", aberta && "rotate-180")} aria-hidden="true" />
      </button>
      {aberta && (
        <div id="feed-sobre" className="grid gap-6 border-t border-border px-4 py-4 text-sm text-texto-suave animate-fade-in lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto">Tipos de mensagem</h3>
            <ul className="space-y-2">
              {TIPOS.map((t) => (
                <li key={`${t.tipo}-${t.veredito ?? ""}`} className="flex items-start gap-3">
                  <span className="w-28 shrink-0">
                    <TipoMsgBadge mensagem={{ tipo: t.tipo, veredito: t.veredito }} />
                  </span>
                  <span>{t.texto}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto">Ciclo de vida</h3>
              <ol className="flex flex-wrap items-center gap-1.5 text-xs">
                {CICLO.map((c, i) => (
                  <li key={c} className="flex items-center gap-1.5">
                    <span className="rounded-md border border-border bg-surface-4 px-2 py-1 text-texto">{c}</span>
                    {i < CICLO.length - 1 && <span aria-hidden="true" className="text-texto-fraco">→</span>}
                  </li>
                ))}
              </ol>
              <p className="mt-2">Uma rejeição reabre o ciclo: o trabalho volta com novo andamento e nova entrega.</p>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto">Filtros e agrupamento</h3>
              <p>
                Agente casa com quem enviou ou recebeu. A busca olha assunto, id e issues. Os filtros ficam na URL, então o link
                pode ser compartilhado. Em &quot;Agrupar por conversa&quot;, as mensagens da mesma thread (ligadas por
                &quot;responde_a&quot;) aparecem juntas sob o pedido que as originou.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
