import clsx from "clsx";
import { Clock, GitBranch, Inbox, Terminal, Workflow } from "lucide-react";
import type { Agente } from "../../api/tipos";
import { AgentAvatar, Badge, StatusBadge, TempoRelativo } from "../../components/ui";
import { duracaoSub, formatarSegundos, tipoSub, useRelogio } from "../../lib/subStatus";
import { estiloPapel } from "../../lib/cores";
import { nomeCurto, truncar } from "../../lib/formato";
import { linhasDaTela } from "./dados";

const BORDA: Partial<Record<Agente["status"], string>> = {
  trabalhando: "border-status-trabalhando/30",
  esperando: "border-status-esperando/50 shadow-[0_0_0_1px_rgba(251,191,36,0.15)]",
};

/** Chips dos sub-agents rodando, aninhados abaixo da tarefa do pai. */
function ChipsSub({ agente }: { agente: Agente }) {
  const rodando = (agente.subagentes ?? []).filter((x) => x.status === "rodando");
  const agora = useRelogio(rodando.length > 0);
  if (rodando.length === 0) return null;
  return (
    <ul aria-label="Sub-agents rodando" data-subs-rodando className="mt-2 flex flex-wrap gap-1.5 border-l border-border-light pl-3">
      {rodando.map((s) => (
        <li
          key={s.id}
          data-sub={s.id}
          title={`${tipoSub(s)}: ${s.descricao ?? ""}`}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[11px]"
        >
          <Workflow className="h-3 w-3 shrink-0 animate-pulse-dot text-emerald-300" aria-hidden="true" />
          <span className="shrink-0 font-mono text-emerald-300">{tipoSub(s)}</span>
          <span className="min-w-0 truncate text-texto-suave">{truncar(s.descricao, 36)}</span>
          <span className="shrink-0 font-mono tabular-nums text-texto-fraco">{formatarSegundos(duracaoSub(s, agora))}</span>
        </li>
      ))}
    </ul>
  );
}

const HARNESS: Record<string, string> = { cc: "Claude Code", omp: "OMP", maestri: "Maestri" };

export function CartaoAgente({ agente: a }: { agente: Agente }) {
  const papel = estiloPapel(a.papel);
  const linhas = linhasDaTela(a.tela);
  const ultima = linhas[linhas.length - 1];
  return (
    <article
      data-agente={a.agente}
      aria-label={`Agente ${a.agente}`}
      className={clsx(
        "group rounded-xl border bg-surface-3 p-4 shadow-card transition-all duration-200 hover:bg-surface-4",
        BORDA[a.status] ?? "border-border hover:border-border-light",
      )}
    >
      <div className="flex items-start gap-3">
        <AgentAvatar nome={a.agente} papel={a.papel} status={a.status} tamanho={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-sm font-semibold text-texto" title={a.agente}>
              {nomeCurto(a.agente)}
            </h3>
            <StatusBadge status={a.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={clsx("rounded-md border px-1.5 py-0.5 text-[11px] font-medium", papel.texto, papel.fundo, papel.borda)}>
              {papel.rotulo}
            </span>
            {a.harness && (
              <span className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-texto-suave">
                {HARNESS[a.harness] ?? a.harness}
              </span>
            )}
            {a.branch && (
              <span className="inline-flex max-w-[11rem] items-center gap-1 truncate text-[11px] text-texto-fraco" title={a.branch}>
                <GitBranch className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{a.branch}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <p className="mt-3 min-h-[1.25rem] truncate text-sm text-texto-suave" title={a.tarefa_atual?.assunto}>
        {a.tarefa_atual ? (
          <>
            <span className="mr-1.5 font-mono text-xs text-texto-fraco">{a.tarefa_atual.id}</span>
            {a.tarefa_atual.assunto}
          </>
        ) : (
          <span className="text-texto-fraco">Sem tarefa em andamento</span>
        )}
      </p>
      <ChipsSub agente={a} />

      <div
        tabIndex={0}
        role="group"
        aria-label={`Terminal de ${nomeCurto(a.agente)}`}
        className="mt-3 overflow-hidden rounded-lg border border-border bg-surface-1 px-3 py-1.5 font-mono text-xs text-texto-suave transition-all duration-300 focus-visible:ring-2 group-hover:border-border-light"
      >
        {linhas.length === 0 ? (
          <div className="flex h-5 items-center gap-2 text-texto-fraco">
            <Terminal className="h-3 w-3" aria-hidden="true" />
            {a.status === "offline" ? "terminal fechado" : "sem saída"}
          </div>
        ) : (
          <div className="flex h-5 flex-col justify-end overflow-hidden transition-[height] duration-300 ease-out group-hover:h-44 group-focus-within:h-44 group-hover:overflow-auto group-focus-within:overflow-auto">
            {linhas.map((l, i) => (
              <div key={i} data-ultima={l === ultima && i === linhas.length - 1 ? "" : undefined} className="min-h-5 whitespace-pre leading-5">
                <span className="text-status-trabalhando/70 select-none">{i === linhas.length - 1 ? "› " : "  "}</span>
                {l || " "}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-texto-fraco">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          Última saída <TempoRelativo iso={a.ultima_saida} />
        </span>
        {a.pendentes > 0 ? (
          <Badge tom="amarelo" className="py-0.5">
            <Inbox className="h-3 w-3" aria-hidden="true" />
            {a.pendentes} {a.pendentes === 1 ? "pendente" : "pendentes"}
          </Badge>
        ) : (
          <span>Sem pendentes</span>
        )}
      </div>
    </article>
  );
}
