import { Activity, AlertTriangle, Bot, ClipboardCheck, Inbox, LayoutDashboard, RefreshCw, Timer } from "lucide-react";
import { cliente } from "../../api/cliente";
import { useApi } from "../../api/useApi";
import { EmptyState, PageHeader, StatCard } from "../../components/ui";
import { formatarDuracaoMin } from "../../lib/formato";

/** Placeholder: mostra os KPIs para exercitar o contrato; a trilha do Dashboard substitui o resto. */
export default function Dashboard() {
  const { dados, carregando, erro, recarregar } = useApi((c, s) => cliente.resumo(c, s));
  const i = dados?.indicadores;
  return (
    <>
      <PageHeader
        icone={LayoutDashboard}
        titulo="Dashboard"
        subtitulo="Visão em tempo real do time de agentes"
        acoes={
          <button type="button" onClick={recarregar} className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-texto-suave transition-colors hover:bg-surface-4 hover:text-texto">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Atualizar
          </button>
        }
      />
      {erro ? (
        <EmptyState icone={AlertTriangle} titulo="Não foi possível carregar" descricao={erro.message} />
      ) : (
        <>
          <div className="mb-8 grid grid-cols-3 gap-4">
            <StatCard rotulo="Agentes trabalhando" valor={i?.trabalhando ?? 0} icone={Bot} tom="verde" subtexto={i ? `${i.esperando} esperando` : undefined} carregando={carregando} />
            <StatCard rotulo="Pedidos abertos" valor={i?.abertos ?? 0} icone={Inbox} tom="azul" subtexto={i ? `${i.atrasados} atrasados` : undefined} carregando={carregando} />
            <StatCard rotulo="Aguardando revisão" valor={i?.revisao ?? 0} icone={ClipboardCheck} tom="amarelo" carregando={carregando} />
            <StatCard rotulo="Pendentes" valor={i?.pendentes ?? 0} icone={AlertTriangle} tom="laranja" subtexto={i ? `${i.agentes_com_pendente} agentes` : undefined} carregando={carregando} />
            <StatCard rotulo="Tempo de resposta" valor={formatarDuracaoMin(i?.tempo_resposta?.p50 ?? i?.tempo_resposta?.media)} icone={Timer} tom="roxo" subtexto={i?.tempo_resposta ? `p90 ${formatarDuracaoMin(i.tempo_resposta.p90)}` : undefined} carregando={carregando} />
            <StatCard rotulo="Mensagens" valor={i?.mensagens ?? 0} icone={Activity} tom="accent" subtexto={i ? `${i.entregas_periodo} entregas` : undefined} carregando={carregando} />
          </div>
          <EmptyState icone={LayoutDashboard} titulo="Em construção" descricao="Cards dos agentes e atividade recente chegam pela trilha do Dashboard, em pages/Dashboard." />
        </>
      )}
    </>
  );
}
