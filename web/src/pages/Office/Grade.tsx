import { Activity, ArrowUpDown, LayoutGrid, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState, StatusDot } from "../../components/ui";
import { estiloStatus } from "../../lib/cores";
import { CardGrade } from "./Grade/CardGrade";
import { type FiltroStatus, type Ordem, ordenar, resumir } from "./Grade/dados";
import type { PropsModoOffice } from "./tipos";

const FILTROS: { valor: FiltroStatus; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "trabalhando", rotulo: "Trabalhando" },
  { valor: "esperando", rotulo: "Esperando" },
  { valor: "pendente", rotulo: "Pendente" },
  { valor: "parado", rotulo: "Parado" },
  { valor: "offline", rotulo: "Offline" },
];
const ORDENS: { valor: Ordem; rotulo: string }[] = [
  { valor: "status", rotulo: "Status" },
  { valor: "nome", rotulo: "Nome" },
  { valor: "atividade", rotulo: "Atividade" },
];

function Chip({ n, rotulo, cor }: { n: number; rotulo: string; cor: "verde" | "amarelo" | "vermelho" }) {
  const tom = {
    verde: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    amarelo: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    vermelho: "border-red-500/30 bg-red-500/10 text-red-300",
  }[cor];
  return (
    <span data-chip={cor} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tom}`}>
      <b className="tabular-nums">{n}</b> {rotulo}
    </span>
  );
}

export default function Grade({ agentes, selecionado, aoSelecionar }: PropsModoOffice) {
  const [filtro, setFiltro] = useState<FiltroStatus>("todos");
  const [ordem, setOrdem] = useState<Ordem>("status");
  const resumo = useMemo(() => resumir(agentes), [agentes]);
  const lista = useMemo(
    () => ordenar(filtro === "todos" ? agentes : agentes.filter((a) => a.status === filtro), ordem),
    [agentes, filtro, ordem],
  );

  if (agentes.length === 0) {
    return <EmptyState icone={LayoutGrid} titulo="Nenhum agente neste projeto" descricao="Cadastre os painéis do time para ver os cards." />;
  }

  return (
    <div className="flex flex-col gap-5">
      <div data-testid="resumo-grade" className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border bg-surface-3 px-5 py-3.5 shadow-card">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-texto-suave">
          <span className="inline-flex items-center gap-2">
            <Users className="h-4 w-4 text-texto-fraco" aria-hidden="true" />
            <b className="text-texto">{resumo.online}/{resumo.total}</b> agentes
          </span>
          <span className="inline-flex items-center gap-2">
            <StatusDot status="trabalhando" pulsar={resumo.trabalhando > 0} />
            <b className="text-texto">{resumo.trabalhando}</b> trabalhando agora
          </span>
          <span className="inline-flex items-center gap-2">
            <Activity className="h-4 w-4 text-texto-fraco" aria-hidden="true" />
            <b className="text-texto">{resumo.mensagensHoje}</b> mensagens hoje
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Chip n={resumo.trabalhando} rotulo="ativos" cor="verde" />
          <Chip n={resumo.atencao} rotulo="precisam de você" cor="amarelo" />
          <Chip n={resumo.inativos} rotulo="offline" cor="vermelho" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Filtrar por status" className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => {
            const n = f.valor === "todos" ? resumo.total : resumo.porStatus[f.valor];
            const ativo = filtro === f.valor;
            return (
              <button
                key={f.valor}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => setFiltro(f.valor)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                  ativo ? "border-accent/40 bg-accent-muted text-accent-hover" : "border-border bg-surface-1 text-texto-suave hover:bg-surface-4 hover:text-texto"
                }`}
              >
                {f.valor !== "todos" && <StatusDot status={f.valor} />}
                {f.rotulo}
                <span className="tabular-nums text-texto-fraco">{n}</span>
              </button>
            );
          })}
        </div>
        <label className="ml-auto inline-flex items-center gap-2 text-xs text-texto-suave">
          <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
          Ordenar por
          <select
            value={ordem}
            onChange={(e) => setOrdem(e.target.value as Ordem)}
            className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-texto focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {ORDENS.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>

      {lista.length === 0 ? (
        <EmptyState icone={LayoutGrid} titulo={`Nenhum agente ${estiloStatus(filtro).rotulo.toLowerCase()}`} descricao="Troque o filtro para ver o resto do time." />
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {lista.map((a) => (
            <CardGrade key={a.agente} agente={a} selecionado={selecionado === a.agente} aoSelecionar={aoSelecionar} />
          ))}
        </div>
      )}
    </div>
  );
}
