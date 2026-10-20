import clsx from "clsx";
import { ClipboardCheck, Cpu, Inbox, Send } from "lucide-react";
import type { CSSProperties } from "react";
import type { Agente, SubAgente, Tarefa } from "../../../api/tipos";
import { AgentAvatar, StatusDot } from "../../../components/ui";
import { estiloStatus } from "../../../lib/cores";
import { nomeCurto } from "../../../lib/formato";
import { CartaoTarefa } from "./CartaoTarefa";
import { corDoAgente, resumoDoMaster, rotuloHarness } from "./dados";
import { BlocoSubs } from "./BlocoSubs";
import { L } from "./layout";
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
  /** sub-agents em destaque (rodando/perdido, até L.maxSubs), quantos ficaram de fora e os terminados (só resumo) */
  subs?: SubAgente[];
  subsExtra?: number;
  terminados?: SubAgente[];
  aoSelecionarSub?: (agente: string, subId: string) => void;
}

export function CardAgente({ agente, tarefas, abertas, visiveis, selecionado, aoSelecionar, estilo, w, h, subs = [], subsExtra = 0, terminados = [], aoSelecionarSub }: Props) {
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

      <BlocoSubs w={w} cor={cor} subs={subs} extra={subsExtra} terminados={terminados} reduzido={reduzido} aoAbrir={(id) => aoSelecionarSub?.(agente.agente, id)} />

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

    </div>
  );
}
