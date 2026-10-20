import clsx from "clsx";
import { ChevronDown, ChevronUp, Terminal } from "lucide-react";
import { useState } from "react";
import type { SubAgente } from "../api/tipos";
import { truncar } from "../lib/formato";
import { duracaoSub, estiloSub, formatarSegundos, ordenarSub, tipoSub, useRelogio } from "../lib/subStatus";

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

/** Mini-linha recuada de um sub-agent, com conector à esquerda (filho do agente pai). */
export function SubLinha({ s, agora, ultima = false }: { s: SubAgente; agora: number; ultima?: boolean }) {
  const e = estiloSub(s.status);
  const at = s.ultima_atividade;
  const dur = duracaoSub(s, agora);
  return (
    <li data-sub={s.id} data-status={s.status} className="relative pl-4">
      <span aria-hidden="true" className={clsx("absolute left-1 top-0 border-l border-border-light", ultima ? "h-3" : "-bottom-1")} />
      <span aria-hidden="true" className="absolute left-1 top-3 w-2.5 border-t border-border-light" />
      <div className={clsx("min-w-0 rounded-md border px-2 py-1 text-[11px]", e.fundo, e.borda)}>
        <div className="flex items-center gap-1.5">
          <PontoSub status={s.status} />
          <span className={clsx("min-w-0 truncate font-mono", e.texto)} title={tipoSub(s)}>{tipoSub(s)}</span>
          <span className={clsx("ml-auto shrink-0 font-mono tabular-nums", s.status === "rodando" ? "text-emerald-300" : "text-texto-fraco")} data-duracao>
            {formatarSegundos(dur)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-texto-suave" title={s.descricao ?? undefined}>{s.descricao ?? "sem descrição"}</p>
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

/** Lista aninhada: até `max` visíveis, "+N" expande. */
export function SubLista({ subs, max = 3 }: { subs: SubAgente[] | null | undefined; max?: number }) {
  const [aberto, setAberto] = useState(false);
  const lista = ordenarSub(Array.isArray(subs) ? subs : []);
  const rodando = lista.some((x) => x.status === "rodando");
  const agora = useRelogio(rodando);
  if (lista.length === 0) return null;
  const visiveis = aberto ? lista : lista.slice(0, max);
  const resto = lista.length - max;
  return (
    <div data-sublista className="space-y-1">
      <ul aria-label="Sub-agents" className="space-y-1">
        {visiveis.map((s, i) => (
          <SubLinha key={s.id} s={s} agora={agora} ultima={i === visiveis.length - 1 && (aberto || resto <= 0)} />
        ))}
      </ul>
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
    </div>
  );
}
