import clsx from "clsx";
import { ClipboardCheck, Cpu, Inbox, Send } from "lucide-react";
import type { CSSProperties } from "react";
import type { Agente, SubAgente, Tarefa } from "../../../api/tipos";
import { AgentAvatar, StatusDot } from "../../../components/ui";
import { estiloStatus } from "../../../lib/cores";
import { nomeCurto } from "../../../lib/formato";
import { CartaoTarefa } from "./CartaoTarefa";
import { corDoAgente, resumoDoMaster, rotuloHarness } from "./dados";
import { caminho, L } from "./layout";
import { SubCard } from "./SubCard";
import { useReduzirMovimento } from "../useReduzirMovimento";

function Chip({ icone: Icone, children, titulo, tom }: { icone?: typeof Inbox; children: React.ReactNode; titulo: string; tom?: string }) {
  return (
    <span
      title={titulo}
      className={clsx(
        "inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium leading-none text-texto-suave",
        tom,
      )}
    >
      {Icone && <Icone className="h-3 w-3" aria-hidden="true" />}
      {children}
    </span>
  );
}

interface Props {
  agente: Agente;
  tarefas: Tarefa[];
  /** tarefas abertas penduradas sob este agente */
  abertas: Tarefa[];
  visiveis: number;
  selecionado: boolean;
  aoSelecionar: (agente: string) => void;
  /** posição absoluta quando o card vive no organograma */
  estilo?: CSSProperties;
  w: number;
  h: number;
  /** sub-agents já recortados (até L.maxSubs) e quantos ficaram de fora */
  subs?: SubAgente[];
  subsExtra?: number;
  /** "lado": coluna à direita das tarefas (organograma); "abaixo": empilhados sob as tarefas (Times) */
  modoSubs?: "lado" | "abaixo";
  aoSelecionarSub?: (agente: string, subId: string) => void;
}

const ChipMais = ({ n, alt }: { n: number; alt: number }) => (
  <span data-testid="sub-mais" className="inline-flex w-fit items-center rounded-md border border-border bg-surface-2 px-1.5 text-[11px] font-medium text-texto-suave" style={{ height: alt - 4 }}>
    +{n}
  </span>
);

