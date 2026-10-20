import clsx from "clsx";
import { Activity, AlertTriangle, ChevronRight, ExternalLink, List, Layers, Pause, Play, RefreshCw, SearchX } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { cliente } from "../../api/cliente";
import type { Mensagem } from "../../api/tipos";
import { useApi } from "../../api/useApi";
import { useEvento } from "../../api/useStream";
import { LinkPainel } from "../../components/LinkPainel";
import { Badge, EmptyState, PageHeader, Segmented, Skeleton, TempoRelativo } from "../../components/ui";
import { useContextoPainel } from "../../context/ContextoPainel";
import { nomeCurto } from "../../lib/formato";
import "./Feed.css";
import { BarraBusca, ChipFiltro } from "./Filtros";
import { Linha } from "./Linha";
import {
  agrupar, casaFiltro, escreverFiltros, FILTROS_VAZIOS, lerFiltros, limiteInferior, limiteSuperior, mesclar, raizDe, type Grupo,
  type Modo,
} from "./lib";
import { Sobre } from "./Sobre";

const LIMITE = 100;
const LIMITE_JANELA = 500;
const ALTURA_PADRAO = 57;
const TIPOS = ["pedido", "andamento", "entrega", "resposta", "nota"];

type Entrada =
  | { k: string; t: "grupo"; g: Grupo; aberto: boolean }
  | { k: string; t: "msg"; m: Mensagem; recuo: boolean };

