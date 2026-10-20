import { Activity, AlertTriangle, ArrowRight, Bot, CheckCheck, ClipboardCheck, Inbox, LayoutDashboard, RefreshCw, Send, Timer, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cliente } from "../../api/cliente";
import type { Agente, Mensagem, Resumo } from "../../api/tipos";
import { useApi } from "../../api/useApi";
import { useEvento } from "../../api/useStream";
import { LinkPainel } from "../../components/LinkPainel";
import { EmptyState, PageHeader, Skeleton, StatCard } from "../../components/ui";
import { formatarDuracaoMin, formatarNumero } from "../../lib/formato";
import { AtividadeRecente } from "./AtividadeRecente";
import { CartaoAgente } from "./CartaoAgente";
import { buscarAlertas, mesclarMensagens } from "./dados";
import { FaixaAlertas } from "./FaixaAlertas";

const LIMITE_MENSAGENS = 12;

function Secao({ titulo, link, rotuloLink, children }: { titulo: string; link: string; rotuloLink: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-texto">{titulo}</h2>
        <LinkPainel to={link} className="inline-flex items-center gap-1 rounded-md px-1 text-sm text-texto-suave transition-colors hover:text-accent-hover">
          {rotuloLink} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </LinkPainel>
      </div>
      {children}
    </section>
  );
}

