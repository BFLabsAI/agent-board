import clsx from "clsx";
import { AlertTriangle, ArrowRight, Building2, ChevronRight, Workflow } from "lucide-react";
import type { Squad } from "../../api/tipos";
import { LinkPainel } from "../../components/LinkPainel";
import { AgentAvatar, Tooltip, TempoRelativo, TipoMsgBadge } from "../../components/ui";
import { estiloStatus } from "../../lib/cores";
import { formatarDuracaoMin, formatarNumero, nomeCurto } from "../../lib/formato";
import { ESTILO_SAUDE, HEX_STATUS, motivosSaude, subsRodando } from "./lib";

const MAX_AVATARES = 7;

function Kpi({ id, rotulo, titulo, valor, tom }: { id: string; rotulo: string; titulo: string; valor: string; tom?: "vermelho" | "ambar" }) {
  // "12 min" vira número grande e unidade pequena, para caber na coluna
  const [num, ...un] = valor.split(" ");
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
      <div className={clsx("whitespace-nowrap text-lg font-semibold leading-none tabular-nums", tom === "vermelho" ? "text-red-300" : tom === "ambar" ? "text-amber-300" : "text-texto")}>
        {num}
        {un.length > 0 && <span className="ml-0.5 text-[10px] font-medium text-texto-suave">{un.join(" ")}</span>}
      </div>
      <div className="mt-1.5 truncate text-[10px] font-medium tracking-normal text-texto-fraco">{rotulo}</div>
    </div>
  );
}

