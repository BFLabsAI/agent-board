import { AlertTriangle, BarChart3 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cliente } from "../../api/cliente";
import type { Analytics as DadosAnalytics } from "../../api/tipos";
import { useApi } from "../../api/useApi";
import { useEvento } from "../../api/useStream";
import { useContextoPainel } from "../../context/ContextoPainel";
import { EmptyState, Segmented, Skeleton } from "../../components/ui";
import { AbaAgentes } from "./AbaAgentes";
import { AbaAtividade } from "./AbaAtividade";
import { AbaQualidade } from "./AbaQualidade";
import { Cabecalho } from "./Cabecalho";
import { aplicarMensagem, calcularKpis, temposDosAgentes } from "./calculos";
import { Heatmap } from "./Heatmap";
import { GradeKpis } from "./Kpis";
import { Ultimos30 } from "./Ultimos30";

type Aba = "atividade" | "agentes" | "qualidade";
const ABAS = [
  { valor: "atividade", rotulo: "Atividade" },
  { valor: "agentes", rotulo: "Agentes" },
  { valor: "qualidade", rotulo: "Qualidade" },
] as const;

/** Depois de uma mensagem, o REST é refeito uma vez, 5 s após a última. */
export const DEBOUNCE_MS = 5000;

export default function Analytics() {
  const { projetoExibido } = useContextoPainel();
  const api = useApi((c, s) => cliente.analytics(c, s));
  const resumo = useApi((c, s) => cliente.resumo(c, s));
  const cadastro = useApi((c, s) => cliente.agentes(c, s));
  const [aba, setAba] = useState<Aba>("atividade");
  const [local, setLocal] = useState<DadosAnalytics | null>(null);

  useEffect(() => setLocal(api.dados), [api.dados]);

  const recarregarTudo = useCallback(() => {
    api.recarregar();
    resumo.recarregar();
    cadastro.recarregar();
  }, [api.recarregar, resumo.recarregar, cadastro.recarregar]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recarregarRef = useRef(recarregarTudo);
  recarregarRef.current = recarregarTudo;
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  useEvento("mensagem", (m) => {
    setLocal((a) => (a ? aplicarMensagem(a, m) : a));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => recarregarRef.current(), DEBOUNCE_MS);
  });

  const dados = local;
  const nomesCadastrados = useMemo(() => (cadastro.dados ? cadastro.dados.map((a) => a.agente) : undefined), [cadastro.dados]);
  const kpis = useMemo(() => (dados ? calcularKpis(dados, nomesCadastrados) : null), [dados, nomesCadastrados]);
  const fallback = useMemo(() => (dados ? temposDosAgentes(dados) : { p50: null, p90: null }), [dados]);
  const tr = resumo.dados?.indicadores.tempo_resposta;
  const p50 = tr ? (tr.p50 ?? tr.media) : fallback.p50;
  const p90 = tr ? tr.p90 : fallback.p90;

  const exportar = () => {
    if (!dados) return;
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${projetoExibido ?? "projeto"}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const carregando = api.carregando && !dados;
  const vazio = dados && dados.heatmap.every((h) => h.n === 0) && dados.ultimos_30d.every((d) => d.mensagens === 0);

  return (
    <>
      <Cabecalho onRecarregar={recarregarTudo} onExportar={exportar} recarregando={api.carregando && !!dados} semDados={!dados} />
      {api.erro && !dados ? (
        <EmptyState icone={AlertTriangle} titulo="Não foi possível carregar o analytics" descricao={api.erro.message} />
      ) : (
        <>
          <GradeKpis kpis={kpis} p50={p50} p90={p90} trabalhando={resumo.dados?.indicadores.trabalhando ?? null} carregando={carregando} />
          {carregando ? (
            <Skeleton className="mb-6 h-64 w-full" />
          ) : vazio ? (
            <EmptyState icone={BarChart3} titulo="Ainda sem atividade" descricao="Quando o time trocar mensagens neste projeto, o histórico aparece aqui." />
          ) : (
            dados && (
              <>
                <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                  <Heatmap dados={dados.heatmap} />
                  <Ultimos30 dias={dados.ultimos_30d} />
                </div>
                <Segmented opcoes={ABAS} valor={aba} onChange={setAba} ariaLabel="Seção do analytics" className="mb-4" />
                <div key={aba} className="animate-fade-in">
                  {aba === "atividade" && <AbaAtividade dados={dados} />}
                  {aba === "agentes" && <AbaAgentes dados={dados} />}
                  {aba === "qualidade" && <AbaQualidade dados={dados} />}
                </div>
              </>
            )
          )}
        </>
      )}
    </>
  );
}