export default function Dashboard() {
  const resumoApi = useApi<Resumo>((c, s) => cliente.resumo(c, s));
  const agentesApi = useApi<Agente[]>((c, s) => cliente.agentes(c, s));
  const msgsApi = useApi((c, s) => cliente.mensagens({ projeto: c.projeto, limite: LIMITE_MENSAGENS }, s));
  const alertasApi = useApi((c, s) => buscarAlertas(c, s));

  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [novos, setNovos] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => { if (resumoApi.dados) setResumo(resumoApi.dados); }, [resumoApi.dados]);
  useEffect(() => { if (agentesApi.dados) setAgentes(agentesApi.dados); }, [agentesApi.dados]);
  useEffect(() => {
    if (msgsApi.dados) {
      setMensagens(mesclarMensagens([], msgsApi.dados.mensagens, LIMITE_MENSAGENS));
      setNovos(new Set());
    }
  }, [msgsApi.dados]);

  // push: mensagem entra no topo com animação e ajusta os contadores
  useEvento("mensagem", (m) => {
    setMensagens((atual) => (atual.some((x) => x.id === m.id) ? atual : mesclarMensagens(atual, [m], LIMITE_MENSAGENS)));
    setNovos((s) => new Set(s).add(m.id));
    setResumo((r) =>
      r
        ? { ...r, indicadores: { ...r.indicadores, mensagens: r.indicadores.mensagens + 1, entregas_periodo: r.indicadores.entregas_periodo + (m.tipo === "entrega" ? 1 : 0) } }
        : r,
    );
  });

  // push: o card do agente é trocado
  useEvento("agente", (a) => {
    setAgentes((atual) => (atual.some((x) => x.agente === a.agente) ? atual.map((x) => (x.agente === a.agente ? a : x)) : [...atual, a]));
  });

  // push: tarefa nova ou mudou de estado: refaz o resumo (e os alertas), agrupando rajadas
  const { recarregar: recarregarResumo } = resumoApi;
  const { recarregar: recarregarAlertas } = alertasApi;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEvento("tarefa", () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      recarregarResumo();
      recarregarAlertas();
    }, 400);
  });
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const recarregarTudo = useCallback(() => {
    resumoApi.recarregar();
    agentesApi.recarregar();
    msgsApi.recarregar();
    alertasApi.recarregar();
  }, [resumoApi, agentesApi, msgsApi, alertasApi]);

  // trabalhando/esperando saem dos cards, que o SSE mantém atualizados
  const vivos = useMemo(
    () => ({
      trabalhando: agentes.filter((a) => a.status === "trabalhando").length,
      esperando: agentes.filter((a) => a.status === "esperando").length,
      pendentes: agentes.reduce((s, a) => s + a.pendentes, 0),
      comPendente: agentes.filter((a) => a.pendentes > 0).length,
    }),
    [agentes],
  );

  const i = resumo?.indicadores;
  const carregandoKpi = !resumo && resumoApi.carregando;
  const temAgentes = agentes.length > 0;
  const trabalhando = temAgentes ? vivos.trabalhando : (i?.trabalhando ?? 0);
  const esperando = temAgentes ? vivos.esperando : (i?.esperando ?? 0);
  const pendentes = temAgentes ? vivos.pendentes : (i?.pendentes ?? 0);
  const comPendente = temAgentes ? vivos.comPendente : (i?.agentes_com_pendente ?? 0);
  const p50 = i?.tempo_resposta?.p50 ?? i?.tempo_resposta?.media;

  return (
    <>
      <PageHeader
        icone={LayoutDashboard}
        titulo="Dashboard"
        subtitulo="Visão em tempo real do time de agentes"
        acoes={
          <button type="button" onClick={recarregarTudo} className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-texto-suave transition-colors hover:bg-surface-4 hover:text-texto">
            <RefreshCw className={`h-4 w-4 ${resumoApi.carregando ? "animate-spin" : ""}`} aria-hidden="true" /> Atualizar
          </button>
        }
      />

      <FaixaAlertas cadeia={resumo?.cadeia} atrasados={i?.atrasados ?? 0} pingPong={alertasApi.dados ?? []} />

      {resumoApi.erro && !resumo ? (
        <div className="mb-8">
          <EmptyState icone={AlertTriangle} titulo="Não foi possível carregar o resumo" descricao={resumoApi.erro.message} />
        </div>
      ) : (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard rotulo="Agentes trabalhando" valor={trabalhando} icone={Bot} tom="verde" subtexto={`${esperando} esperando`} carregando={carregandoKpi && !temAgentes} />
          <StatCard rotulo="Pedidos abertos" valor={formatarNumero(i?.abertos ?? 0)} icone={Inbox} tom="azul" subtexto={i ? `${i.atrasados} atrasados` : undefined} carregando={carregandoKpi} />
          <StatCard rotulo="Pendentes" valor={pendentes} icone={AlertTriangle} tom="laranja" subtexto={`${comPendente} ${comPendente === 1 ? "agente" : "agentes"}`} carregando={carregandoKpi && !temAgentes} />
          <StatCard rotulo="Atrasados" valor={i?.atrasados ?? 0} icone={Timer} tom={(i?.atrasados ?? 0) > 0 ? "vermelho" : "cinza"} subtexto={(i?.atrasados ?? 0) > 0 ? "passaram do prazo" : "em dia"} carregando={carregandoKpi} />
          <StatCard rotulo="Aguardando revisão" valor={i?.revisao ?? 0} icone={ClipboardCheck} tom="amarelo" carregando={carregandoKpi} />
          <StatCard rotulo="Tempo de resposta" valor={formatarDuracaoMin(p50)} icone={Timer} tom="roxo" subtexto={i?.tempo_resposta ? `p90 ${formatarDuracaoMin(i.tempo_resposta.p90)}` : undefined} carregando={carregandoKpi} />
          <StatCard rotulo="Mensagens" valor={formatarNumero(i?.mensagens ?? 0)} icone={Activity} tom="accent" subtexto={i ? `antes: ${formatarNumero(i.mensagens_antes)}` : undefined} carregando={carregandoKpi} />
          <StatCard rotulo="Entregas" valor={formatarNumero(i?.entregas_periodo ?? 0)} icone={CheckCheck} tom="verde" subtexto={resumo ? "no período" : undefined} carregando={carregandoKpi} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Secao titulo="Agentes" link="/kanban" rotuloLink="Ver Kanban">
          {agentesApi.erro && !temAgentes ? (
            <EmptyState icone={AlertTriangle} titulo="Não foi possível carregar os agentes" descricao={agentesApi.erro.message} />
          ) : agentesApi.carregando && !temAgentes ? (
            <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
              {Array.from({ length: 4 }, (_, k) => <Skeleton key={k} className="h-56 rounded-xl" />)}
            </div>
          ) : !temAgentes ? (
            <EmptyState icone={Users} titulo="Nenhum agente cadastrado" descricao="Cadastre os painéis do time para vê-los aqui." />
          ) : (
            <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
              {agentes.map((a) => <CartaoAgente key={a.agente} agente={a} />)}
            </div>
          )}
        </Secao>

        <Secao titulo="Atividade recente" link="/feed" rotuloLink="Ver tudo">
          {msgsApi.erro && mensagens.length === 0 ? (
            <EmptyState icone={Send} titulo="Não foi possível carregar a atividade" descricao={msgsApi.erro.message} />
          ) : (
            <AtividadeRecente mensagens={mensagens} novos={novos} carregando={msgsApi.carregando} />
          )}
        </Secao>
      </div>
    </>
  );
}
