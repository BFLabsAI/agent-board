import { useCallback, useEffect, useRef, useState } from "react";
import { useContextoPainel } from "../context/ContextoPainel";
import { useRecarregar } from "./useStream";
import type { Contexto } from "./tipos";

export interface EstadoApi<T> {
  dados: T | null;
  carregando: boolean;
  erro: Error | null;
  recarregar: () => void;
}

/**
 * Busca REST com loading/erro/recarregar.
 * `buscador` recebe o contexto global (projeto, período) e um AbortSignal.
 * Refaz sozinho quando projeto/período mudam ou quando o stream reconecta.
 * Passe `deps` com os filtros locais da tela.
 */
export function useApi<T>(
  buscador: (ctx: Contexto, sinal: AbortSignal) => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
): EstadoApi<T> {
  const { projeto, periodo } = useContextoPainel();
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<Error | null>(null);
  const [tique, setTique] = useState(0);
  const fn = useRef(buscador);
  fn.current = buscador;

  const recarregar = useCallback(() => setTique((t) => t + 1), []);
  useRecarregar(recarregar);

  useEffect(() => {
    const ac = new AbortController();
    setCarregando(true);
    fn.current({ projeto: projeto ?? undefined, periodo }, ac.signal)
      .then((d) => {
        if (ac.signal.aborted) return;
        setDados(d);
        setErro(null);
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        setErro(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!ac.signal.aborted) setCarregando(false);
      });
    return () => ac.abort();
  }, [projeto, periodo, tique, ...deps]);

  return { dados, carregando, erro, recarregar };
}
