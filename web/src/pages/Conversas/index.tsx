import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, ChevronRight, GitBranch, MessagesSquare, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { cliente } from "../../api/cliente";
import type { Conversa, EstadoTarefa } from "../../api/tipos";
import { useApi } from "../../api/useApi";
import { useEvento } from "../../api/useStream";
import { LinkPainel } from "../../components/LinkPainel";
import { AgentAvatar, Badge, EmptyState, PageHeader, Skeleton, StatusBadge, TempoRelativo } from "../../components/ui";
import { formatarDuracaoMin, nomeCurto } from "../../lib/formato";
import { ESTILO_ESTADO_TAREFA } from "../../lib/cores";
import { colunaValida, ESTADOS, ordenar, type Coluna, type Direcao } from "./util";

const CAMPO =
  "h-9 rounded-lg border border-border bg-surface-1 px-3 text-sm text-texto placeholder:text-texto-fraco focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

function Participantes({ lista }: { lista: string[] }) {
  const max = 3;
  return (
    <span className="flex items-center" aria-label={`${lista.length} participantes`}>
      {lista.slice(0, max).map((p) => (
        <span key={p} title={p} className="-ml-2 rounded-xl ring-2 ring-surface-3 first:ml-0">
          <AgentAvatar nome={p} tamanho={26} />
        </span>
      ))}
      {lista.length > max && <span className="ml-1.5 text-xs text-texto-suave">+{lista.length - max}</span>}
    </span>
  );
}

function Cabecalho({ coluna, rotulo, ativa, dir, onOrdenar, className }: { coluna?: Coluna; rotulo: string; ativa?: boolean; dir?: Direcao; onOrdenar?: (c: Coluna) => void; className?: string }) {
  const Seta = dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={ativa ? (dir === "asc" ? "ascending" : "descending") : undefined} className={`px-2.5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-texto-fraco ${className ?? ""}`}>
      {coluna && onOrdenar ? (
        <button type="button" onClick={() => onOrdenar(coluna)} className="inline-flex items-center gap-1 rounded uppercase tracking-wider transition-colors hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          {rotulo}
          {ativa && <Seta className="h-3 w-3 text-accent-hover" aria-hidden="true" />}
        </button>
      ) : (
        rotulo
      )}
    </th>
  );
}

