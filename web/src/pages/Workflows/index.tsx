import { AlertTriangle, ArrowRightLeft, GitBranch, MessagesSquare, MessageSquareText, RefreshCw, ShieldCheck, Workflow, Timer, Users, X, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cliente } from "../../api/cliente";
import { useApi } from "../../api/useApi";
import { useEvento } from "../../api/useStream";
import { Card, EmptyState, PageHeader, Segmented, Skeleton } from "../../components/ui";
import { PERIODOS, useContextoPainel } from "../../context/ContextoPainel";
import { formatarDuracaoMin, formatarNumero, formatarPercentual } from "../../lib/formato";
import { Dica } from "./Dica";
import { FluxosComuns } from "./FluxosComuns";
import { GrafoComunicacao } from "./GrafoComunicacao";
import { GrafoOrquestracao } from "./GrafoOrquestracao";
import { ehAgente, filtroFluxos } from "./derivar";

export const ATRASO_LIVE_MS = 3000;

function hora(d: Date): string {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function Workflows() {
  const { periodo, setPeriodo } = useContextoPainel();
  const { dados, erro, recarregar } = useApi((c, s) => cliente.workflows(c, s));
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [atualizado, setAtualizado] = useState<Date | null>(null);

  useEffect(() => {
    if (dados) setAtualizado(new Date());
  }, [dados]);

  // ao vivo: mensagem nova refaz o REST, no máximo uma vez a cada 3 s
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEvento("mensagem", () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      recarregar();
    }, ATRASO_LIVE_MS);
  });
  // sub-agent novo ou que mudou de status também mexe no grafo
  useEvento("subagente", () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      recarregar();
    }, ATRASO_LIVE_MS);
  });
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // o nó escolhido some se o período mudar e ele deixar de existir
  useEffect(() => {
    if (dados && selecionado && !dados.nos.some((n) => n.id === selecionado) && !selecionado.startsWith("__")) setSelecionado(null);
  }, [dados, selecionado]);

  const noSel = dados?.nos.find((n) => n.id === selecionado);
  const filtro = filtroFluxos(noSel);
  const fluxos = useMemo(() => (dados ? (filtro ? dados.fluxos.filter((f) => filtro(f.sequencia)) : dados.fluxos) : []), [dados, filtro]);
  const comunicacao = dados?.comunicacao ?? [];
  const agentesEnvolvidos = dados ? dados.nos.filter((n) => ehAgente(n.coluna)).length : 0;
  const vazio = !!dados && dados.nos.length === 0 && dados.kpis.conversas === 0 && comunicacao.length === 0;
  const k = dados?.kpis;
  const fluxoMais = k?.fluxo_mais_comum ? k.fluxo_mais_comum.split(">").map((s) => s.trim()).join(" → ") : null;

  return (
    <>
      <PageHeader
        icone={GitBranch}
        titulo="Workflows"
        subtitulo="Inteligência de orquestração do time"
        acoes={
          <>
            <Segmented ariaLabel="Período" opcoes={PERIODOS} valor={periodo} onChange={setPeriodo} />
            <button type="button" aria-label="Atualizar agora" onClick={recarregar} className="rounded-lg p-2 text-texto-suave transition-colors hover:bg-surface-4 hover:text-texto focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="whitespace-nowrap text-xs text-texto-fraco" data-testid="atualizado">
              {atualizado ? `Atualizado às ${hora(atualizado)}` : "Carregando…"}
            </span>
          </>
        }
      />

      {erro && !dados ? (
        <EmptyState icone={AlertTriangle} titulo="Não foi possível carregar" descricao={erro.message} />
      ) : (
        <>
          <div className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-4 2xl:grid-cols-7">
            <Kpi rotulo="Conversas" icone={MessagesSquare} tom="text-sky-400" carregando={!dados} dica="Quantas conversas (pedido e tudo que respondeu a ele) começaram no período.">
              {formatarNumero(k?.conversas ?? 0)}
            </Kpi>
            <Kpi rotulo="Taxa de aprovação" icone={ShieldCheck} tom="text-emerald-400" carregando={!dados} dica="Das entregas revisadas pelo master, a fração aprovada. Traço quando ninguém revisou ainda.">
              {formatarPercentual(k?.taxa_aprovacao)}
            </Kpi>
            <Kpi rotulo="Tempo até entrega (p50)" icone={Timer} tom="text-amber-400" carregando={!dados} dica="Mediana do tempo entre o pedido e a primeira entrega. Metade das conversas entrega mais rápido que isso.">
              {formatarDuracaoMin(k?.tempo_ate_entrega_p50_min)}
            </Kpi>
            <Kpi rotulo="Mensagens por conversa" icone={MessageSquareText} tom="text-violet-400" carregando={!dados} dica="Média de mensagens trocadas em cada conversa. Número alto indica muito vai e vem.">
              {k?.msgs_por_conversa == null ? "—" : k.msgs_por_conversa.toFixed(1).replace(".", ",")}
            </Kpi>
            <Kpi rotulo="Fluxo mais comum" icone={ArrowRightLeft} tom="text-accent-hover" carregando={!dados} dica="A sequência de tipos de mensagem que mais se repete nas conversas do período." titulo={fluxoMais ?? undefined} truncado>
              {fluxoMais ?? "—"}
            </Kpi>
            <Kpi rotulo="Agentes envolvidos" icone={Users} tom="text-orange-400" carregando={!dados} dica="Agentes (master, managers e researchers) que aparecem em alguma conversa do período.">
              {formatarNumero(agentesEnvolvidos)}
            </Kpi>
            <Kpi rotulo="Sub-agents" icone={Workflow} tom="text-pink-400" carregando={!dados} dica="Sub-agents (Agent/Task) disparados pelos agentes no período e a parte deles ligada a alguma issue.">
              {formatarNumero(k?.subagentes ?? 0)}
              {k?.subagentes_com_issue != null && (
                <span className="ml-2 text-xs font-normal text-texto-suave" data-testid="kpi-sub-issue">{formatarPercentual(k.subagentes_com_issue)} em issues</span>
              )}
            </Kpi>
          </div>

          {noSel && (
            <div className="mb-4 flex items-center gap-2 text-sm text-texto-suave" data-testid="filtro-ativo">
              Filtrando por
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-muted px-2.5 py-0.5 text-xs font-medium text-accent-hover">
                {noSel.rotulo}
                <button type="button" aria-label="Limpar filtro" onClick={() => setSelecionado(null)} className="rounded-full hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </span>
            </div>
          )}

          {vazio ? (
            <EmptyState icone={GitBranch} titulo="Nenhuma conversa no período" descricao="Quando o master mandar pedidos aos agentes, o grafo de orquestração, a comunicação e os fluxos aparecem aqui." />
          ) : (
            <div className="space-y-10">
              <Secao n={1} titulo="Grafo de orquestração" dica="Cada coluna é uma etapa: do master aos agentes, às issues, à revisão e ao resultado. A espessura da aresta é o número de conversas que passou por ali." nota="Padrões agregados do período. Clique num nó para filtrar o resto da página.">
                <Card semPadding className="overflow-hidden">
                  {dados ? <GrafoOrquestracao nos={dados.nos} arestas={dados.arestas} selecionado={selecionado} onSelecionar={setSelecionado} /> : <Skeleton className="h-[520px] w-full rounded-none" />}
                </Card>
              </Secao>

              <Secao n={2} titulo="Comunicação" dica="Quem fala com quem. A seta mostra o sentido da mensagem e a espessura, o volume no período." nota={selecionado && noSel && ehAgente(noSel.coluna) ? "Mostrando as conversas de um agente" : "Passe o mouse num agente para destacar suas conversas"}>
                <Card semPadding>
                  {!dados ? (
                    <Skeleton className="h-[420px] w-full rounded-none" />
                  ) : comunicacao.length === 0 ? (
                    <div className="py-16 text-center text-sm text-texto-suave">Sem mensagens entre agentes no período.</div>
                  ) : (
                    <GrafoComunicacao comunicacao={comunicacao} selecionado={selecionado && noSel && ehAgente(noSel.coluna) ? selecionado : null} onSelecionar={setSelecionado} />
                  )}
                </Card>
              </Secao>

              <Secao n={3} titulo="Fluxos mais comuns" dica="Sequência de tipos de mensagem em cada conversa, do pedido ao desfecho. A barra compara com o fluxo mais frequente." nota={filtro ? "Filtrado pelo resultado escolhido" : "Top 10 do período"}>
                <Card semPadding>
                  {!dados ? (
                    <Skeleton className="h-48 w-full rounded-none" />
                  ) : fluxos.length === 0 ? (
                    <div className="py-12 text-center text-sm text-texto-suave">Nenhum fluxo {filtro ? "com esse resultado" : "no período"}.</div>
                  ) : (
                    <FluxosComuns fluxos={fluxos} />
                  )}
                </Card>
              </Secao>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Secao({ n, titulo, dica, nota, children }: { n: number; titulo: string; dica: string; nota?: string; children: ReactNode }) {
  return (
    <section aria-label={titulo}>
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-muted text-xs font-semibold text-accent-hover">{n}</span>
          <h2 className="text-base font-semibold text-texto">{titulo}</h2>
          <Dica texto={dica} rotulo={`Sobre ${titulo}`} />
        </div>
        {nota && <p className="hidden text-xs text-texto-fraco md:block">{nota}</p>}
      </div>
      {children}
    </section>
  );
}

function Kpi({
  rotulo,
  icone: Icone,
  tom,
  dica,
  carregando,
  truncado,
  titulo,
  children,
}: {
  rotulo: string;
  icone: LucideIcon;
  tom: string;
  dica: string;
  carregando?: boolean;
  truncado?: boolean;
  titulo?: string;
  children: ReactNode;
}) {
  return (
    <Card className="flex min-w-0 flex-col justify-between gap-3 p-5" data-testid="kpi">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium uppercase leading-tight tracking-[0.12em] text-texto-suave">{rotulo}</span>
        <Icone className={`h-5 w-5 shrink-0 ${tom}`} aria-hidden="true" />
      </div>
      <div className="flex items-end justify-between gap-2">
        {carregando ? (
          <Skeleton className="h-9 w-24" />
        ) : (
          <span className={`min-w-0 text-3xl font-semibold leading-none text-texto ${truncado ? "truncate text-xl" : ""}`} title={titulo}>
            {children}
          </span>
        )}
        <Dica texto={dica} rotulo={`Sobre ${rotulo}`} />
      </div>
    </Card>
  );
}
