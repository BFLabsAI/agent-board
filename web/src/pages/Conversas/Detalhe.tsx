import clsx from "clsx";
import { AlertTriangle, ArrowLeft, Check, CircleDot, Clock, GitBranch, Hash, MessagesSquare, RefreshCw, ThumbsDown, ThumbsUp, Timer } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { cliente } from "../../api/cliente";
import { ErroApi } from "../../api/erro";
import type { Conversa, EstadoTarefa, Mensagem } from "../../api/tipos";
import { useApi } from "../../api/useApi";
import { useEvento } from "../../api/useStream";
import { LinkPainel } from "../../components/LinkPainel";
import { AgentAvatar, EmptyState, Skeleton, StatusBadge, TipoMsgBadge } from "../../components/ui";
import { chaveTipoMsg, ESTILO_TIPO_MSG } from "../../lib/cores";
import { formatarDataHora, formatarDuracaoMin, formatarHora, nomeCurto } from "../../lib/formato";
import { ehMaster, etapasDoCiclo, minutosEntre, type Etapa } from "./util";

function Chip({ icone: Icone, children, mono, titulo }: { icone?: typeof Clock; children: React.ReactNode; mono?: boolean; titulo?: string }) {
  return (
    <span title={titulo} className={clsx("inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-3 px-2.5 py-1 text-xs text-texto-suave", mono && "font-mono")}>
      {Icone && <Icone className="h-3.5 w-3.5 text-texto-fraco" aria-hidden="true" />}
      {children}
    </span>
  );
}

