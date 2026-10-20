import clsx from "clsx";
import { motion } from "framer-motion";
import { ArrowRight, Clock, GitBranch, MessageSquareText } from "lucide-react";
import type { Tarefa } from "../../api/tipos";
import { LinkPainel } from "../../components/LinkPainel";
import { AgentAvatar, TempoRelativo, TipoMsgBadge, useAgora } from "../../components/ui";
import { nomeCurto, tempoRelativo } from "../../lib/formato";

const ABERTAS = ["aberto", "em_andamento", "atrasado"];

export function idCurto(id: string): string {
  return id.length > 10 ? id.slice(-8) : id;
}

export function CartaoTarefa({ t }: { t: Tarefa }) {
  const agora = useAgora();
  const viva = ABERTAS.includes(t.estado);
  const vencido = viva && t.prazo !== null && Date.parse(t.prazo) < agora;
  return (
    <motion.li
      layout
      layoutId={`tarefa-${t.id}`}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 38 }}
      data-tarefa={t.id}
    >
      <LinkPainel
        to={`/conversas/${encodeURIComponent(t.id)}`}
        className={clsx(
          "group block space-y-2.5 rounded-xl border bg-surface-3 p-3.5 shadow-card transition-colors hover:border-border-light hover:bg-surface-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
          t.estado === "atrasado" ? "border-red-500/40" : "border-border",
        )}
      >
        <div className="flex items-start gap-2">
          <TipoMsgBadge mensagem={{ tipo: t.tipo }} className="!px-2 !py-0.5" />
          <span className="ml-auto font-mono text-[11px] text-texto-fraco">{idCurto(t.id)}</span>
        </div>
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-texto">{t.assunto}</h3>

        <div className="flex items-center gap-1.5 text-xs text-texto-suave">
          <AgentAvatar nome={t.de} tamanho={20} />
          <span className="truncate">{nomeCurto(t.de)}</span>
          <ArrowRight className="h-3 w-3 shrink-0 text-texto-fraco" aria-hidden="true" />
          <AgentAvatar nome={t.para} tamanho={20} />
          <span className="truncate">{nomeCurto(t.para)}</span>
        </div>

        {(t.issues.length > 0 || t.branch) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {t.issues.map((n) => (
              <span key={n} className="rounded-md border border-accent/30 bg-accent-muted px-1.5 py-0.5 font-mono text-[11px] text-accent-hover">#{n}</span>
            ))}
            {t.branch && (
              <span className="inline-flex min-w-0 items-center gap-1 font-mono text-[11px] text-texto-suave">
                <GitBranch className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{t.branch}</span>
              </span>
            )}
          </div>
        )}

        {viva && t.prazo && (
          <div className={clsx("flex items-center gap-1.5 text-xs", vencido ? "font-medium text-red-400" : "text-texto-suave")} data-prazo={vencido ? "vencido" : "ok"}>
            <Clock className="h-3 w-3" aria-hidden="true" />
            {vencido ? "Venceu " : "Vence "}
            {tempoRelativo(t.prazo, agora)}
          </div>
        )}

        {t.andamento && (
          <p className="flex items-start gap-1.5 rounded-md bg-surface-2 px-2 py-1.5 text-xs text-texto-suave">
            <MessageSquareText className="mt-0.5 h-3 w-3 shrink-0 text-msg-andamento" aria-hidden="true" />
            <span className="line-clamp-2">{t.andamento}</span>
          </p>
        )}

        <div className="flex items-center justify-between text-[11px] text-texto-fraco">
          <TempoRelativo iso={t.fechada_em ?? t.ts} />
          {t.fechada_em && <span>fechada</span>}
        </div>
      </LinkPainel>
    </motion.li>
  );
}