function Linha({ c }: { c: Conversa }) {
  return (
    <tr className="group border-t border-border transition-colors hover:bg-surface-4">
      <td className="max-w-[200px] px-2.5 py-3">
        <LinkPainel to={`/conversas/${encodeURIComponent(c.id)}`} className="block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <span className="block truncate text-sm font-medium text-texto group-hover:text-accent-hover">{c.assunto}</span>
          <span className="block font-mono text-xs text-texto-fraco">{c.id}</span>
        </LinkPainel>
      </td>
      <td className="px-2.5 py-3">{c.estado ? <StatusBadge status={c.estado} /> : <Badge>Sem estado</Badge>}</td>
      <td className="px-2.5 py-3">
        <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-texto-suave">
          {nomeCurto(c.de)} <ArrowRight className="h-3 w-3 text-texto-fraco" aria-hidden="true" /> {nomeCurto(c.para)}
        </span>
      </td>
      <td className="px-2.5 py-3"><Participantes lista={c.participantes} /></td>
      <td className="px-2.5 py-3">
        <span className="flex flex-wrap gap-1">
          {c.issues.length ? c.issues.map((i) => <span key={i} className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-texto-suave">#{i}</span>) : <span className="text-texto-fraco">—</span>}
        </span>
      </td>
      <td className="max-w-[110px] px-2.5 py-3">
        {c.branch ? (
          <span className="flex items-center gap-1 font-mono text-xs text-texto-suave" title={c.branch}>
            <GitBranch className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{c.branch}</span>
          </span>
        ) : <span className="text-texto-fraco">—</span>}
      </td>
      <td className="px-2.5 py-3 text-right font-mono text-sm tabular-nums text-texto">{c.n_mensagens}</td>
      <td className="whitespace-nowrap px-2.5 py-3 text-xs tabular-nums text-texto-suave">{formatarDuracaoMin(c.duracao_min)}</td>
      <td className="whitespace-nowrap px-2 py-3 text-xs text-texto-suave"><TempoRelativo iso={c.inicio} /></td>
      <td className="whitespace-nowrap px-2 py-3 text-xs text-texto-suave"><TempoRelativo iso={c.fim} /></td>
      <td className="py-3 pr-3"><ChevronRight className="h-4 w-4 text-texto-fraco transition-transform group-hover:translate-x-0.5 group-hover:text-texto" aria-hidden="true" /></td>
    </tr>
  );
}

export default function Conversas() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const estado = (ESTADOS as readonly string[]).includes(params.get("estado") ?? "") ? (params.get("estado") as EstadoTarefa) : undefined;
  const agente = params.get("agente") ?? undefined;
  const coluna = colunaValida(params.get("ord"));
  const dir: Direcao = params.get("dir") === "asc" ? "asc" : "desc";

  const [busca, setBusca] = useState(q);
  const mudar = (chave: string, valor: string | null) =>
    setParams((ant) => {
      const n = new URLSearchParams(ant);
      if (valor) n.set(chave, valor);
      else n.delete(chave);
      return n;
    }, { replace: true });

  // busca vai para a URL com debounce, para não refazer o REST a cada tecla
  useEffect(() => {
    if (busca === q) return;
    const t = setTimeout(() => mudar("q", busca.trim() || null), 300);
    return () => clearTimeout(t);
  }, [busca]);

  const { dados, carregando, erro, recarregar } = useApi((c, s) => cliente.conversas({ ...c, estado, agente, q: q || undefined }, s), [estado, agente, q]);
  const agentes = useApi((c, s) => cliente.agentes(c, s));

  // ao vivo: mensagem/tarefa nova refaz o REST (no máximo 1x por segundo)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agendar = () => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      recarregar();
    }, 1000);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEvento("mensagem", agendar);
  useEvento("tarefa", agendar);

  const linhas = useMemo(() => (dados ? ordenar(dados, coluna, dir) : []), [dados, coluna, dir]);
  const opcoesAgente = useMemo(() => {
    const s = new Set<string>(agentes.dados?.map((a) => a.agente) ?? []);
    dados?.forEach((c) => c.participantes.forEach((p) => s.add(p)));
    if (agente) s.add(agente);
    return [...s].sort();
  }, [agentes.dados, dados, agente]);

  const ordenarPor = (c: Coluna) => {
    setParams((ant) => {
      const n = new URLSearchParams(ant);
      n.set("ord", c);
      n.set("dir", c === coluna && dir === "desc" ? "asc" : "desc");
      return n;
    }, { replace: true });
  };

  const filtrado = Boolean(q || estado || agente);
  const subtitulo = dados ? `${dados.length} ${dados.length === 1 ? "conversa" : "conversas"} no período` : "Cada pedido com a sua thread";

  return (
    <>
      <PageHeader
        icone={MessagesSquare}
        titulo="Conversas"
        subtitulo={subtitulo}
        acoes={
          <button type="button" onClick={recarregar} className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-texto-suave transition-colors hover:bg-surface-4 hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Atualizar
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-fraco" aria-hidden="true" />
          <input
            type="search"
            aria-label="Buscar conversas"
            placeholder="Buscar por assunto, id ou issue..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className={`${CAMPO} w-full pl-9`}
          />
        </div>
        <select aria-label="Filtrar por estado" value={estado ?? ""} onChange={(e) => mudar("estado", e.target.value || null)} className={CAMPO}>
          <option value="">Todos os estados</option>
          {ESTADOS.map((e) => <option key={e} value={e}>{ESTILO_ESTADO_TAREFA[e].rotulo}</option>)}
        </select>
        <select aria-label="Filtrar por agente" value={agente ?? ""} onChange={(e) => mudar("agente", e.target.value || null)} className={CAMPO}>
          <option value="">Todos os agentes</option>
          {opcoesAgente.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {erro && !dados ? (
        <EmptyState icone={AlertTriangle} titulo="Não foi possível carregar" descricao={erro.message} />
      ) : !dados && carregando ? (
        <div className="space-y-2 rounded-xl border border-border bg-surface-3 p-4" aria-busy="true" aria-label="Carregando conversas">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : linhas.length === 0 ? (
        <EmptyState
          icone={MessagesSquare}
          titulo={filtrado ? "Nenhuma conversa com esses filtros" : "Nenhuma conversa no período"}
          descricao={filtrado ? "Ajuste a busca ou limpe os filtros para ver mais." : "Quando o master mandar um pedido, a thread aparece aqui ao vivo."}
          acao={filtrado ? (
            <button type="button" onClick={() => { setBusca(""); setParams((a) => { const n = new URLSearchParams(a); ["q", "estado", "agente"].forEach((k) => n.delete(k)); return n; }, { replace: true }); }} className="rounded-lg border border-border px-3 py-1.5 text-sm text-texto-suave hover:bg-surface-4 hover:text-texto">
              Limpar filtros
            </button>
          ) : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface-3 shadow-card animate-fade-in">
          <table className="w-full min-w-[900px] border-collapse">
            <thead className="bg-surface-2">
              <tr>
                <Cabecalho coluna="assunto" rotulo="Assunto" ativa={coluna === "assunto"} dir={dir} onOrdenar={ordenarPor} />
                <Cabecalho coluna="estado" rotulo="Estado" ativa={coluna === "estado"} dir={dir} onOrdenar={ordenarPor} />
                <Cabecalho rotulo="De → Para" />
                <Cabecalho rotulo="Participantes" />
                <Cabecalho rotulo="Issues" />
                <Cabecalho rotulo="Branch" />
                <Cabecalho coluna="mensagens" rotulo="Msgs" ativa={coluna === "mensagens"} dir={dir} onOrdenar={ordenarPor} className="text-right" />
                <Cabecalho coluna="duracao" rotulo="Duração" ativa={coluna === "duracao"} dir={dir} onOrdenar={ordenarPor} />
                <Cabecalho coluna="inicio" rotulo="Início" ativa={coluna === "inicio"} dir={dir} onOrdenar={ordenarPor} />
                <Cabecalho coluna="fim" rotulo="Fim" ativa={coluna === "fim"} dir={dir} onOrdenar={ordenarPor} />
                <th className="w-8" aria-hidden="true" />
              </tr>
            </thead>
            <tbody>{linhas.map((c) => <Linha key={c.id} c={c} />)}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
