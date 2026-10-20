import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ConexaoStream, NOMES_EVENTO, type FabricaFonte, type StatusStream } from "./stream";
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
  workspace = null,
  fabrica,
  children,
}: {
  projeto: string | null;
  /** Workspace remoto (id) ou "*" (todos os Workspaces); null = o local */
  workspace?: string | null;
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
    const c = new ConexaoStream({ projeto, workspace, fabrica });
    conexao.current = c;
    setStatus("conectando");
    const offs = [
      c.aoMudar(setStatus),
      c.aoVoltar(() => barramento.current.recarregar.forEach((f) => f())),
      ...NOMES_EVENTO.map((n) =>
        c.assinar(n, (d) => barramento.current.ouvintes.get(n)?.forEach((f) => (f as (x: unknown) => void)(d))),
      ),
    ];
    c.iniciar();
    return () => {
      offs.forEach((f) => f());
      c.parar();
    };
  }, [projeto, workspace, fabrica]);

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

/**
 * Stream de todos os squads (`/api/stream?projeto=*`). O provider abre essa
 * conexão no lugar da do projeto enquanto a tela Visão geral está aberta, então
 * o hook só expõe o status e a assinatura: os eventos chegam com `projeto`.
 */
export function useStreamGeral(): ValorStream {
  return useContext(Ctx);
}

/** Como `useEvento`, mas só entrega eventos do stream "*" (os que trazem `projeto`). */
export function useEventoSquad<K extends NomeEvento>(nome: K, fn: (d: EventosStream[K], projeto: string) => void): void {
  useEvento(nome, (d) => {
    const projeto = (d as { projeto?: unknown }).projeto;
    if (typeof projeto === "string" && projeto) fn(d, projeto);
  });
}

/**
 * Stream de todos os Workspaces (`/api/stream?workspace=*`). O provider abre
 * essa conexão (uma só) enquanto a tela Workspaces está aberta; os eventos
 * `mensagem`/`agente`/... chegam com `workspace` e `projeto`, e `workspace`
 * traz o resumo do Workspace que mudou.
 */
export function useStreamWorkspaces(): ValorStream {
  return useContext(Ctx);
}

/** Como `useEvento`, mas só entrega eventos que trazem `workspace` (stream `workspace=*`). */
export function useEventoWorkspace<K extends Exclude<NomeEvento, "workspace" | "ola" | "ping">>(
  nome: K,
  fn: (d: EventosStream[K], workspace: string) => void,
): void {
  useEvento(nome, (d) => {
    const ws = (d as { workspace?: unknown }).workspace;
    if (typeof ws === "string" && ws) fn(d, ws);
  });
}
