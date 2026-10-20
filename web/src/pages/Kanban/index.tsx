import { LayoutGroup } from "framer-motion";
import { AlertTriangle, Bot, Columns3, ListChecks, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { cliente } from "../../api/cliente";
import type { Agente, Tarefa } from "../../api/tipos";
import { useApi } from "../../api/useApi";
import { useEvento } from "../../api/useStream";
import { EmptyState, PageHeader, Segmented, Skeleton } from "../../components/ui";
import { ESTILO_ESTADO_TAREFA, ESTILO_STATUS_AGENTE } from "../../lib/cores";
import { nomeCurto } from "../../lib/formato";
import { CartaoAgente } from "./CartaoAgente";
import { CartaoTarefa } from "./CartaoTarefa";
import { Coluna } from "./Coluna";
import { COLUNAS_AGENTE, COLUNAS_TAREFA } from "./colunas";

type Modo = "tarefas" | "agentes";
const OPCOES = [
  { valor: "tarefas" as const, rotulo: "Tarefas", icone: ListChecks },
  { valor: "agentes" as const, rotulo: "Agentes", icone: Bot },
];

function upsert<T>(lista: T[], item: T, chave: (x: T) => string): T[] {
  const k = chave(item);
  const i = lista.findIndex((x) => chave(x) === k);
  if (i < 0) return [item, ...lista];
  const n = lista.slice();
  n[i] = item;
  return n;
}

function SkeletonColunas({ n }: { n: number }) {
  return (
    <div className="flex h-full gap-4" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="w-[19rem] shrink-0 space-y-3 rounded-xl border border-border bg-surface-1/60 p-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ))}
    </div>
  );
}

export default function Kanban() {
  const [params, setParams] = useSearchParams();
  const modo: Modo = params.get("modo") === "agentes" ? "agentes" : "tarefas";
  const setModo = (m: Modo) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set("modo", m);
      return n;
    }, { replace: true });

  const [agenteFiltro, setAgenteFiltro] = useState("");
  const [busca, setBusca] = useState("");

  const apiT = useApi((c, s) => cliente.tarefas(c, s));
  const apiA = useApi((c, s) => cliente.agentes(c, s));
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [agentes, setAgentes] = useState<Agente[]>([]);
  useEffect(() => { if (apiT.dados) setTarefas(apiT.dados); }, [apiT.dados]);
  useEffect(() => { if (apiA.dados) setAgentes(apiA.dados); }, [apiA.dados]);
  useEvento("tarefa", (t) => setTarefas((l) => upsert(l, t, (x) => x.id)));
  useEvento("agente", (a) => setAgentes((l) => upsert(l, a, (x) => x.agente)));

  const nomes = useMemo(() => {
    const s = new Set<string>(agentes.map((a) => a.agente));
    tarefas.forEach((t) => { s.add(t.de); s.add(t.para); });
    return Array.from(s).sort();
  }, [agentes, tarefas]);

  const q = busca.trim().toLowerCase();
  const tarefasFiltradas = useMemo(
    () => tarefas.filter((t) => {
      if (agenteFiltro && t.de !== agenteFiltro && t.para !== agenteFiltro) return false;
      if (!q) return true;
      return [t.assunto, t.id, t.de, t.para, t.branch ?? "", t.andamento ?? "", ...t.issues.map((n) => `#${n}`)]
        .some((c) => c.toLowerCase().includes(q));
    }),
    [tarefas, agenteFiltro, q],
  );
  const agentesFiltrados = useMemo(
    () => agentes.filter((a) => {
      if (agenteFiltro && a.agente !== agenteFiltro) return false;
      if (!q) return true;
      return [a.agente, a.papel, a.tarefa_atual?.assunto ?? "", a.branch ?? ""].some((c) => c.toLowerCase().includes(q));
    }),
    [agentes, agenteFiltro, q],
  );

  const api = modo === "tarefas" ? apiT : apiA;
  const total = modo === "tarefas" ? tarefas.length : agentes.length;
  const semDados = modo === "tarefas" ? !apiT.dados && tarefas.length === 0 : !apiA.dados && agentes.length === 0;

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[28rem] flex-col">
      <PageHeader
        icone={Columns3}
        titulo="Kanban"
        subtitulo={`${total} ${modo === "tarefas" ? (total === 1 ? "tarefa" : "tarefas") : (total === 1 ? "agente" : "agentes")} no projeto`}
        acoes={
          <>
            <Segmented opcoes={OPCOES} valor={modo} onChange={setModo} ariaLabel="Modo do Kanban" />
            <button
              type="button"
              onClick={api.recarregar}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-texto-suave transition-colors hover:bg-surface-4 hover:text-texto focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <RefreshCw className={`h-4 w-4 ${api.carregando ? "animate-spin" : ""}`} aria-hidden="true" /> Atualizar
            </button>
          </>
        }
      />

      <div className="-mt-2 mb-4 flex flex-wrap items-center gap-3">
        <label className="relative">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-fraco" aria-hidden="true" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={modo === "tarefas" ? "Buscar assunto, id, issue, branch…" : "Buscar agente ou tarefa…"}
            className="w-72 rounded-lg border border-border bg-surface-1 py-1.5 pl-9 pr-3 text-sm text-texto placeholder:text-texto-fraco focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-texto-suave">
          <span>Agente</span>
          <select
            value={agenteFiltro}
            onChange={(e) => setAgenteFiltro(e.target.value)}
            className="rounded-lg border border-border bg-surface-1 px-3 py-1.5 text-sm text-texto focus:border-accent focus:outline-none"
          >
            <option value="">Todos</option>
            {nomes.map((n) => <option key={n} value={n}>{nomeCurto(n)}</option>)}
          </select>
        </label>
      </div>

      <div className="min-h-0 flex-1">
        {api.erro && semDados ? (
          <EmptyState icone={AlertTriangle} titulo="Não foi possível carregar" descricao={api.erro.message} />
        ) : api.carregando && semDados ? (
          <SkeletonColunas n={modo === "tarefas" ? 4 : 5} />
        ) : total === 0 ? (
          <EmptyState
            icone={modo === "tarefas" ? ListChecks : Bot}
            titulo={modo === "tarefas" ? "Nenhuma tarefa ainda" : "Nenhum agente cadastrado"}
            descricao={modo === "tarefas" ? "Os pedidos e entregas do time aparecem aqui assim que forem enviados." : "Cadastre os painéis do time para vê-los aqui."}
          />
        ) : (
          <LayoutGroup>
            <div className="flex h-full gap-4 overflow-x-auto pb-2" data-modo={modo}>
              {modo === "tarefas"
                ? COLUNAS_TAREFA.map((c, i) => {
                    const e = ESTILO_ESTADO_TAREFA[c.estado];
                    const itens = tarefasFiltradas
                      .filter((t) => t.estado === c.estado)
                      .sort((a, b) =>
                        c.estado === "atrasado"
                          ? (a.prazo ?? "").localeCompare(b.prazo ?? "")
                          : (b.fechada_em ?? b.andamento_ts ?? b.ts).localeCompare(a.fechada_em ?? a.andamento_ts ?? a.ts),
                      );
                    return (
                      <Coluna key={c.estado} titulo={c.titulo} entra={c.entra} sai={c.sai} total={itens.length}
                        texto={c.destaque ? "text-red-400" : e.texto} ponto={e.ponto} destaque={c.destaque}
                        alinhar={i >= 4 ? "dir" : "esq"}>
                          {itens.map((t) => <CartaoTarefa key={t.id} t={t} />)}
                        {itens.length === 0 && <li className="py-8 text-center text-sm text-texto-fraco">Nenhuma tarefa</li>}
                      </Coluna>
                    );
                  })
                : COLUNAS_AGENTE.map((c, i) => {
                    const e = ESTILO_STATUS_AGENTE[c.status];
                    const itens = agentesFiltrados.filter((a) =>
                      c.status === "offline" ? a.status === "offline" || a.status === "desconhecido" : a.status === c.status,
                    );
                    return (
                      <Coluna key={c.status} titulo={c.titulo} entra={c.entra} sai={c.sai} total={itens.length}
                        texto={e.texto} ponto={e.ponto} alinhar={i >= 3 ? "dir" : "esq"}>
                          {itens.map((a) => <CartaoAgente key={a.agente} a={a} />)}
                        {itens.length === 0 && <li className="py-8 text-center text-sm text-texto-fraco">Nenhum agente</li>}
                      </Coluna>
                    );
                  })}
            </div>
          </LayoutGroup>
        )}
      </div>
    </div>
  );
}
