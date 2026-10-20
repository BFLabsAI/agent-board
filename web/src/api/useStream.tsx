import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ConexaoStream, type FabricaFonte, type StatusStream } from "./stream";
import type { EventosStream, NomeEvento } from "./tipos";

interface ValorStream {
  status: StatusStream;
  assinar: <K extends NomeEvento>(nome: K, fn: (d: EventosStream[K]) => void) => () => void;
  aoRecarregar: (fn: () => void) => () => void;
}

const semStream: ValorStream = {
  status: "offline",
  assinar: () => () => undefined,
  aoRecarregar: () => () => undefined,
};

const Ctx = createContext<ValorStream>(semStream);

export function StreamProvider({
  projeto,
  fabrica,
  children,
}: {
  projeto: string | null;
  fabrica?: FabricaFonte;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<StatusStream>("conectando");
  const conexao = useRef<ConexaoStream | null>(null);
  // ouvintes ficam num barramento estável, para não se perderem na troca de projeto
  const barramento = useRef({
    ouvintes: new Map<NomeEvento, Set<(d: never) => void>>(),
    recarregar: new Set<() => void>(),
  });

  useEffect(() => {
    const c = new ConexaoStream({ projeto, fabrica });
    conexao.current = c;
    setStatus("conectando");
    const offs = [
      c.aoMudar(setStatus),
      c.aoVoltar(() => barramento.current.recarregar.forEach((f) => f())),
      ...(["ola", "mensagem", "agente", "tarefa", "subagente", "ping"] as NomeEvento[]).map((n) =>
        c.assinar(n, (d) => barramento.current.ouvintes.get(n)?.forEach((f) => (f as (x: unknown) => void)(d))),
      ),
    ];
    c.iniciar();
    return () => {
      offs.forEach((f) => f());
      c.parar();
    };
  }, [projeto, fabrica]);

  const funcoes = useMemo(
    () => ({
      assinar: <K extends NomeEvento>(nome: K, fn: (d: EventosStream[K]) => void) => {
        const mapa = barramento.current.ouvintes;
        let s = mapa.get(nome);
        if (!s) mapa.set(nome, (s = new Set()));
        s.add(fn as (d: never) => void);
        return () => {
          s.delete(fn as (d: never) => void);
        };
      },
      aoRecarregar: (fn: () => void) => {
        barramento.current.recarregar.add(fn);
        return () => {
          barramento.current.recarregar.delete(fn);
        };
      },
    }),
    [],
  );
  const valor = useMemo<ValorStream>(() => ({ status, ...funcoes }), [status, funcoes]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/** Status da conexão e assinatura manual de eventos. */
export function useStream(): ValorStream {
  return useContext(Ctx);
}

/** Assina um evento (`mensagem`, `agente`, `tarefa`) enquanto o componente existir. */
export function useEvento<K extends NomeEvento>(nome: K, fn: (d: EventosStream[K]) => void): void {
  const { assinar } = useContext(Ctx);
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => assinar(nome, (d) => ref.current(d)), [assinar, nome]);
}

/** Chama `fn` quando o stream reconecta depois de uma queda: refaça o REST. */
export function useRecarregar(fn: () => void): void {
  const { aoRecarregar } = useContext(Ctx);
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => aoRecarregar(() => ref.current()), [aoRecarregar]);
}