function Stepper({ etapas }: { etapas: Etapa[] }) {
  return (
    <section aria-label="Resumo do ciclo" className="mb-6 rounded-xl border border-border bg-surface-3 p-5 shadow-card">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-texto-fraco">Resumo do ciclo</h2>
      <ol className="grid grid-cols-4 items-start">
        {etapas.map((e, i) => {
          const rej = e.veredito === "rejeitado";
          const feito = e.estado === "feito";
          const cor = rej ? "border-red-400 bg-red-500/15 text-red-300" : feito ? "border-emerald-400 bg-emerald-500/15 text-emerald-300" : "border-border bg-surface-2 text-texto-fraco";
          return (
            <li key={e.chave} data-etapa={e.chave} data-estado={e.estado} className="flex min-w-0 flex-col items-center text-center">
              <div className="flex w-full items-center">
                <span className={clsx("h-0.5 flex-1", i === 0 ? "bg-transparent" : feito ? (rej ? "bg-red-400/60" : "bg-emerald-400/60") : "bg-border")} />
                <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2", cor, !feito && e.estado !== "pulado" && "border-dashed")}>
                  {rej ? <ThumbsDown className="h-4 w-4" aria-hidden="true" /> : feito ? (e.veredito ? <ThumbsUp className="h-4 w-4" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />) : <CircleDot className="h-4 w-4" aria-hidden="true" />}
                </span>
                <span className={clsx("h-0.5 flex-1", i === etapas.length - 1 ? "bg-transparent" : etapas[i + 1].estado === "feito" && feito ? "bg-emerald-400/60" : "bg-border")} />
              </div>
              <div className="mt-2 px-1">
                <div className={clsx("text-sm font-medium", feito ? (rej ? "text-red-300" : "text-texto") : "text-texto-fraco")}>{e.rotulo}</div>
                <div className="text-xs text-texto-suave">
                  {e.ts ? formatarHora(e.ts) : e.estado === "pulado" ? "não houve" : "aguardando"}
                </div>
                {e.delta !== null && e.delta > 0 && <div className="font-mono text-xs text-accent-hover">+{formatarDuracaoMin(e.delta)}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Balao({ m, anterior }: { m: Mensagem; anterior?: Mensagem }) {
  const esquerda = ehMaster(m.de);
  const chave = chaveTipoMsg(m);
  const est = ESTILO_TIPO_MSG[chave];
  const gap = anterior ? minutosEntre(anterior.ts, m.ts) : 0;
  return (
    <li data-msg={m.id} data-lado={esquerda ? "esquerda" : "direita"} className="relative animate-slide-up py-2">
      {gap >= 1 && (
        <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/3 rounded-full border border-border bg-surface-1 px-2 py-0.5 font-mono text-[11px] text-texto-fraco">
          +{formatarDuracaoMin(gap)}
        </div>
      )}
      <span className="absolute left-1/2 top-7 z-10 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-surface-1" style={{ backgroundColor: est.hex }} aria-hidden="true" />
      <div className={clsx("flex", esquerda ? "justify-start pr-[calc(50%+20px)]" : "justify-end pl-[calc(50%+20px)]")}>
        <article className={clsx("w-full max-w-xl rounded-xl border bg-surface-3 p-4 shadow-card transition-colors hover:border-border-light", m.tipo === "resposta" && m.veredito === "aprovado" ? "border-emerald-500/50" : m.veredito === "rejeitado" ? "border-red-500/50" : "border-border")}>
          <header className="flex flex-wrap items-center gap-2">
            <AgentAvatar nome={m.de} tamanho={30} />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-medium text-texto" title={m.de}>{nomeCurto(m.de)}</div>
              <div className="truncate text-xs text-texto-fraco">para {nomeCurto(m.para)}</div>
            </div>
            <TipoMsgBadge mensagem={m} className="ml-auto" />
            <time dateTime={m.ts} title={formatarDataHora(m.ts)} className="font-mono text-xs text-texto-fraco">{formatarHora(m.ts)}</time>
          </header>
          {m.assunto && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-texto">{m.assunto}</p>}
          {m.veredito && (
            <div data-veredito={m.veredito} className={clsx("mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold", m.veredito === "aprovado" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-300")}>
              {m.veredito === "aprovado" ? <ThumbsUp className="h-4 w-4" aria-hidden="true" /> : <ThumbsDown className="h-4 w-4" aria-hidden="true" />}
              {m.veredito === "aprovado" ? "Aprovado" : "Rejeitado"}
            </div>
          )}
          {(m.prazo || m.branch || (m.issues && m.issues.length > 0)) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {m.prazo && <Chip icone={Timer} titulo="Prazo">prazo {formatarDataHora(m.prazo)}</Chip>}
              {m.branch && <Chip icone={GitBranch} mono>{m.branch}</Chip>}
              {m.issues?.map((i) => <Chip key={i} mono>#{i}</Chip>)}
            </div>
          )}
        </article>
      </div>
    </li>
  );
}

function Esqueleto() {
  return (
    <div aria-busy="true" aria-label="Carregando conversa" className="space-y-4">
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export default function ConversaDetalhe() {
  const { id = "" } = useParams<{ id: string }>();
  const { dados, carregando, erro, recarregar } = useApi((c, s) => cliente.conversa(id, c, s), [id]);
  const [extras, setExtras] = useState<Mensagem[]>([]);
  const [estadoVivo, setEstadoVivo] = useState<EstadoTarefa | null>(null);

  useEffect(() => {
    setExtras([]);
    setEstadoVivo(null);
  }, [dados, id]);

  const mensagens = useMemo(() => {
    const base = dados?.mensagens ?? [];
    const vistos = new Set(base.map((m) => m.id));
    const novas = extras.filter((m) => !vistos.has(m.id));
    return [...base, ...novas].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  }, [dados, extras]);

  // mensagem nova da thread entra no fim
  useEvento("mensagem", (m) => {
    if (!dados || !m.responde_a) return;
    const ids = new Set([...mensagens.map((x) => x.id)]);
    if (ids.has(m.id)) return;
    if (m.responde_a.split(",").some((p) => ids.has(p.trim()))) setExtras((e) => [...e, m]);
  });
  useEvento("tarefa", (t) => {
    if (t.id === id) setEstadoVivo(t.estado);
  });

  if (erro && !dados) {
    const naoExiste = erro instanceof ErroApi && erro.status === 404;
    return (
      <EmptyState
        icone={naoExiste ? MessagesSquare : AlertTriangle}
        titulo={naoExiste ? "Conversa não encontrada" : "Não foi possível carregar"}
        descricao={naoExiste ? `Não existe uma conversa com o id ${id} neste projeto. Ela pode ter sido arquivada.` : erro.message}
        acao={
          <LinkPainel to="/conversas" className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-texto-suave hover:bg-surface-4 hover:text-texto">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar para Conversas
          </LinkPainel>
        }
      />
    );
  }
  if (!dados) return carregando ? <Esqueleto /> : null;

  const c: Conversa = dados.conversa;
  const fim = mensagens.length ? mensagens[mensagens.length - 1].ts : c.fim;
  const duracao = extras.length ? minutosEntre(c.inicio, fim) : c.duracao_min;
  const participantes = Array.from(new Set([...c.participantes, ...mensagens.flatMap((m) => [m.de, m.para])]));
  const estado = estadoVivo ?? c.estado;
  const etapas = etapasDoCiclo(mensagens);

  return (
    <>
      <header className="mb-6">
        <div className="flex items-start gap-3">
          <LinkPainel to="/conversas" aria-label="Voltar para Conversas" className="mt-1 rounded-lg p-1.5 text-texto-suave transition-colors hover:bg-surface-4 hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </LinkPainel>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="min-w-0 break-words text-xl font-semibold leading-tight text-texto">{c.assunto}</h1>
              {estado && <StatusBadge status={estado} />}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Chip icone={Hash} mono>{c.id}</Chip>
              <Chip icone={Clock} titulo="Duração">{formatarDuracaoMin(duracao)}</Chip>
              <Chip titulo="Início">início {formatarDataHora(c.inicio)}</Chip>
              <Chip icone={MessagesSquare}>{mensagens.length} {mensagens.length === 1 ? "mensagem" : "mensagens"}</Chip>
              {c.branch && <Chip icone={GitBranch} mono>{c.branch}</Chip>}
              {c.issues.map((i) => <Chip key={i} mono>#{i}</Chip>)}
              {participantes.map((p) => (
                <span key={p} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-3 py-0.5 pl-1 pr-2.5 text-xs text-texto-suave" title={p}>
                  <AgentAvatar nome={p} tamanho={20} />
                  {nomeCurto(p)}
                </span>
              ))}
            </div>
          </div>
          <button type="button" onClick={recarregar} aria-label="Atualizar conversa" className="rounded-lg p-2 text-texto-suave transition-colors hover:bg-surface-4 hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <Stepper etapas={etapas} />

      <section aria-label="Timeline da conversa">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-texto-fraco">Timeline</h2>
        {mensagens.length === 0 ? (
          <EmptyState icone={MessagesSquare} titulo="Sem mensagens" descricao="Esta conversa ainda não tem mensagens." />
        ) : (
          <div className="relative">
            <span className="absolute bottom-2 left-1/2 top-2 w-px -translate-x-1/2 bg-gradient-to-b from-border-light via-border to-border" aria-hidden="true" />
            <ol className="relative">
              {mensagens.map((m, i) => (
                <Fragment key={m.id}>
                  <Balao m={m} anterior={mensagens[i - 1]} />
                </Fragment>
              ))}
            </ol>
          </div>
        )}
      </section>
    </>
  );
}
