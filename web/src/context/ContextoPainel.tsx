import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { cliente } from "../api/cliente";
import { StreamProvider } from "../api/useStream";
import type { FabricaFonte } from "../api/stream";
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
}

const Ctx = createContext<Valor | null>(null);

function periodoValido(v: string | null): Periodo | null {
  return v === "hoje" || v === "24h" || v === "7d" ? v : null;
}

export function ProvedorPainel({ children, fabricaStream }: { children: ReactNode; fabricaStream?: FabricaFonte }) {
  const [params, setParams] = useSearchParams();
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
      gravarLocal(CHAVE_PROJETO, nome);
      atualizar("projeto", nome);
    },
    [atualizar],
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
    if (projeto && params.get("projeto") !== projeto) atualizar("projeto", projeto);
  }, [projeto, params, atualizar]);

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
    }),
    [projeto, projetos, projetosCarregando, setProjeto, periodo, setPeriodo, tv],
  );

  return (
    <Ctx.Provider value={valor}>
      <StreamProvider projeto={projeto} fabrica={fabricaStream}>
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
