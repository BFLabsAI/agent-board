import { linkHorizontal, scaleSqrt } from "d3";
import { RolagemX } from "../../components/RolagemX";
import { X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { formatarNumero, truncar } from "../../lib/formato";
import {
  ID_MAIS,
  LARGURA,
  LARG_NO,
  TOPO,
  FOLGA,
  larguraPilula,
  maxCharsRotulo,
  posicionarTooltip,
  subsPorAgente,
  xColuna,
  agruparIssues,
  agentesDoSub,
  caminhoDe,
  colunasDoGrafo,
  COR_SUBAGENTE,
  ehSub,
  chaveAresta,
  ehAgente,
  layoutGrafo,
  type Aresta,
  type No,
  type NoPos,
} from "./derivar";

const DESCRICAO: Record<string, string> = {
  master: "Quem distribui o trabalho. As arestas saem para os agentes que receberam pedidos.",
  manager: "Agente que executa pedidos do master. Cada aresta à direita é uma issue que ele tocou.",
  researcher: "Agente de pesquisa. Recebe pedidos do master como os managers.",
  subagente: "Tipo de sub-agent (Agent/Task) que os agentes dispararam. Fica na faixa abaixo do fluxo; o selo ⑂ no agente mostra quantos ele disparou. Clicar destaca quem o usa.",
  issue: "Issue do GitHub citada nas conversas. Segue para a revisão do master.",
  revisao: "Entregas que passaram pela revisão do master, antes do resultado.",
  resultado: "Como as conversas terminaram no período.",
};
const NOME_COLUNA: Record<string, string> = {
  master: "MASTER",
  manager: "MANAGER",
  researcher: "RESEARCHER",
  subagente: "SUB-AGENT",
  issue: "ISSUE",
  revisao: "REVISÃO",
  resultado: "RESULTADO",
};

export function GrafoOrquestracao({
  nos,
  arestas,
  selecionado,
  onSelecionar,
}: {
  nos: No[];
  arestas: Aresta[];
  selecionado: string | null;
  onSelecionar: (id: string | null) => void;
}) {
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<string | null>(null);
  const agrupado = useMemo(() => agruparIssues(nos, arestas), [nos, arestas]);
  const { pos: posMain, subPos, faixa, alturaGrafo, altura } = useMemo(() => layoutGrafo(agrupado.nos), [agrupado.nos]);
  const pos = useMemo(() => [...posMain, ...subPos], [posMain, subPos]);
  const porId = useMemo(() => new Map(pos.map((p) => [p.id, p])), [pos]);
  const satelites = useMemo(() => subsPorAgente(agrupado.arestas), [agrupado.arestas]);
  const caixaRef = useRef<HTMLDivElement>(null);
  const [dica, setDica] = useState<{ x: number; y: number; texto: string; chave: string } | null>(null);
  const [tamDica, setTamDica] = useState<{ w: number; h: number }>({ w: 200, h: 26 });
  const dicaRef = (el: HTMLDivElement | null) => {
    if (el && (el.offsetWidth !== tamDica.w || el.offsetHeight !== tamDica.h)) setTamDica({ w: el.offsetWidth, h: el.offsetHeight });
  };
  const moverDica = (e: { clientX: number; clientY: number }, texto: string, chave: string) => {
    const r = caixaRef.current?.getBoundingClientRect();
    if (r) setDica({ x: e.clientX - r.left, y: e.clientY - r.top, texto, chave });
  };
  const maxN = Math.max(1, ...agrupado.arestas.map((a) => a.n));
  const largura = useMemo(() => scaleSqrt().domain([0, maxN]).range([1.5, 16]), [maxN]);
  const larguraSub = useMemo(() => scaleSqrt().domain([0, maxN]).range([0.8, 3.5]), [maxN]);
  const colunas = useMemo(() => colunasDoGrafo(), []);
  const caixaDica = caixaRef.current?.getBoundingClientRect();
  const posDica = dica && caixaDica ? posicionarTooltip(dica, { w: caixaDica.width, h: caixaDica.height }, tamDica) : null;
  const ehArestaSub = (a: Aresta) => porId.get(a.para)?.coluna === "subagente";
  const gerador = useMemo(
    () =>
      linkHorizontal<{ s: [number, number]; t: [number, number] }, [number, number]>()
        .source((d) => d.s)
        .target((d) => d.t),
    [],
  );

  const ativo = hover ?? selecionado;
  const caminho = useMemo(() => {
    if (!ativo) return null;
    const no = porId.get(ativo);
    return no && ehSub(no.coluna) ? agentesDoSub(ativo, agrupado.arestas) : caminhoDe(ativo, agrupado.arestas);
  }, [ativo, agrupado.arestas, porId]);
  const usadoPor = useMemo(
    () => (selecionado && porId.get(selecionado)?.coluna === "subagente" ? agrupado.arestas.filter((a) => a.para === selecionado).sort((a, b) => b.n - a.n) : []),
    [selecionado, porId, agrupado.arestas],
  );
  const sel = selecionado ? porId.get(selecionado) : undefined;

  return (
    <div className="relative flex flex-col" ref={caixaRef}>
      <RolagemX rotulo="Grafo de orquestração (rolagem horizontal)"><svg viewBox={`0 0 ${LARGURA} ${altura}`} className="block w-full min-w-[900px]" role="group" aria-label="Grafo de orquestração" data-testid="grafo-orquestracao">
        <defs>
          {agrupado.arestas.map((a, i) => {
            const s = porId.get(a.de);
            const t = porId.get(a.para);
            if (!s || !t || ehArestaSub(a)) return null;
            return (
              <linearGradient key={i} id={`${uid}-g${i}`} gradientUnits="userSpaceOnUse" x1={s.x + s.w} y1="0" x2={t.x} y2="0">
                <stop offset="0" stopColor={s.cor} />
                <stop offset="1" stopColor={t.cor} />
              </linearGradient>
            );
          })}
        </defs>

        {colunas.map((c, i) => {
          const cx = xColuna(i, colunas.length);
          return (
            <g key={c.titulo}>
              {i > 0 && <line x1={cx - 30} x2={cx - 30} y1={TOPO - 8} y2={alturaGrafo - 12} stroke="#2a2a3d" strokeDasharray="2 6" opacity="0.5" />}
              <text x={cx + LARG_NO / 2} y={28} textAnchor="middle" fontSize="11" letterSpacing="1.5" fill="#6b7280" fontWeight="500">
                {c.titulo}
              </text>
            </g>
          );
        })}

        {faixa && (
          <g data-testid="faixa-subagentes">
            <rect x={FOLGA - 12} y={faixa.y} width={LARGURA - 2 * (FOLGA - 12)} height={faixa.h} rx="10" fill="#f472b6" opacity="0.04" stroke="#f472b6" strokeOpacity="0.18" strokeDasharray="3 5" />
            <text x={FOLGA} y={faixa.y + 30} fontSize="11" letterSpacing="1.5" fill="#6b7280" fontWeight="500">SUB-AGENTS</text>
            <text x={FOLGA} y={faixa.y + 46} fontSize="10" fill="#6b7280">tipos disparados pelos agentes</text>
          </g>
        )}

        <g fill="none">
          {agrupado.arestas.map((a, i) => {
            const s = porId.get(a.de);
            const t = porId.get(a.para);
            if (!s || !t) return null;
            const dentro = !caminho || caminho.arestas.has(chaveAresta(a));
            const sub = ehArestaSub(a);
            const texto = `${s.rotulo} → ${t.rotulo}: ${a.n}`;
            const d = sub
              ? // desce por um trilho à esquerda do nó e entra na pílula por cima: não cruza o fluxo principal
                `M${s.x},${s.y + s.h / 2} H${s.x - 14} V${t.y - 7 - (i % 3) * 2} H${t.x + t.w / 2} V${t.y}`
              : gerador({ s: [s.x + s.w, s.y + s.h / 2], t: [t.x, t.y + t.h / 2] });
            const realce = dica?.chave === chaveAresta(a);
            return (
              <g key={chaveAresta(a)}>
                <path
                  d={d ?? ""}
                  stroke={sub ? t.cor : `url(#${uid}-g${i})`}
                  strokeWidth={sub ? larguraSub(a.n) : largura(a.n)}
                  strokeDasharray={sub ? "5 4" : undefined}
                  strokeLinejoin="round"
                  data-tipo-aresta={sub ? "subagente" : undefined}
                  strokeLinecap="round"
                  opacity={realce ? 0.95 : dentro ? (caminho ? 0.85 : sub ? 0.14 : 0.5) : sub ? 0.07 : 0.07}
                  style={{ transition: "opacity 160ms" }}
                  data-aresta={chaveAresta(a)}
                />
                <path
                  d={d ?? ""}
                  stroke="transparent"
                  strokeWidth={Math.max(12, sub ? 12 : largura(a.n))}
                  pointerEvents="stroke"
                  data-hit={chaveAresta(a)}
                  onMouseEnter={(e) => moverDica(e, texto, chaveAresta(a))}
                  onMouseMove={(e) => moverDica(e, texto, chaveAresta(a))}
                  onMouseLeave={() => setDica(null)}
                />
              </g>
            );
          })}
        </g>

        {pos.map((p) => (
          <Retangulo
            key={p.id}
            p={p}
            sat={satelites.get(p.id)}
            dentro={!caminho || caminho.nos.has(p.id)}
            selecionado={p.id === selecionado}
            onHover={setHover}
            onClique={() => onSelecionar(p.id === selecionado ? null : p.id)}
          />
        ))}
      </svg></RolagemX>

      {dica && (
        <div
          ref={dicaRef}
          role="tooltip"
          data-testid="tooltip-aresta"
          className="pointer-events-none absolute z-10 max-w-[calc(100%-8px)] whitespace-nowrap rounded border border-border bg-surface-3 px-2 py-1 text-xs text-texto shadow-lg"
          style={{ left: posDica?.left ?? dica.x + 14, top: posDica?.top ?? dica.y + 14 }}
        >
          {dica.texto}
        </div>
      )}

      {sel && (
        <div className="order-first flex animate-fade-in flex-wrap items-start gap-x-8 gap-y-3 border-b border-border bg-surface-2/60 px-5 py-4" data-testid="detalhe-no">
          <div className="min-w-[10rem]">
            <p className="max-w-[16rem] truncate text-sm font-semibold text-texto" title={sel.rotulo}>{sel.rotulo}</p>
            <p className="text-[11px] uppercase tracking-wider text-texto-fraco">{NOME_COLUNA[sel.coluna] ?? sel.coluna}</p>
          </div>
          <dl className="grid grid-cols-3 gap-x-6 text-xs">
            <Linha k="Contagem" v={formatarNumero(sel.n)} forte />
            <Linha k="Recebe de" v={formatarNumero(agrupado.arestas.filter((a) => a.para === sel.id).reduce((s, a) => s + a.n, 0))} />
            <Linha k="Envia para" v={formatarNumero(agrupado.arestas.filter((a) => a.de === sel.id).reduce((s, a) => s + a.n, 0))} />
          </dl>
          {usadoPor.length > 0 && (
            <div className="min-w-[10rem] text-xs" data-testid="usado-por">
              <p className="text-texto-suave">Usado por</p>
              <ul className="mt-0.5 space-y-0.5">
                {usadoPor.map((a) => (
                  <li key={a.de} className="flex items-center gap-2 text-texto">
                    <span className="truncate" title={a.de}>{a.de.replace(/^[^-]+-(?=(master|manager|researcher))/i, "")}</span>
                    <span className="ml-auto font-mono text-texto-suave">{a.n}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="min-w-[14rem] flex-1 text-xs leading-relaxed text-texto-suave">
            {sel.id === ID_MAIS ? "Issues menores agrupadas para não poluir o grafo." : DESCRICAO[sel.coluna]}
            <span className="mt-1 block text-[11px] text-texto-fraco">As outras seções estão filtradas por este nó.</span>
          </p>
          <button type="button" aria-label="Fechar detalhe e limpar filtro" onClick={() => onSelecionar(null)} className="rounded p-0.5 text-texto-fraco hover:bg-surface-4 hover:text-texto focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-4 py-3 text-xs text-texto-suave" aria-label="Legenda">
        <li className="text-[11px] uppercase tracking-wider text-texto-fraco">Legenda</li>
        {[
          ["Master", "#f59e0b"],
          ["Manager", "#6366f1"],
          ["Researcher", "#10b981"],
          ["Sub-agent", COR_SUBAGENTE],
          ["Issue", "#38bdf8"],
          ["Revisão", "#a78bfa"],
          ["Aprovado", "#34d399"],
          ["Rejeitado", "#f87171"],
          ["Atrasado", "#fb923c"],
          ["Em aberto", "#94a3b8"],
        ].map(([r, c]) => (
          <li key={r} className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border" style={{ borderColor: c, background: `${c}33` }} />
            {r}
          </li>
        ))}
        <li className="inline-flex items-center gap-1.5">
          <span className="h-1 w-6 rounded-full bg-gradient-to-r from-indigo-500 to-sky-400" />
          Espessura da aresta = volume
        </li>
        <li className="inline-flex items-center gap-1.5">
          <svg width="28" height="4" aria-hidden="true"><line x1="0" y1="2" x2="28" y2="2" stroke={COR_SUBAGENTE} strokeWidth="1.2" strokeDasharray="5 4" /></svg>
          Tracejada (ao passar o mouse) = agente → sub-agent
        </li>
      </ul>
    </div>
  );
}

function Linha({ k, v, forte }: { k: string; v: string; forte?: boolean }) {
  return (
    <div>
      <dt className="text-texto-suave">{k}</dt>
      <dd className={forte ? "text-base font-semibold text-texto" : "text-base text-texto"}>{v}</dd>
    </div>
  );
}

function Retangulo({
  p,
  sat,
  dentro,
  selecionado,
  onHover,
  onClique,
}: {
  p: NoPos;
  sat?: number;
  dentro: boolean;
  selecionado: boolean;
  onHover: (id: string | null) => void;
  onClique: () => void;
}) {
  const nTxt = formatarNumero(p.n);
  const pill = larguraPilula(nTxt);
  // o rótulo nunca invade a pílula da contagem
  const rotulo = truncar(ehAgente(p.coluna) ? p.rotulo.replace(/^[^-]+-(?=(master|manager|researcher))/i, "") : p.rotulo, maxCharsRotulo(p.w, nTxt));
  const satTxt = sat ? `⑂ ${formatarNumero(sat)}` : "";
  const satW = satTxt.length * 6 + 8;
  return (
    <g
      transform={`translate(${p.x} ${p.y})`}
      role="button"
      tabIndex={0}
      aria-pressed={selecionado}
      aria-label={`${p.rotulo}: ${p.n}`}
      data-no={p.id}
      className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-white"
      style={{ opacity: dentro ? 1 : 0.25, transition: "opacity 160ms" }}
      onMouseEnter={() => onHover(p.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(p.id)}
      onBlur={() => onHover(null)}
      onClick={onClique}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClique();
        }
      }}
    >
      <title>{p.rotulo}</title>
      <rect width={p.w} height={p.h} rx="8" fill={`${p.cor}26`} stroke={p.cor} strokeWidth={selecionado ? 2.5 : 1.25} />
      <text x="12" y={p.h / 2 + 4} fontSize="12.5" fill={p.cor} style={{ filter: "brightness(1.25)" }}>
        {rotulo}
      </text>
      <rect x={p.w - pill - 8} y={p.h / 2 - 9} width={pill} height="18" rx="9" fill={`${p.cor}33`} />
      <text x={p.w - 8 - pill / 2} y={p.h / 2 + 4} fontSize="11" textAnchor="middle" fill="#e4e4ed" fontWeight="600">
        {nTxt}
      </text>
      {satTxt && (
        <g data-satelite={p.id}>
          <title>{`${sat} sub-agents disparados`}</title>
          <rect x="10" y={p.h - 7} width={satW} height="14" rx="7" fill="#1b1b2b" stroke={COR_SUBAGENTE} strokeOpacity="0.7" />
          <text x={10 + satW / 2} y={p.h + 3} fontSize="9.5" textAnchor="middle" fill={COR_SUBAGENTE}>{satTxt}</text>
        </g>
      )}
    </g>
  );
}
