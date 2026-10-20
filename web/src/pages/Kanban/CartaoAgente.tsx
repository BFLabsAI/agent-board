import { motion } from "framer-motion";
import { Cpu, Inbox, ListTodo, Terminal } from "lucide-react";
import type { Agente } from "../../api/tipos";
import { AgentAvatar, Badge, StatusBadge, TempoRelativo } from "../../components/ui";
import { estiloPapel } from "../../lib/cores";
import { nomeCurto, truncar } from "../../lib/formato";

/** Última linha não vazia da prévia do terminal (texto não confiável: só texto). */
export function ultimaLinha(tela: string | null): string | null {
  if (!tela) return null;
  const linhas = tela.split("\n").map((l) => l.trim()).filter(Boolean);
  return linhas.length ? truncar(linhas[linhas.length - 1], 140) : null;
}

export function CartaoAgente({ a }: { a: Agente }) {
  const papel = estiloPapel(a.papel);
  const linha = ultimaLinha(a.tela);
  return (
    <motion.li
      layout
      layoutId={`agente-${a.agente}`}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 38 }}
      data-agente={a.agente}
      className="space-y-2.5 rounded-xl border border-border bg-surface-3 p-3.5 shadow-card transition-colors hover:border-border-light hover:bg-surface-4"
    >
      <div className="flex items-center gap-3">
        <AgentAvatar nome={a.agente} papel={a.papel} tamanho={36} status={a.status} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-texto" title={a.agente}>{nomeCurto(a.agente)}</h3>
          <div className="flex items-center gap-1.5 text-xs">
            <span className={papel.texto}>{papel.rotulo}</span>
            {a.harness && (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-texto-suave">
                <Cpu className="h-3 w-3" aria-hidden="true" />{a.harness}
              </span>
            )}
          </div>
        </div>
        {a.pendentes > 0 && (
          <Badge tom="amarelo" className="!px-2 !py-0.5" >
            <Inbox className="h-3 w-3" aria-hidden="true" />
            <span aria-label={`${a.pendentes} pendentes`}>{a.pendentes}</span>
          </Badge>
        )}
      </div>

      {a.tarefa_atual && (
        <div className="flex items-start gap-1.5 rounded-md bg-surface-2 px-2 py-1.5 text-xs text-texto-suave">
          <ListTodo className="mt-0.5 h-3 w-3 shrink-0 text-accent-hover" aria-hidden="true" />
          <span className="line-clamp-2">{a.tarefa_atual.assunto}</span>
          <StatusBadge status={a.tarefa_atual.estado} className="ml-auto !px-1.5 !py-0 text-[10px]" />
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-texto-fraco">
        <span>Última saída</span>
        <TempoRelativo iso={a.ultima_saida} />
      </div>

      {linha && (
        <p className="flex items-start gap-1.5 rounded-md border border-border bg-surface-0 px-2 py-1.5 font-mono text-[11px] leading-snug text-texto-suave">
          <Terminal className="mt-0.5 h-3 w-3 shrink-0 text-texto-fraco" aria-hidden="true" />
          <span className="line-clamp-2 break-all">{linha}</span>
        </p>
      )}
    </motion.li>
  );
}
