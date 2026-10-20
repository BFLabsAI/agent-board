import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { cliente } from "../api/cliente";
import { StreamProvider } from "../api/useStream";
import { PROJETO_TODOS, type FabricaFonte } from "../api/stream";
import type { Periodo, Projeto } from "../api/tipos";
import { gravarLocal, lerLocal } from "../lib/armazenamento";

export const CHAVE_PROJETO = "agent-board:projeto";
export const CHAVE_PERIODO = "agent-board:periodo";
export const PERIODOS: ReadonlyArray<{ valor: Periodo; rotulo: string }> = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "24h", rotulo: "24 h" },
  { valor: "7d", rotulo: "7 dias" },
];

interface Valor {
  /** projeto efetivo; null = deixa o servidor escolher o padrão */
  projeto: string | null;
  /** nome a exibir: o escolhido ou o marcado como "atual" pelo servidor */
  projetoExibido: string | null;
  projetos: Projeto[];
  projetosCarregando: boolean;
  setProjeto: (nome: string) => void;
  periodo: Periodo;
  setPeriodo: (p: Periodo) => void;
  /** modo TV (?tv=1): sem sidebar */
  tv: boolean;
  /** true na tela Visão geral (/geral): todos os squads, sem projeto único */
  geral: boolean;
  /** true enquanto se decide se a abertura em "/" vai para /geral (esperando o cadastro) */
  inicioPendente: boolean;
}

export const CAMINHO_GERAL = "/geral";

const Ctx = createContext<Valor | null>(null);

function periodoValido(v: string | null): Periodo | null {
  return v === "hoje" || v === "24h" || v === "7d" ? v : null;
}

export function ProvedorPainel({ children, fabricaStream }: { children: ReactNode; fabricaStream?: FabricaFonte }) {
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const geral = pathname === CAMINHO_GERAL;
  // abriu em "/" sem ?projeto=: com mais de 1 projeto no cadastro, cai na Visão geral (uma vez só)
  const [inicioPendente, setInicioPendente] = useState(() => pathname === "/" && !params.get("projeto"));
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [projetosCarregando, setCarregando] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    cliente
      .projetos(ac.signal)
      .then((p) => setProjetos(p))
      .catch(() => setProjetos([]))
      .finally(() => {
        if (!ac.signal.aborted) setCarregando(false);
      });
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (!inicioPendente || projetosCarregando) return;
    setInicioPendente(false);
    if (projetos.length > 1) {
      const n = new URLSearchParams();
      for (const k of ["periodo", "tv"]) {
        const v = params.get(k);
        if (v) n.set(k, v);
      }
      const qs = n.toString();
      navigate({ pathname: CAMINHO_GERAL, search: qs ? `?${qs}` : "" }, { replace: true });
    }
  }, [inicioPendente, projetosCarregando, projetos, params, navigate]);

  const escolhido = params.get("projeto") || lerLocal(CHAVE_PROJETO) || null;
  // se a lista já chegou e o projeto escolhido não existe mais, volta ao padrão do servidor
  const projeto = escolhido && (projetosCarregando || projetos.length === 0 || projetos.some((p) => p.projeto === escolhido)) ? escolhido : null;
  const periodo = periodoValido(params.get("periodo")) ?? periodoValido(lerLocal(CHAVE_PERIODO)) ?? "hoje";
  const tv = params.get("tv") === "1";

  const atualizar = useCallback(
    (chave: string, valor: string | null) => {
      setParams(
        (ant) => {
          const n = new URLSearchParams(ant);
          if (valor) n.set(chave, valor);
          else n.delete(chave);
          return n;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setProjeto = useCallback(
    (nome: string) => {
      if (geral) {
        // da Visão geral para um squad: vai ao Dashboard dele
        if (nome === PROJETO_TODOS) return;
        gravarLocal(CHAVE_PROJETO, nome);
        const n = new URLSearchParams({ projeto: nome });
        for (const k of ["periodo", "tv"]) {
          const v = params.get(k);
          if (v) n.set(k, v);
        }
        navigate({ pathname: "/", search: `?${n.toString()}` });
        return;
      }
      if (nome === PROJETO_TODOS) {
        const n = new URLSearchParams();
        for (const k of ["periodo", "tv"]) {
          const v = params.get(k);
          if (v) n.set(k, v);
        }
        navigate({ pathname: CAMINHO_GERAL, search: n.toString() ? `?${n.toString()}` : "" });
        return;
      }
      gravarLocal(CHAVE_PROJETO, nome);
      atualizar("projeto", nome);
    },
    [atualizar, geral, navigate, params],
  );
  const setPeriodo = useCallback(
    (p: Periodo) => {
      gravarLocal(CHAVE_PERIODO, p);
      atualizar("periodo", p);
    },
    [atualizar],
  );

  // deixa o projeto escolhido visível na URL (link compartilhável)
  useEffect(() => {
    if (!geral && !inicioPendente && projeto && params.get("projeto") !== projeto) atualizar("projeto", projeto);
  }, [geral, inicioPendente, projeto, params, atualizar]);

  const valor = useMemo<Valor>(
    () => ({
      projeto,
      projetoExibido: projeto ?? projetos.find((p) => p.atual)?.projeto ?? projetos[0]?.projeto ?? null,
      projetos,
      projetosCarregando,
      setProjeto,
      periodo,
      setPeriodo,
      tv,
      geral,
      inicioPendente,
    }),
    [projeto, projetos, projetosCarregando, setProjeto, periodo, setPeriodo, tv, geral, inicioPendente],
  );

  return (
    <Ctx.Provider value={valor}>
      <StreamProvider projeto={geral ? PROJETO_TODOS : projeto} fabrica={fabricaStream}>
        {children}
      </StreamProvider>
    </Ctx.Provider>
  );
}

export function useContextoPainel(): Valor {
  const v = useContext(Ctx);
  if (!v) throw new Error("useContextoPainel fora do ProvedorPainel");
  return v;
}
