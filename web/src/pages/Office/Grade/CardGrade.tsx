import clsx from "clsx";
import { Clock, GitBranch, ListTodo, Terminal } from "lucide-react";
import type { Agente } from "../../../api/tipos";
import { AgentAvatar, StatusDot, TempoRelativo, Tooltip } from "../../../components/ui";
import { estiloPapel, estiloStatus } from "../../../lib/cores";
import { formatarDuracaoMin, formatarPercentual, nomeCurto } from "../../../lib/formato";
import { rotuloHarness } from "../Mapa/dados";
import { rodandoDe, subsDe } from "../subagentes";
import { Atividade } from "./Atividade";
import { HEX_STATUS, somaAtividade, taxaAprovacao } from "./dados";

function corTaxa(t: number): { hex: string; texto: string } {
  if (t >= 0.8) return { hex: "#34d399", texto: "text-emerald-300" };
  if (t >= 0.5) return { hex: "#fbbf24", texto: "text-amber-300" };
  return { hex: "#f87171", texto: "text-red-300" };
}

const MAX_AVATARES = 6;

function inicioDeHoje(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const ROTULO = "text-[10px] font-semibold uppercase tracking-[0.14em] text-texto-fraco";

export function CardGrade({ agente, selecionado, aoSelecionar }: { agente: Agente; selecionado: boolean; aoSelecionar: (a: string) => void }) {
  const e = estiloStatus(agente.status);
  const papel = estiloPapel(agente.papel);
  const anel = HEX_STATUS[agente.status];
  const harness = rotuloHarness(agente.harness);
  const taxa = taxaAprovacao(agente);
  const ct = taxa === null ? null : corTaxa(taxa);
  const s = agente.stats;
  const atual = agente.tarefa_atual;
  const ea = atual ? estiloStatus(atual.estado) : null;
  const subs = subsDe(agente);
  const rodando = rodandoDe(subs);
  const hoje0 = inicioDeHoje();
  const subsHoje = subs.filter((x) => Date.parse(x.inicio) >= hoje0).length;

  return (
    <article
      data-testid="card-grade"
      data-agente={agente.agente}
      data-selecionado={selecionado || undefined}
      onClick={(e) => {
        // clique em qualquer parte do card abre a gaveta (o botão Detalhes cuida do próprio clique)
        if ((e.target as HTMLElement).closest("button, a")) return;
        aoSelecionar(agente.agente);
      }}
      className={clsx(
        "group flex cursor-pointer flex-col gap-4 rounded-2xl border bg-surface-3 p-5 shadow-card transition-all duration-200 animate-fade-in",
        "hover:-translate-y-0.5 hover:border-border-light hover:bg-surface-4",
        selecionado ? "border-accent shadow-glow" : "border-border",
        agente.status === "offline" && "opacity-75",
      )}
    >
      <header className="flex items-start gap-4">
        <span
          className="relative flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-surface-2"
          style={{ boxShadow: `0 0 0 3px ${anel}, 0 0 20px -2px ${anel}88` }}
        >
          <span className="overflow-hidden rounded-full">
            <AgentAvatar nome={agente.agente} papel={agente.papel} tamanho={58} />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-[15px] font-semibold text-texto" title={agente.agente}>
              {nomeCurto(agente.agente)}
            </h3>
            <span className={clsx("inline-flex shrink-0 items-center gap-1.5 text-xs font-medium", e.texto)}>
              <StatusDot status={agente.status} pulsar={agente.status === "trabalhando"} />
              {e.rotulo}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={clsx("rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none", papel.texto, papel.fundo, papel.borda)}>{papel.rotulo}</span>
            {harness && (
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium leading-none text-texto-suave">
                <Terminal className="h-3 w-3" aria-hidden="true" />
                {harness}
              </span>
            )}
          </div>
          {(agente.branch ?? agente.worktree) && (
            <p className="mt-2 flex items-center gap-1.5 truncate font-mono text-[11px] text-texto-fraco" title={[agente.worktree, agente.branch].filter(Boolean).join(" · ")}>
              <GitBranch className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{agente.branch ?? agente.worktree}</span>
            </p>
          )}
        </div>
      </header>

      <section>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className={ROTULO}>Atividade · 14d</span>
          <span className="text-xs font-semibold tabular-nums text-texto" data-testid="total-atividade">
            {somaAtividade(agente)}
          </span>
        </div>
        <Atividade valores={s.atividade_14d} cor={papel.hex} />
      </section>

      <section>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className={ROTULO}>Entregas · 7d</span>
          <span className="text-xs tabular-nums text-texto-suave">
            <b className="font-semibold text-texto">{s.entregas_7d}</b> {s.entregas_7d === 1 ? "entrega" : "entregas"}
            {ct && taxa !== null && <span className={clsx("ml-1.5 font-semibold", ct.texto)}>{formatarPercentual(taxa)} aprovação</span>}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Taxa de aprovação"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={taxa === null ? undefined : Math.round(taxa * 100)}
          className="h-2 overflow-hidden rounded-full bg-surface-2"
        >
          <div data-testid="barra-aprovacao" className="h-full rounded-full transition-all duration-500" style={{ width: `${taxa === null ? 0 : Math.max(4, taxa * 100)}%`, background: ct?.hex }} />
        </div>
        {taxa === null && <p className="mt-1 text-[11px] text-texto-fraco">Sem veredito nos últimos 7 dias</p>}
      </section>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg bg-surface-2 px-3 py-2">
          <span className={ROTULO}>Resposta p50</span>
          <p className="mt-0.5 flex items-center gap-1.5 font-semibold tabular-nums text-texto">
            <Clock className="h-3.5 w-3.5 text-texto-fraco" aria-hidden="true" />
            {formatarDuracaoMin(s.tempo_resposta_p50_min)}
          </p>
        </div>
        <div className="rounded-lg bg-surface-2 px-3 py-2">
          <span className={ROTULO}>Última saída</span>
          <p className="mt-0.5 font-semibold text-texto">
            <TempoRelativo iso={agente.ultima_saida} />
          </p>
        </div>
        <div className="col-span-2 rounded-lg bg-surface-2 px-3 py-2">
          <span className={ROTULO}>Sub-agents · 7d</span>
          <p className="mt-0.5 font-semibold tabular-nums text-texto" data-testid="subs-7d">
            {s.subagentes_7d ?? 0}
          </p>
        </div>
      </div>

      <section data-testid="subs-grade" className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className={ROTULO}>Sub-agents</span>
        <span className="text-xs tabular-nums text-texto-suave" data-testid="subs-resumo">
          <b className="font-semibold text-texto">{rodando.length}</b> rodando · <b className="font-semibold text-texto">{subsHoje}</b> hoje
        </span>
        {rodando.length > 0 && (
          <span className="ml-auto flex items-center -space-x-1.5" data-testid="subs-avatares">
            {rodando.slice(0, MAX_AVATARES).map((x) => (
              <Tooltip key={x.id} texto={`${x.tipo ?? "sub-agent"}: ${x.descricao ?? "sem descrição"}`} lado="cima">
                <span data-sub={x.id} className="relative rounded-lg ring-2 ring-surface-3 animate-pulse-dot">
                  <AgentAvatar nome={x.id} papel={agente.papel} tamanho={22} />
                </span>
              </Tooltip>
            ))}
            {rodando.length > MAX_AVATARES && <span className="pl-2.5 text-[11px] text-texto-fraco">+{rodando.length - MAX_AVATARES}</span>}
          </span>
        )}
      </section>

      <section className="min-h-[44px]">
        <span className={ROTULO}>Tarefa atual</span>
        {atual && ea ? (
          <p className="mt-1 flex items-start gap-2 text-[13px] leading-snug text-texto" title={atual.assunto}>
            <ListTodo className={clsx("mt-0.5 h-3.5 w-3.5 shrink-0", ea.texto)} aria-hidden="true" />
            <span className="line-clamp-2">{atual.assunto}</span>
          </p>
        ) : (
          <p className="mt-1 text-[13px] text-texto-fraco">Sem tarefa aberta</p>
        )}
      </section>

      <footer className="mt-auto flex items-center justify-between border-t border-border pt-3">
        <span className="text-[11px] text-texto-fraco">
          {agente.pendentes > 0 ? <span className="font-medium text-status-pendente">{agente.pendentes} pendente{agente.pendentes === 1 ? "" : "s"}</span> : "Nada pendente"}
        </span>
        <button
          type="button"
          onClick={() => aoSelecionar(agente.agente)}
          aria-label={`Detalhes de ${agente.agente}`}
          className="rounded-lg bg-accent-muted px-3 py-1.5 text-xs font-medium text-accent-hover transition-colors hover:bg-accent/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Detalhes
        </button>
      </footer>
    </article>
  );
}
