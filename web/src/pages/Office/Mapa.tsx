import { GitFork, Network, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, Segmented } from "../../components/ui";
import { CardAgente } from "./Mapa/CardAgente";
import { corDoAgente, nomeWorktree, rotuloHarness, tarefasAbertasDe } from "./Mapa/dados";
import { calcularLayout, L, recortarSubs } from "./Mapa/layout";
import { subsDe } from "./subagentes";
import type { PropsModoOffice } from "./tipos";

type Visao = "hierarquia" | "times";
type Agrupar = "harness" | "worktree";

export interface PropsMapa extends PropsModoOffice {
  /** Tamanho natural do conteúdo (px), para o "ajustar" do canvas. Chamado quando muda. */
  aoMedir?: (largura: number, altura: number) => void;
}

const VISOES = [
  { valor: "hierarquia", rotulo: "Hierarquia", icone: Network },
  { valor: "times", rotulo: "Times", icone: Users },
] as const;
const AGRUPAMENTOS = [
  { valor: "harness", rotulo: "Harness" },
  { valor: "worktree", rotulo: "Worktree" },
] as const;

export default function Mapa({ agentes, tarefas, selecionado, aoSelecionar, aoSelecionarSub, aoMedir }: PropsMapa) {
  const [visao, setVisao] = useState<Visao>("hierarquia");
  const [agrupar, setAgrupar] = useState<Agrupar>("harness");
  const raiz = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => calcularLayout(agentes, tarefas), [agentes, tarefas]);

  useEffect(() => {
    if (visao === "hierarquia") {
      aoMedir?.(layout.largura, layout.altura);
      return;
    }
    const el = raiz.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => aoMedir?.(el.offsetWidth, el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [visao, layout.largura, layout.altura, aoMedir]);

  if (agentes.length === 0) {
    return <EmptyState icone={GitFork} titulo="Nenhum agente neste projeto" descricao="Cadastre os painéis do time para ver o organograma." />;
  }

  const cabecalho = (
    <div className="absolute left-0 top-0 z-10 flex flex-wrap items-center gap-3" style={{ left: L.pad, top: 14 }}>
      <Segmented ariaLabel="Visão do mapa" tamanho="sm" opcoes={VISOES} valor={visao} onChange={setVisao} />
      {visao === "times" && <Segmented ariaLabel="Agrupar times por" tamanho="sm" opcoes={AGRUPAMENTOS} valor={agrupar} onChange={setAgrupar} />}
    </div>
  );

  if (visao === "hierarquia") {
    return (
      <div ref={raiz} data-testid="mapa-hierarquia" className="relative" style={{ width: layout.largura, height: layout.altura }}>
        {cabecalho}
        <svg className="pointer-events-none absolute inset-0" width={layout.largura} height={layout.altura} aria-hidden="true">
          {layout.ligacoes.map((l) => {
            const filho = agentes.find((a) => a.agente === l.para);
            const cor = filho ? corDoAgente(filho) : "#363650";
            const ativo = filho?.status === "trabalhando";
            const sel = selecionado === l.para;
            return (
              <g key={`${l.de}>${l.para}`} data-ligacao={l.para}>
                <path d={l.d} fill="none" stroke={cor} strokeOpacity={sel ? 0.9 : 0.4} strokeWidth={sel ? 2.25 : 1.5} strokeLinecap="round" />
                {ativo && (
                  <path d={l.d} fill="none" stroke={cor} strokeWidth={2.25} strokeLinecap="round" strokeDasharray="4 14">
                    <animate attributeName="stroke-dashoffset" from="36" to="0" dur="1.6s" repeatCount="indefinite" />
                  </path>
                )}
              </g>
            );
          })}
        </svg>
        {layout.nos.map((n) => (
          <CardAgente
            key={n.agente.agente}
            agente={n.agente}
            tarefas={tarefas}
            abertas={n.tarefas}
            visiveis={n.visiveis}
            selecionado={selecionado === n.agente.agente}
            aoSelecionar={aoSelecionar}
            estilo={{ position: "absolute", left: n.x, top: n.y }}
            w={n.w}
            h={n.h}
            subs={n.subs}
            subsExtra={n.subsExtra}
            modoSubs="lado"
            aoSelecionarSub={aoSelecionarSub}
          />
        ))}
      </div>
    );
  }

  // Times: colunas por harness ou worktree
  const grupos = new Map<string, typeof agentes>();
  for (const a of agentes) {
    const chave = agrupar === "harness" ? (rotuloHarness(a.harness) ?? "Sem harness") : nomeWorktree(a.worktree);
    grupos.set(chave, [...(grupos.get(chave) ?? []), a]);
  }
  const colunas = [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR"));

  return (
    <div ref={raiz} data-testid="mapa-times" className="relative inline-block min-w-full" style={{ padding: `${L.topo}px ${L.pad}px ${L.pad}px` }}>
      {cabecalho}
      <div className="flex items-start gap-6">
        {colunas.map(([nome, lista]) => {
          const trabalhando = lista.filter((a) => a.status === "trabalhando").length;
          return (
            <section key={nome} data-testid="coluna-time" data-grupo={nome} aria-label={`Time ${nome}`} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface-1/70 p-4" style={{ width: L.larg + 32 }}>
              <header className="flex items-center justify-between gap-2 border-b border-border pb-3">
                <h3 className="truncate text-sm font-semibold text-texto" title={nome}>
                  {nome}
                </h3>
                <span className="shrink-0 text-[11px] text-texto-suave">
                  {lista.length} {lista.length === 1 ? "agente" : "agentes"}
                  {trabalhando > 0 && <span className="ml-1.5 text-status-trabalhando">· {trabalhando} ativo{trabalhando === 1 ? "" : "s"}</span>}
                </span>
              </header>
              {lista.map((a) => {
                const abertas = tarefasAbertasDe(a.agente, tarefas);
                const { mostradas, extra } = recortarSubs(subsDe(a));
                return (
                  <CardAgente
                    key={a.agente}
                    agente={a}
                    tarefas={tarefas}
                    abertas={abertas}
                    visiveis={Math.min(abertas.length, L.maxTarefas)}
                    selecionado={selecionado === a.agente}
                    aoSelecionar={aoSelecionar}
                    w={L.larg}
                    h={a.papel === "master" ? L.altMaster : L.alt}
                    subs={mostradas}
                    subsExtra={extra}
                    modoSubs="abaixo"
                    aoSelecionarSub={aoSelecionarSub}
                  />
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