function CabecalhoGrupo({ g, aberto, onAlternar, titulo }: { g: Grupo; aberto: boolean; onAlternar: () => void; titulo: string }) {
  const parts = [...new Set(g.mensagens.flatMap((m) => [m.de, m.para]))];
  const ultimo = g.mensagens[g.mensagens.length - 1];
  return (
    <div data-testid="feed-grupo" data-raiz={g.raiz} className="flex items-center gap-2 border-b border-border bg-surface-2/80 pr-3 transition-colors hover:bg-surface-4/60">
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={aberto}
        aria-label={`${aberto ? "Recolher" : "Expandir"} conversa ${g.raiz}`}
        className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left"
      >
        <ChevronRight className={clsx("h-4 w-4 shrink-0 text-texto-fraco transition-transform", aberto && "rotate-90")} aria-hidden="true" />
        <Badge tom="accent" className="px-2 py-0.5 font-mono">{g.mensagens.length} msgs</Badge>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-texto">{titulo}</span>
        <span className="hidden shrink-0 truncate text-xs text-texto-fraco lg:inline">{parts.map(nomeCurto).join(" · ")}</span>
        <TempoRelativo iso={ultimo.ts} className="w-20 shrink-0 text-right text-xs text-texto-fraco" />
      </button>
      <LinkPainel
        to={`/conversas/${encodeURIComponent(g.raiz)}`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-texto transition-colors hover:border-accent/50 hover:text-accent-hover"
      >
        Conversa <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </LinkPainel>
    </div>
  );
}

export default function Feed() {
  const { projeto, periodo } = useContextoPainel();
  const [params, setParams] = useSearchParams();
  const filtros = useMemo(() => lerFiltros(params), [params]);
  const { q, agente, tipo, issue, de, ate, modo } = filtros;

  const aplicar = useCallback((f: Partial<typeof filtros>) => setParams((ant) => escreverFiltros(ant, f), { replace: true }), [setParams]);

  // busca com debounce: o campo é local, a URL e o REST seguem 300 ms depois
  const [busca, setBusca] = useState(q);
  useEffect(() => setBusca(q), [q]);
  useEffect(() => {
    if (busca === q) return;
    const t = setTimeout(() => aplicar({ q: busca }), 300);
    return () => clearTimeout(t);
  }, [busca, q, aplicar]);

  const antes = ate ? new Date(limiteSuperior(filtros)).toISOString() : undefined;
  const { dados, carregando, erro, recarregar } = useApi(
    (c, s) => cliente.mensagens({ projeto: c.projeto, limite: LIMITE, agente, tipo, q, antes }, s),
    [agente, tipo, q, antes],
  );
  const agentes = useApi((c, s) => cliente.agentes(c, s));

  const [itens, setItens] = useState<Mensagem[]>([]);
  const [mais, setMais] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [falhaMais, setFalhaMais] = useState(false);
  const [pausado, setPausado] = useState(false);
  const [buffer, setBuffer] = useState<Mensagem[]>([]);
  const [novos, setNovos] = useState<Set<string>>(new Set());
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  const versao = useRef(0);

  const limInf = limiteInferior(filtros, periodo);
  useEffect(() => {
    if (!dados) return;
    versao.current += 1;
    setItens(dados.mensagens);
    const ult = dados.mensagens[dados.mensagens.length - 1];
    setMais(dados.mais && !(ult && Date.parse(ult.ts) < limInf));
    setBuffer([]);
    setFalhaMais(false);
  }, [dados]);
  // trocar filtro ou período limpa o resto do estado local
  useEffect(() => {
    setBuffer([]);
    setNovos(new Set());
  }, [agente, tipo, q, issue, de, ate, periodo, projeto]);

  const marcarNovos = useCallback((ms: Mensagem[]) => {
    const ids = ms.map((m) => m.id);
    setNovos((s) => new Set([...s, ...ids]));
    setTimeout(() => setNovos((s) => {
      const n = new Set(s);
      ids.forEach((i) => n.delete(i));
      return n;
    }), 4500);
  }, []);

  useEvento("mensagem", (m) => {
    if (!casaFiltro(m, filtros, periodo)) return;
    if (pausado) {
      setBuffer((b) => (b.some((x) => x.id === m.id) || itens.some((x) => x.id === m.id) ? b : [m, ...b]));
      return;
    }
    if (itens.some((x) => x.id === m.id)) return;
    setItens((l) => mesclar([m], l));
    marcarNovos([m]);
  });

  const aplicarBuffer = useCallback(() => {
    if (!buffer.length) return;
    setItens((l) => mesclar(buffer, l));
    marcarNovos(buffer);
    setBuffer([]);
  }, [buffer, marcarNovos]);

  const alternarPausa = () => {
    if (pausado) aplicarBuffer();
    setPausado(!pausado);
  };

  const carregarMais = useCallback(async () => {
    if (!mais || carregandoMais || !itens.length) return;
    const v = versao.current;
    setCarregandoMais(true);
    setFalhaMais(false);
    try {
      const pag = await cliente.mensagens({ projeto: projeto ?? undefined, limite: LIMITE, agente, tipo, q, antes: itens[itens.length - 1].ts });
      if (v !== versao.current) return;
      const ult = pag.mensagens[pag.mensagens.length - 1];
      setItens((l) => mesclar(pag.mensagens, l));
      setMais(pag.mais && pag.mensagens.length > 0 && !(ult && Date.parse(ult.ts) < limInf));
    } catch {
      if (v === versao.current) setFalhaMais(true);
    } finally {
      if (v === versao.current) setCarregandoMais(false);
    }
  }, [mais, carregandoMais, itens, projeto, agente, tipo, q, limInf]);

  const visiveis = useMemo(() => itens.filter((m) => casaFiltro(m, filtros, periodo)), [itens, filtros, periodo]);

  // infinite scroll: sentinela no fim da lista
  const sentinela = useRef<HTMLDivElement>(null);
  const carregarRef = useRef(carregarMais);
  carregarRef.current = carregarMais;
  useEffect(() => {
    const el = sentinela.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && void carregarRef.current(), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [mais, visiveis.length > 0]);
  // se a página ainda cabe na tela (filtro local esvaziou a lista), pede a próxima
  useEffect(() => {
    const el = sentinela.current;
    if (!mais || carregandoMais || falhaMais || !el) return;
    if (el.getBoundingClientRect().top < window.innerHeight + 400) void carregarMais();
  }, [mais, carregandoMais, falhaMais, visiveis.length, carregarMais]);

  const porId = useMemo(() => new Map(itens.map((m) => [m.id, m])), [itens]);
  const raizDoId = useCallback(
    (id: string) => {
      const m = porId.get(id);
      return m ? raizDe(m, porId) : id;
    },
    [porId],
  );

  const entradas = useMemo<Entrada[]>(() => {
    if (modo === "lista") return visiveis.map((m) => ({ k: m.id, t: "msg", m, recuo: false }));
    const out: Entrada[] = [];
    for (const g of agrupar(visiveis, itens)) {
      if (g.mensagens.length === 1) {
        out.push({ k: g.mensagens[0].id, t: "msg", m: g.mensagens[0], recuo: false });
        continue;
      }
      const aberto = !recolhidos.has(g.raiz);
      out.push({ k: `g:${g.raiz}`, t: "grupo", g, aberto });
      if (aberto) for (const m of g.mensagens) out.push({ k: m.id, t: "msg", m, recuo: true });
    }
    return out;
  }, [modo, visiveis, itens, recolhidos]);

  // janela simples (virtualização) acima de ~500 entradas
  const janelar = entradas.length > LIMITE_JANELA;
  const lista = useRef<HTMLDivElement>(null);
  const alturas = useRef(new Map<string, number>());
  const [faixa, setFaixa] = useState({ ini: 0, fim: 40 });
  const [, bump] = useState(0);
  const calcular = useCallback(() => {
    if (!lista.current) return;
    const topo = lista.current.getBoundingClientRect().top + window.scrollY;
    const a = window.scrollY - topo - 800;
    const b = window.scrollY + window.innerHeight - topo + 800;
    let y = 0;
    let ini = -1;
    let fim = entradas.length;
    for (let i = 0; i < entradas.length; i++) {
      const h = alturas.current.get(entradas[i].k) ?? ALTURA_PADRAO;
      if (ini < 0 && y + h >= a) ini = i;
      if (y > b) {
        fim = i;
        break;
      }
      y += h;
    }
    setFaixa((f) => (f.ini === Math.max(ini, 0) && f.fim === fim ? f : { ini: Math.max(ini, 0), fim }));
  }, [entradas]);
  useEffect(() => {
    if (!janelar) return;
    let raf = 0;
    const h = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(calcular);
    };
    calcular();
    window.addEventListener("scroll", h, { passive: true });
    window.addEventListener("resize", h);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", h);
      window.removeEventListener("resize", h);
    };
  }, [janelar, calcular]);
  useLayoutEffect(() => {
    if (!janelar || !lista.current) return;
    let mudou = false;
    lista.current.querySelectorAll<HTMLElement>("[data-k]").forEach((el) => {
      const k = el.dataset.k as string;
      if (alturas.current.get(k) !== el.offsetHeight) {
        alturas.current.set(k, el.offsetHeight);
        mudou = true;
      }
    });
    if (mudou) {
      calcular();
      bump((n) => n + 1);
    }
  });

  const fatia = janelar ? entradas.slice(faixa.ini, faixa.fim) : entradas;
  const somaAlt = (de: number, ate: number) => {
    let s = 0;
    for (let i = de; i < ate; i++) s += alturas.current.get(entradas[i].k) ?? ALTURA_PADRAO;
    return s;
  };

  const alternar = (set: Set<string>, id: string, fn: (s: Set<string>) => void) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    fn(n);
  };

  const opAgentes = (agentes.dados ?? []).map((a) => ({ valor: a.agente, rotulo: a.agente }));
  const opIssues = useMemo(
    () => [...new Set(itens.flatMap((m) => m.issues ?? []))].sort((a, b) => b - a).map((i) => ({ valor: String(i), rotulo: `#${i}` })),
    [itens],
  );
  const filtrando = Boolean(q || agente || tipo || issue || de || ate);
  const tituloGrupo = (g: Grupo) => (porId.get(g.raiz) ?? g.mensagens[0]).assunto ?? g.raiz;

  return (
    <>
      <PageHeader
        icone={Activity}
        titulo="Activity Feed"
        subtitulo="Mensagens do board ao vivo"
        acoes={
          <>
            {buffer.length > 0 && (
              <button
                type="button"
                onClick={aplicarBuffer}
                className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-muted px-3 py-1.5 text-xs font-semibold text-accent-hover transition-colors hover:bg-accent/25 animate-fade-in"
              >
                {buffer.length} {buffer.length === 1 ? "nova" : "novas"}
              </button>
            )}
            <button
              type="button"
              onClick={alternarPausa}
              aria-pressed={pausado}
              className={clsx(
                "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-surface-4",
                pausado ? "text-amber-300" : "text-texto-suave hover:text-texto",
              )}
            >
              {pausado ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
              {pausado ? "Retomar" : "Pausar"}
            </button>
            <button
              type="button"
              onClick={recarregar}
              aria-label="Recarregar"
              className="inline-flex items-center rounded-lg p-2 text-texto-suave transition-colors hover:bg-surface-4 hover:text-texto"
            >
              <RefreshCw className={clsx("h-4 w-4", carregando && "animate-spin")} aria-hidden="true" />
            </button>
          </>
        }
      />

      <Sobre />

      <BarraBusca
        busca={busca}
        onBusca={setBusca}
        de={de}
        ate={ate}
        onDe={(v) => aplicar({ de: v })}
        onAte={(v) => aplicar({ ate: v })}
        filtrando={filtrando}
        onLimpar={() => {
          setBusca("");
          aplicar({ ...FILTROS_VAZIOS, modo });
        }}
      >
        <ChipFiltro rotulo="Agente" valor={agente} opcoes={opAgentes} onChange={(v) => aplicar({ agente: v })} />
        <ChipFiltro rotulo="Tipo" valor={tipo} opcoes={TIPOS.map((t) => ({ valor: t, rotulo: t }))} onChange={(v) => aplicar({ tipo: v })} />
        <ChipFiltro rotulo="Issue" valor={issue} opcoes={opIssues} vazio="Nenhuma issue nas mensagens carregadas" onChange={(v) => aplicar({ issue: v })} />
      </BarraBusca>

      <div className="mb-3 flex items-center justify-between gap-3">
        <Segmented<Modo>
          ariaLabel="Modo de exibição"
          tamanho="sm"
          valor={modo}
          onChange={(v) => aplicar({ modo: v })}
          opcoes={[
            { valor: "grupo", rotulo: "Agrupar por conversa", icone: Layers },
            { valor: "lista", rotulo: "Lista", icone: List },
          ]}
        />
        <span className="text-xs text-texto-fraco" aria-live="polite">
          {visiveis.length} {visiveis.length === 1 ? "mensagem" : "mensagens"}
          {mais ? "+" : ""}
          {pausado && <span className="ml-2 text-amber-300">pausado</span>}
        </span>
      </div>

      {erro ? (
        <EmptyState
          icone={AlertTriangle}
          titulo="Não foi possível carregar as mensagens"
          descricao={erro.message}
          acao={<button type="button" onClick={recarregar} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-4">Tentar de novo</button>}
        />
      ) : carregando && itens.length === 0 ? (
        <div className="space-y-px overflow-hidden rounded-xl border border-border bg-surface-3" aria-busy="true" aria-label="Carregando mensagens">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-border/70 px-4 py-3.5">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      ) : visiveis.length === 0 && !mais ? (
        <EmptyState
          icone={filtrando ? SearchX : Activity}
          titulo={filtrando ? "Nenhuma mensagem com esses filtros" : "Nenhuma mensagem no período"}
          descricao={filtrando ? "Tire algum filtro ou amplie as datas." : "Quando os agentes trocarem mensagens, elas aparecem aqui ao vivo."}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface-3 shadow-card">
          <div ref={lista} role="list" aria-label="Mensagens">
            {janelar && <div aria-hidden="true" style={{ height: somaAlt(0, faixa.ini) }} />}
            {fatia.map((e) => (
              <div key={e.k} data-k={e.k} role="listitem">
                {e.t === "grupo" ? (
                  <CabecalhoGrupo g={e.g} aberto={e.aberto} titulo={tituloGrupo(e.g)} onAlternar={() => alternar(recolhidos, e.g.raiz, setRecolhidos)} />
                ) : (
                  <Linha
                    m={e.m}
                    recuo={e.recuo}
                    novo={novos.has(e.m.id)}
                    expandida={expandidas.has(e.m.id)}
                    onAlternar={() => alternar(expandidas, e.m.id, setExpandidas)}
                    raizDe={raizDoId}
                  />
                )}
              </div>
            ))}
            {janelar && <div aria-hidden="true" style={{ height: somaAlt(faixa.fim, entradas.length) }} />}
          </div>
          <div ref={sentinela} className="flex min-h-10 items-center justify-center py-3 text-xs text-texto-fraco">
            {carregandoMais ? (
              "Carregando mais..."
            ) : falhaMais ? (
              <button type="button" onClick={() => void carregarMais()} className="rounded-lg border border-border px-3 py-1 hover:bg-surface-4">Falhou. Tentar de novo</button>
            ) : mais ? (
              <button type="button" onClick={() => void carregarMais()} className="rounded-lg px-3 py-1 hover:bg-surface-4 hover:text-texto">Carregar mais</button>
            ) : (
              "Fim das mensagens"
            )}
          </div>
        </div>
      )}
    </>
  );
}