/** Conectores em ângulo reto do pai a cada sub-card (modo "lado"). Rodando = pulso tracejado. */
function ConectoresSub({ subs, extra, h, w, cor, reduzido }: { subs: SubAgente[]; extra: number; h: number; w: number; cor: string; reduzido: boolean }) {
  const total = h + 8 + subs.length * (L.subAlt + L.subGap) + (extra > 0 ? L.maisAlt : 0);
  const y0 = h - 26;
  return (
    <svg className="pointer-events-none absolute top-0" style={{ left: w }} width={L.subGapX} height={total} aria-hidden="true">
      {subs.map((sub, i) => {
        const yi = h + 8 + i * (L.subAlt + L.subGap) + L.subAlt / 2;
        const d = caminho([[0, y0], [12, y0], [12, yi], [L.subGapX, yi]], 8);
        return (
          <g key={sub.id} data-lig-sub={sub.id}>
            <path d={d} fill="none" stroke={cor} strokeOpacity={0.4} strokeWidth={1.25} strokeLinecap="round" strokeDasharray={sub.status === "perdido" ? "3 3" : undefined} />
            {sub.status === "rodando" && !reduzido && (
              <path d={d} fill="none" stroke="#34d399" strokeWidth={2} strokeLinecap="round" strokeDasharray="3 11" data-pulso-sub={sub.id}>
                <animate attributeName="stroke-dashoffset" from="28" to="0" dur="1.2s" repeatCount="indefinite" />
              </path>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function CardAgente({ agente, tarefas, abertas, visiveis, selecionado, aoSelecionar, estilo, w, h, subs = [], subsExtra = 0, modoSubs = "lado", aoSelecionarSub }: Props) {
  const reduzido = useReduzirMovimento();
  const master = agente.papel === "master";
  const cor = corDoAgente(agente);
  const e = estiloStatus(agente.status);
  const harness = rotuloHarness(agente.harness);
  const resumo = master ? resumoDoMaster(agente.agente, tarefas) : null;
  const mostradas = abertas.slice(0, visiveis);

  return (
    <div data-testid="no-mapa" data-agente={agente.agente} style={{ width: w, ...estilo }} className="relative animate-fade-in">
      <button
        type="button"
        onClick={() => aoSelecionar(agente.agente)}
        aria-pressed={selecionado}
        aria-label={`${agente.agente}, ${e.rotulo}`}
        data-selecionado={selecionado || undefined}
        style={{
          height: h,
          borderTopColor: cor,
          borderTopWidth: master ? 4 : 3,
          ...(master ? { borderColor: cor, borderTopWidth: 4, boxShadow: `0 0 0 1px ${cor}33, 0 10px 36px -12px ${cor}66` } : null),
          ...(selecionado ? { boxShadow: `0 0 0 2px ${cor}, 0 0 28px -4px ${cor}99` } : null),
        }}
        className={clsx(
          "group flex w-full flex-col justify-between rounded-xl border border-border bg-surface-3 p-3 text-left shadow-card transition-all duration-200",
          "hover:-translate-y-0.5 hover:border-border-light hover:bg-surface-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          agente.status === "offline" && "opacity-70",
        )}
      >
        <span className="flex items-start gap-3">
          <AgentAvatar nome={agente.agente} papel={agente.papel} tamanho={master ? 52 : 40} status={agente.status} />
          <span className="min-w-0 flex-1">
            <span className={clsx("block truncate font-semibold text-texto", master ? "text-[15px]" : "text-[13px]")} title={agente.agente}>
              {master ? agente.agente : nomeCurto(agente.agente)}
            </span>
            <span className="mt-0.5 flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-wider text-texto-fraco">
                {master ? "Orquestrador" : agente.papel === "researcher" ? "Researcher" : "Manager"}
              </span>
              <span className={clsx("inline-flex items-center gap-1.5 text-[11px] font-medium", e.texto)}>
                <StatusDot status={agente.status} pulsar={agente.status === "trabalhando"} />
                {e.rotulo}
              </span>
            </span>
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          {resumo ? (
            <>
              <Chip icone={Send} titulo="Pedidos abertos que o master fez" tom="text-tarefa-aberto">
                {resumo.pedidos} {resumo.pedidos === 1 ? "pedido aberto" : "pedidos abertos"}
              </Chip>
              <Chip icone={ClipboardCheck} titulo="Entregas aguardando a revisão do master" tom={resumo.revisao > 0 ? "text-tarefa-aguardando_revisao" : undefined}>
                {resumo.revisao} p/ revisar
              </Chip>
            </>
          ) : (
            <>
              <Chip icone={Inbox} titulo="Tarefas abertas">
                {abertas.length} {abertas.length === 1 ? "aberta" : "abertas"}
              </Chip>
              <Chip titulo="Mensagens pendentes de resposta" tom={agente.pendentes > 0 ? "text-status-pendente" : undefined}>
                {agente.pendentes} {agente.pendentes === 1 ? "pendente" : "pendentes"}
              </Chip>
            </>
          )}
          {harness && (
            <Chip icone={Cpu} titulo="Harness do agente">
              {harness}
            </Chip>
          )}
        </span>
      </button>

      {mostradas.length > 0 && (
        <div className="relative ml-[14px] mt-1 flex flex-col border-l border-border-light pb-0 pl-[14px] pt-2" style={{ gap: L.tarefaGap }}>
          {mostradas.map((t) => (
            <CartaoTarefa key={t.id} tarefa={t} />
          ))}
          {abertas.length > mostradas.length && (
            <span className="text-[11px] text-texto-fraco" style={{ height: L.maisAlt - L.tarefaGap }}>
              +{abertas.length - mostradas.length} {abertas.length - mostradas.length === 1 ? "tarefa" : "tarefas"}
            </span>
          )}
        </div>
      )}

      {subs.length > 0 && modoSubs === "lado" && (
        <>
          <ConectoresSub subs={subs} extra={subsExtra} h={h} w={w} cor={cor} reduzido={reduzido} />
          <div className="absolute flex flex-col" data-testid="subs-pai" style={{ left: w + L.subGapX, top: h + 8, gap: L.subGap }}>
            {subs.map((sub) => (
              <SubCard key={sub.id} sub={sub} corPai={cor} aoAbrir={(id) => aoSelecionarSub?.(agente.agente, id)} />
            ))}
            {subsExtra > 0 && <ChipMais n={subsExtra} alt={L.maisAlt} />}
          </div>
        </>
      )}
      {subs.length > 0 && modoSubs === "abaixo" && (
        <div className="relative ml-[14px] mt-2 flex flex-col border-l border-border-light pl-[14px] pt-2" data-testid="subs-pai" style={{ gap: L.subGap }}>
          {subs.map((sub) => (
            <div key={sub.id} className="relative before:absolute before:-left-[15px] before:top-1/2 before:h-px before:w-[14px] before:bg-border-light">
              {sub.status === "rodando" && !reduzido && (
                <span aria-hidden="true" data-pulso-sub={sub.id} className="absolute -left-[15px] top-1/2 h-[2px] w-[14px] -translate-y-1/2 animate-pulse bg-emerald-400/80" />
              )}
              <SubCard sub={sub} corPai={cor} aoAbrir={(id) => aoSelecionarSub?.(agente.agente, id)} />
            </div>
          ))}
          {subsExtra > 0 && <ChipMais n={subsExtra} alt={L.maisAlt} />}
        </div>
      )}
    </div>
  );
}
