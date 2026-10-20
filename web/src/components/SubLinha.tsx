import clsx from "clsx";
import { ChevronDown, ChevronUp, Terminal } from "lucide-react";
import { useState } from "react";
import type { SubAgente } from "../api/tipos";
import { truncar } from "../lib/formato";
import {
  agruparPorIssue, descricaoSubTexto, destinoIssue, emDestaqueSub, estiloSub, issuesSub, ordenarSub,
  resumoTerminadosSub, textoDuracaoSub, tipoSub, useRelogio,
} from "../lib/subStatus";
import { LinkPainel } from "./LinkPainel";

/** Bolinha de status; rodando pulsa. */
export function PontoSub({ status, className }: { status: string; className?: string }) {
  const e = estiloSub(status);
  return (
    <span
      role="img"
      aria-label={e.rotulo}
      title={e.rotulo}
      className={clsx(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
        status === "perdido" ? "border border-dashed border-amber-400 bg-transparent" : e.ponto,
        status === "rodando" && "animate-pulse-dot",
        className,
      )}
    />
  );
}

/** Chips "#588" das issues do sub-agent. `link=false` quando o pai já é um botão/link (sem link aninhado). */
export function IssueChips({ issues, tarefaId, max = 3, link = true, className }: { issues: number[]; tarefaId?: string | null; max?: number; link?: boolean; className?: string }) {
  if (issues.length === 0) return null;
  const vis = issues.slice(0, max);
  const resto = issues.length - vis.length;
  const cls = "rounded border border-accent/30 bg-accent/10 px-1 font-mono text-[10px] leading-4 text-accent-hover";
  return (
    <span data-issues className={clsx("inline-flex shrink-0 items-center gap-1", className)}>
      {vis.map((n) =>
        link ? (
          <LinkPainel key={n} to={destinoIssue(n, tarefaId)} data-issue={n} title={tarefaId ? `Conversa ${tarefaId}` : `Buscar #${n} nas conversas`} className={clsx(cls, "hover:underline")}>#{n}</LinkPainel>
        ) : (
          <span key={n} data-issue={n} className={cls}>#{n}</span>
        ),
      )}
      {resto > 0 && <span className="font-mono text-[10px] text-texto-fraco">+{resto}</span>}
    </span>
  );
}

/** Mini-linha recuada de um sub-agent em destaque (rodando/perdido), com conector à esquerda. Só mostra o que existe. */
export function SubLinha({ s, agora, ultima = false }: { s: SubAgente; agora: number; ultima?: boolean }) {
  const e = estiloSub(s.status);
  const at = s.ultima_atividade;
  const dur = textoDuracaoSub(s, agora);
  const desc = descricaoSubTexto(s);
  const tipo = s.tipo?.trim();
  const issues = issuesSub(s);
  return (
    <li data-sub={s.id} data-status={s.status} className="relative pl-4">
      <span aria-hidden="true" className={clsx("absolute left-1 top-0 border-l border-border-light", ultima ? "h-3" : "-bottom-1")} />
      <span aria-hidden="true" className="absolute left-1 top-3 w-2.5 border-t border-border-light" />
      <div className={clsx("min-w-0 rounded-md border px-2 py-1 text-[11px]", e.fundo, e.borda)}>
        <div className="flex items-center gap-1.5">
          <PontoSub status={s.status} />
          <span className={clsx("min-w-0 truncate font-mono", e.texto)} title={tipoSub(s)}>{tipoSub(s)}</span>
          {s.status === "perdido" && <span className="shrink-0 text-amber-300">perdido</span>}
          {dur && (
            <span className={clsx("ml-auto shrink-0 font-mono tabular-nums", s.status === "rodando" ? "text-emerald-300" : "text-texto-fraco")} data-duracao>
              {dur}
            </span>
          )}
        </div>
        {(tipo || issues.length > 0) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            {tipo && <span className="min-w-0 truncate text-[10px] text-texto-fraco" data-sub-tipo>{tipo}</span>}
            <IssueChips issues={issues} tarefaId={s.tarefa?.id} />
          </div>
        )}
        {desc && <p className="mt-0.5 truncate text-texto-suave" title={desc}>{desc}</p>}
        {at && (
          <p className="mt-0.5 flex items-center gap-1 truncate font-mono text-[10px] text-texto-fraco" title={`${at.ferramenta} ${at.resumo}`}>
            <Terminal className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
            <span className="shrink-0 text-texto-suave">{at.ferramenta}</span>
            <span className="truncate">{truncar(at.resumo, 90)}</span>
          </p>
        )}
      </div>
    </li>
  );
}

