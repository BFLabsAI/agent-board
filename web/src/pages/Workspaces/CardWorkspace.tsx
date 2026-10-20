import clsx from "clsx";
import { ArrowRight, Gauge, Server, TriangleAlert, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import type { SaudeWorkspace, WorkspaceResumo } from "../../api/tipos";
import { ROTULO_SAUDE_WORKSPACE } from "../../api/workspaces";
import { TempoRelativo } from "../../components/ui";
import { formatarNumero } from "../../lib/formato";
import { pontoSaude } from "../../layout/SeletorWorkspace";
import { ESTILO_SAUDE } from "../Geral/lib";

const ESTILO_OFFLINE = { texto: "text-zinc-400", fundo: "bg-zinc-500/10", borda: "border-zinc-500/30", barra: "bg-zinc-500/50" };

function estiloSelo(s: SaudeWorkspace) {
  return s === "offline" ? ESTILO_OFFLINE : ESTILO_SAUDE[s];
}

function Mini({ id, rotulo, titulo, valor, tom }: { id: string; rotulo: string; titulo: string; valor: number; tom?: "vermelho" | "ambar" | "verde" }) {
  return (
    <div
      data-testid={`kpi-${id}`}
      data-tom={tom}
      title={titulo}
      className={clsx(
        "min-w-0 rounded-lg border px-2 py-2",
        tom === "vermelho" ? "border-red-500/35 bg-red-500/[0.08]" : tom === "ambar" ? "border-amber-500/35 bg-amber-500/[0.08]" : "border-border bg-surface-2",
      )}
    >
      <div className={clsx("text-lg font-semibold leading-none tabular-nums", tom === "vermelho" ? "text-red-300" : tom === "ambar" ? "text-amber-300" : tom === "verde" ? "text-emerald-300" : "text-texto")}>
        {formatarNumero(valor)}
      </div>
      <div className="mt-1.5 truncate text-[10px] font-medium text-texto-fraco">{rotulo}</div>
    </div>
  );
}

/** Destino do clique: a Visão geral do Workspace, levando período e modo TV. */
export function destinoWorkspace(id: string, search: string, pathname = "/geral", extra: Record<string, string> = {}): string {
  const atual = new URLSearchParams(search);
  const n = new URLSearchParams();
  for (const k of ["periodo", "tv"]) if (atual.get(k)) n.set(k, atual.get(k)!);
  n.set("workspace", id);
  for (const [k, v] of Object.entries(extra)) n.set(k, v);
  return `${pathname}?${n.toString()}`;
}

export function CardWorkspace({ w, pulsando, aoVivo, search }: { w: WorkspaceResumo; pulsando: boolean; aoVivo: number; search: string }) {
  const estilo = estiloSelo(w.saude);
  const t = w.totais;
  const offline = !w.online;

  return (
    <article
      data-testid="card-workspace"
      data-workspace={w.id}
      data-saude={w.saude}
      data-online={w.online}
      data-pulsando={pulsando || undefined}
      aria-label={`Workspace ${w.nome}`}
      className={clsx(
        "relative flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-surface-3 p-5 shadow-card animate-fade-in transition-colors",
        offline ? "opacity-60" : "hover:border-border-light",
        pulsando && "geral-pulso",
      )}
    >
      <span aria-hidden="true" className={clsx("absolute inset-x-4 top-0 h-[3px] rounded-b-full", estilo.barra)} />

      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-texto">
            <Server className="h-4 w-4 shrink-0 text-texto-fraco" aria-hidden="true" />
            {offline ? (
              <span className="truncate" title={w.nome}>{w.nome}</span>
            ) : (
              <Link
                to={destinoWorkspace(w.id, search)}
                className="truncate after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-accent"
                title={`Abrir a visão geral de ${w.nome}`}
              >
                {w.nome}
              </Link>
            )}
            {w.local && <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-texto-suave">este painel</span>}
          </h2>
          <p className="mt-0.5 truncate font-mono text-[11px] text-texto-fraco" title={w.id}>{w.id}</p>
        </div>
        <span
          data-testid="selo-saude"
          data-saude={w.saude}
          className={clsx("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium", estilo.texto, estilo.fundo, estilo.borda)}
        >
          <span className={clsx("h-1.5 w-1.5 rounded-full", pontoSaude(w.saude), w.saude !== "ok" && w.saude !== "offline" && "animate-pulse-dot")} aria-hidden="true" />
          {ROTULO_SAUDE_WORKSPACE[w.saude]}
        </span>
      </header>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-texto-suave">
        {w.versao && (
          <span data-testid="versao" className="font-mono">v{w.versao}</span>
        )}
        {w.desatualizado && (
          <span
            data-testid="aviso-desatualizado"
            className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-300"
          >
            <TriangleAlert className="h-3 w-3" aria-hidden="true" /> atualize o agent-board
          </span>
        )}
        {!offline && w.latencia_ms != null && (
          <span data-testid="latencia" className="inline-flex items-center gap-1 tabular-nums">
            <Gauge className="h-3.5 w-3.5 text-texto-fraco" aria-hidden="true" /> {formatarNumero(w.latencia_ms)} ms
          </span>
        )}
        {!offline && aoVivo > 0 && (
          <span data-testid="ao-vivo" className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-muted px-2 py-0.5 font-medium text-accent-hover">
            +{aoVivo} {aoVivo === 1 ? "mensagem" : "mensagens"} ao vivo
          </span>
        )}
      </div>

      {offline ? (
        <div data-testid="offline-info" className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
          <div className="font-medium text-zinc-300">
            offline{w.offline_desde ? <> <TempoRelativo iso={w.offline_desde} /></> : null}
          </div>
          {w.erro && <p className="mt-1 break-words text-xs text-texto-suave">{w.erro}</p>}
        </div>
      ) : (
        <>
          {t && (
            <section aria-label="Totais do Workspace" className="grid grid-cols-5 gap-2">
              <Mini id="squads" rotulo="Squads" titulo="Squads" valor={t.squads} />
              <Mini id="agentes" rotulo="Agentes" titulo="Agentes" valor={t.agentes} />
              <Mini id="trabalhando" rotulo="Ativos" titulo="Agentes trabalhando" valor={t.trabalhando} tom={t.trabalhando > 0 ? "verde" : undefined} />
              <Mini id="esperando" rotulo="Espera" titulo="Agentes esperando você" valor={t.esperando} tom={t.esperando > 0 ? "ambar" : undefined} />
              <Mini id="atrasados" rotulo="Atrasos" titulo="Pedidos atrasados" valor={t.atrasados} tom={t.atrasados > 0 ? "vermelho" : undefined} />
            </section>
          )}

          <section aria-label="Squads" className="min-w-0">
            <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-texto-fraco">Squads</h3>
            {w.squads.length === 0 ? (
              <p className="text-sm text-texto-fraco">Nenhum squad cadastrado</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface-2">
                {w.squads.map((s) => (
                  <li key={s.projeto} data-testid="linha-squad" data-squad={s.projeto} data-saude={s.saude} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className={clsx("h-2 w-2 shrink-0 rounded-full", ESTILO_SAUDE[s.saude].ponto)} title={ESTILO_SAUDE[s.saude].rotulo} />
                    <Link
                      to={destinoWorkspace(w.id, search, "/", { projeto: s.projeto })}
                      className="relative z-10 min-w-0 flex-1 truncate font-medium text-texto hover:text-accent-hover"
                      title={s.projeto}
                    >
                      {s.projeto}
                    </Link>
                    <span className="shrink-0 text-xs text-texto-fraco tabular-nums">{s.agentes} {s.agentes === 1 ? "agente" : "agentes"}</span>
                    {s.trabalhando > 0 ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300 tabular-nums">
                        <Zap className="h-3 w-3" aria-hidden="true" /> {s.trabalhando} trabalhando
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs text-texto-fraco">0 trabalhando</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <footer className="mt-auto flex items-center justify-end text-sm font-medium text-accent-hover" aria-hidden="true">
            Abrir visão geral <ArrowRight className="ml-1.5 h-4 w-4" />
          </footer>
        </>
      )}
    </article>
  );
}
