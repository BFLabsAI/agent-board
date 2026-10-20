import { linkHorizontal, scaleSqrt } from "d3";
import { RolagemX } from "../../components/RolagemX";
import { X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { formatarNumero, truncar } from "../../lib/formato";
import {
  ALT_NO,
  COLUNAS_GRAFO,
  ID_MAIS,
  LARGURA,
  LARG_NO,
  TOPO,
  agruparIssues,
  caminhoDe,
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
  issue: "Issue do GitHub citada nas conversas. Segue para a revisão do master.",
  revisao: "Entregas que passaram pela revisão do master, antes do resultado.",
  resultado: "Como as conversas terminaram no período.",
};
const NOME_COLUNA: Record<string, string> = {
  master: "MASTER",
  manager: "MANAGER",
  researcher: "RESEARCHER",
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
  const { pos, altura } = useMemo(() => layoutGrafo(agrupado.nos), [agrupado.nos]);
  const porId = useMemo(() => new Map(pos.map((p) => [p.id, p])), [pos]);
  const maxN = Math.max(1, ...agrupado.arestas.map((a) => a.n));
  const largura = useMemo(() => scaleSqrt().domain([0, maxN]).range([1.5, 16]), [maxN]);
  const gerador = useMemo(
    () =>
      linkHorizontal<{ s: [number, number]; t: [number, number] }, [number, number]>()
        .source((d) => d.s)
        .target((d) => d.t),
    [],
  );

  const ativo = hover ?? selecionado;
  const caminho = useMemo(() => (ativo ? caminhoDe(ativo, agrupado.arestas) : null), [ativo, agrupado.arestas]);
  const sel = selecionado ? porId.get(selecionado) : undefined;

  return (
    <div className="flex flex-col">
      <RolagemX rotulo="Grafo de orquestração (rolagem horizontal)"><svg viewBox={`0 0 ${LARGURA} ${altura}`} className="block w-full min-w-[760px]" role="group" aria-label="Grafo de orquestração" data-testid="grafo-orquestracao">
        <defs>
          {agrupado.arestas.map((a, i) => {
            const s = porId.get(a.de);
            const t = porId.get(a.para);
            if (!s || !t) return null;
            return (
              <linearGradient key={i} id={`${uid}-g${i}`} gradientUnits="userSpaceOnUse" x1={s.x + s.w} y1="0" x2={t.x} y2="0">
                <stop offset="0" stopColor={s.cor} />
                <stop offset="1" stopColor={t.cor} />
              </linearGradient>
            );
          })}
        </defs>

        {COLUNAS_GRAFO.map((c, i) => {
          const passoX = (LARGURA - 56 - LARG_NO) / (COLUNAS_GRAFO.length - 1);
          return (
            <g key={c.titulo}>
              {i > 0 && <line x1={28 + i * passoX - 24} x2={28 + i * passoX - 24} y1={TOPO - 8} y2={altura - 12} stroke="#2a2a3d" strokeDasharray="2 6" opacity="0.5" />}
              <text x={28 + i * passoX + LARG_NO / 2} y={28} textAnchor="middle" fontSize="11" letterSpacing="1.5" fill="#6b7280" fontWeight="500">
                {c.titulo}
              </text>
            </g>
          );
        })}

        <g fill="none">
          {agrupado.arestas.map((a, i) => {
            const s = porId.get(a.de);
            const t = porId.get(a.para);
            if (!s || !t) return null;
            const d = gerador({ s: [s.x + s.w, s.y + s.h / 2], t: [t.x, t.y + t.h / 2] });
            const dentro = !caminho || caminho.arestas.has(chaveAresta(a));
            return (
              <path
                key={chaveAresta(a)}
                d={d ?? ""}
                stroke={`url(#${uid}-g${i})`}
                strokeWidth={largura(a.n)}
                strokeLinecap="round"
                opacity={dentro ? (caminho ? 0.85 : 0.5) : 0.07}
                style={{ transition: "opacity 160ms" }}
                data-aresta={chaveAresta(a)}
              >
                <title>{`${s.rotulo} → ${t.rotulo}: ${a.n}`}</title>
              </path>
            );
          })}
        </g>

        {pos.map((p) => (
          <Retangulo
            key={p.id}
            p={p}
            dentro={!caminho || caminho.nos.has(p.id)}
            selecionado={p.id === selecionado}
            onHover={setHover}
            onClique={() => onSelecionar(p.id === selecionado ? null : p.id)}
          />
        ))}
      </svg></RolagemX>

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
  dentro,
  selecionado,
  onHover,
  onClique,
}: {
  p: NoPos;
  dentro: boolean;
  selecionado: boolean;
  onHover: (id: string | null) => void;
  onClique: () => void;
}) {
  const rotulo = truncar(ehAgente(p.coluna) ? p.rotulo.replace(/^[^-]+-(?=(master|manager|researcher))/i, "") : p.rotulo, 15);
  const nTxt = formatarNumero(p.n);
  const pill = Math.max(26, nTxt.length * 7 + 12);
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
      <rect width={p.w} height={ALT_NO} rx="8" fill={`${p.cor}26`} stroke={p.cor} strokeWidth={selecionado ? 2.5 : 1.25} />
      <text x="12" y={ALT_NO / 2 + 4} fontSize="12.5" fill={p.cor} style={{ filter: "brightness(1.25)" }}>
        {rotulo}
      </text>
      <rect x={p.w - pill - 8} y={ALT_NO / 2 - 9} width={pill} height="18" rx="9" fill={`${p.cor}33`} />
      <text x={p.w - 8 - pill / 2} y={ALT_NO / 2 + 4} fontSize="11" textAnchor="middle" fill="#e4e4ed" fontWeight="600">
        {nTxt}
      </text>
    </g>
  );
}