/** Linha compacta de um sub-agent terminado (dentro do resumo expandido). */
function LinhaTerminado({ s, agora }: { s: SubAgente; agora: number }) {
  const dur = textoDuracaoSub(s, agora);
  const desc = descricaoSubTexto(s);
  return (
    <li data-sub={s.id} data-status={s.status} className="flex min-w-0 items-center gap-1.5 text-[11px] text-texto-fraco">
      <PontoSub status={s.status} />
      <span className={clsx("shrink-0 font-mono", estiloSub(s.status).texto)}>{tipoSub(s)}</span>
      {s.tipo?.trim() && <span className="shrink-0 text-[10px]">{s.tipo.trim()}</span>}
      {desc && <span className="min-w-0 truncate text-texto-suave" title={desc}>{truncar(desc, 60)}</span>}
      <IssueChips issues={issuesSub(s)} tarefaId={s.tarefa?.id} className="ml-auto" />
      {dur && <span className="shrink-0 font-mono tabular-nums">{dur}</span>}
    </li>
  );
}

/** Resumo expansível dos terminados: "✓ 11 concluídos · ✕ 1 erro"; aberto, lista agrupada por issue. */
export function ResumoTerminados({ subs, agora, className }: { subs: SubAgente[]; agora: number; className?: string }) {
  const [aberto, setAberto] = useState(false);
  if (subs.length === 0) return null;
  const grupos = agruparPorIssue(subs);
  const agrupado = grupos.some((g) => g.issue !== null);
  return (
    <div data-resumo-terminados className={clsx("text-[11px]", className)}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="inline-flex max-w-full items-start gap-1 rounded px-1 text-left text-texto-fraco hover:text-texto-suave focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        {aberto ? <ChevronUp className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" /> : <ChevronDown className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />}
        <span>{resumoTerminadosSub(subs)}</span>
      </button>
      {aberto && (
        <div className="mt-1 space-y-1 border-l border-border-light pl-2.5" data-terminados-lista>
          {grupos.map((g) => (
            <div key={g.issue ?? "sem"} data-grupo={g.issue ?? "sem"}>
              {agrupado && (
                <p className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-texto-fraco">
                  {g.issue === null ? "sem issue" : <IssueChips issues={[g.issue]} tarefaId={g.subs.find((x) => x.tarefa)?.tarefa?.id} />}
                  <span>({g.subs.length})</span>
                </p>
              )}
              <ul className="space-y-0.5">{g.subs.map((s) => <LinhaTerminado key={s.id} s={s} agora={agora} />)}</ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Lista aninhada: só rodando/perdido como linha completa (até `max`, "+N" expande); terminados viram resumo. */
export function SubLista({ subs, max = 3 }: { subs: SubAgente[] | null | undefined; max?: number }) {
  const [aberto, setAberto] = useState(false);
  const todos = ordenarSub(Array.isArray(subs) ? subs : []);
  const lista = todos.filter(emDestaqueSub);
  const terminados = todos.filter((x) => !emDestaqueSub(x));
  const rodando = lista.some((x) => x.status === "rodando");
  const agora = useRelogio(rodando);
  if (todos.length === 0) return null;
  const visiveis = aberto ? lista : lista.slice(0, max);
  const resto = lista.length - max;
  return (
    <div data-sublista className="space-y-1">
      {lista.length > 0 && (
        <ul aria-label="Sub-agents" className="space-y-1">
          {visiveis.map((s, i) => (
            <SubLinha key={s.id} s={s} agora={agora} ultima={i === visiveis.length - 1 && (aberto || resto <= 0)} />
          ))}
        </ul>
      )}
      {resto > 0 && (
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className="ml-4 inline-flex items-center gap-1 rounded px-1 text-[11px] text-accent-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {aberto ? <><ChevronUp className="h-3 w-3" aria-hidden="true" />recolher</> : <><ChevronDown className="h-3 w-3" aria-hidden="true" />+{resto}</>}
        </button>
      )}
      <ResumoTerminados subs={terminados} agora={agora} className="ml-4" />
    </div>
  );
}