export function CardSquad({ squad, pulsando }: { squad: Squad; pulsando: boolean }) {
  const saude = ESTILO_SAUDE[squad.saude];
  const motivos = motivosSaude(squad);
  const i = squad.indicadores;
  const subs = subsRodando(squad.agentes);
  const p50 = i.tempo_resposta?.p50 ?? i.tempo_resposta?.media;
  const ult = squad.ultima_mensagem;
  const visiveis = squad.agentes.slice(0, MAX_AVATARES);
  const resto = squad.agentes.length - visiveis.length;
  const projetoQs = `?projeto=${encodeURIComponent(squad.projeto)}`;

  return (
    <article
      data-testid="card-squad"
      data-squad={squad.projeto}
      data-saude={squad.saude}
      data-pulsando={pulsando || undefined}
      aria-label={`Squad ${squad.projeto}`}
      className={clsx(
        "relative flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-surface-3 p-5 shadow-card animate-fade-in",
        "transition-colors hover:border-border-light",
        pulsando && "geral-pulso",
      )}
    >
      <span aria-hidden="true" className={clsx("absolute inset-x-4 top-0 h-[3px] rounded-b-full", saude.barra)} />

      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-texto" title={squad.projeto}>{squad.projeto}</h2>
          <p className="mt-0.5 truncate font-mono text-[11px] text-texto-fraco" title={squad.raiz}>{squad.raiz}</p>
        </div>
        <span className="group relative shrink-0">
          <span
            tabIndex={0}
            data-testid="selo-saude"
            data-saude={squad.saude}
            aria-describedby={`saude-${squad.projeto}`}
            className={clsx("inline-flex cursor-help items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium", saude.texto, saude.fundo, saude.borda)}
          >
            <span className={clsx("h-1.5 w-1.5 rounded-full", saude.ponto, squad.saude !== "ok" && "animate-pulse-dot")} aria-hidden="true" />
            {saude.rotulo}
          </span>
          <span
            id={`saude-${squad.projeto}`}
            role="tooltip"
            data-testid="motivo-saude"
            className="pointer-events-none absolute right-0 top-full z-50 mt-1.5 w-max max-w-[16rem] rounded-md border border-border-light bg-surface-5 px-2.5 py-1.5 text-xs text-texto opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            {motivos.map((m) => (
              <span key={m} className="block">{m}</span>
            ))}
          </span>
        </span>
      </header>

      {squad.erro ? (
        <div role="alert" data-testid="erro-squad" className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/[0.07] p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
          <div className="min-w-0">
            <div className="font-medium text-red-300">Não foi possível ler este squad</div>
            <p className="mt-0.5 break-words text-texto-suave">{squad.erro}</p>
          </div>
        </div>
      ) : (
        <>
          <section aria-label="Agentes" className="flex items-center gap-3">
            <ul className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-2">
              {visiveis.map((a) => (
                <li key={a.agente}>
                  <Tooltip texto={`${nomeCurto(a.agente)} · ${estiloStatus(a.status).rotulo}`}>
                    <span
                      data-testid="avatar-agente"
                      data-agente={a.agente}
                      data-status={a.status}
                      className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-surface-2"
                      style={{ boxShadow: `0 0 0 2px ${HEX_STATUS[a.status]}${a.status === "trabalhando" ? ", 0 0 12px -2px " + HEX_STATUS[a.status] : ""}` }}
                    >
                      <span className="overflow-hidden rounded-full">
                        <AgentAvatar nome={a.agente} papel={a.papel} tamanho={30} />
                      </span>
                    </span>
                  </Tooltip>
                </li>
              ))}
              {resto > 0 && <li className="text-xs font-medium text-texto-suave">+{resto}</li>}
              {squad.agentes.length === 0 && <li className="text-sm text-texto-fraco">Sem agentes cadastrados</li>}
            </ul>
            {subs > 0 && (
              <span
                data-testid="subs-rodando"
                className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-xs font-medium text-violet-300"
                title={`${subs} sub-agents rodando`}
              >
                <span className="flex items-center gap-0.5" aria-hidden="true">
                  {Array.from({ length: Math.min(subs, 4) }, (_, k) => (
                    <span key={k} className="geral-drone h-1.5 w-1.5 rounded-sm bg-violet-400" style={{ animationDelay: `${k * 180}ms` }} />
                  ))}
                </span>
                <Workflow className="h-3.5 w-3.5" aria-hidden="true" />
                {subs}
              </span>
            )}
          </section>

          <section aria-label="Indicadores" className="grid grid-cols-5 gap-2">
            <Kpi id="abertos" rotulo="Abertos" titulo="Pedidos abertos" valor={formatarNumero(i.abertos)} />
            <Kpi id="atrasados" rotulo="Atrasos" titulo="Pedidos atrasados" valor={formatarNumero(i.atrasados)} tom={i.atrasados > 0 ? "vermelho" : undefined} />
            <Kpi id="revisao" rotulo="Revisão" titulo="Entregas para revisar" valor={formatarNumero(i.revisao)} tom={i.revisao > 0 ? "ambar" : undefined} />
            <Kpi id="mensagens" rotulo="Msgs" titulo="Mensagens no período" valor={formatarNumero(i.mensagens)} />
            <Kpi id="p50" rotulo="p50" titulo="Tempo de resposta p50" valor={formatarDuracaoMin(p50)} />
          </section>
        </>
      )}

      <section aria-label="Última mensagem" className="min-w-0 rounded-lg border border-border bg-surface-2 p-3">
        {ult ? (
          <div data-testid="ultima-mensagem" className="min-w-0">
            <div className="flex items-center justify-between gap-2">
              <TipoMsgBadge mensagem={ult} />
              <TempoRelativo iso={ult.ts} className="shrink-0 text-xs text-texto-fraco" />
            </div>
            <p className="mt-2 flex min-w-0 items-center gap-1 text-xs text-texto-suave">
              <span className="truncate" title={ult.de}>{nomeCurto(ult.de)}</span>
              <ChevronRight className="h-3 w-3 shrink-0 text-texto-fraco" aria-label="para" />
              <span className="truncate" title={ult.para}>{nomeCurto(ult.para)}</span>
            </p>
            <p className="mt-1 line-clamp-2 break-words text-sm text-texto" title={ult.assunto}>{ult.assunto || "(sem assunto)"}</p>
          </div>
        ) : (
          <p className="text-sm text-texto-fraco">Nenhuma mensagem ainda</p>
        )}
      </section>

      <footer className="mt-auto flex items-center gap-2">
        <LinkPainel
          to={`/${projetoQs}`}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-accent/30 bg-accent-muted px-3 py-2 text-sm font-medium text-accent-hover transition-colors hover:border-accent/60 hover:bg-accent/25"
        >
          Abrir squad <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </LinkPainel>
        <LinkPainel
          to={`/office${projetoQs}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-texto-suave transition-colors hover:bg-surface-4 hover:text-texto"
        >
          <Building2 className="h-4 w-4" aria-hidden="true" /> Office
        </LinkPainel>
      </footer>
    </article>
  );
}
