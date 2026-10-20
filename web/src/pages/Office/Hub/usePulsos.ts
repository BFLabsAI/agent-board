import { useCallback, useEffect, useRef, useState } from "react";
import type { Mensagem } from "../../../api/tipos";
import { useEvento } from "../../../api/useStream";
import { chaveTipoMsg, ESTILO_TIPO_MSG } from "../../../lib/cores";
import { truncar } from "../../../lib/formato";
import type { Pt, Rota } from "./geometria";

export interface Pulso {
  id: string;
  d: string;
  cor: string;
  /** segundos */
  dur: number;
  pasta: boolean;
  fim: Pt;
  tipo: string;
}

export interface Balao {
  id: string;
  agente: string;
  texto: string;
  cor: string;
}

interface Item {
  m: Mensagem;
  rota: Rota;
}

const MAX_ATIVOS = 4;
export interface OpcoesPulsos {
  /** só reage a mensagens deste projeto (stream "*" do Office/Andar) */
  projeto?: string;
  /** pulsos simultâneos (padrão 4) */
  maxAtivos?: number;
  /** no stream `workspace=*` (Prédio): só reage a mensagens deste Workspace */
  workspace?: string;
  /** teto compartilhado entre várias salas (Prédio): `usados` conta os pulsos em voo de todas */
  orcamento?: { usados: number; max: number };
  /** chamado a cada mensagem aceita da sala, antes da fila (a sala pisca) */
  aoMensagem?: (m: Mensagem) => void;
}
const ESPACO_MS = 260;
const MAX_FILA = 30;
export const DURACAO_BALAO_MS = 4000;

/**
 * Fila de pulsos: cada mensagem do SSE vira um pulso que corre pelas linhas até o destino.
 * No máximo 4 em voo e 260 ms entre largadas, para não embolar. O balão de fala aparece
 * no remetente por 4 s; resposta com veredito rejeitado pisca a mesa de destino.
 */
export function usePulsos(rotaEntre: (de: string, para: string) => Rota | null, reduzido: boolean, opcoes: OpcoesPulsos = {}) {
  const opRef = useRef(opcoes);
  opRef.current = opcoes;
  const [pulsos, setPulsos] = useState<Pulso[]>([]);
  const [baloes, setBaloes] = useState<Record<string, Balao>>({});
  const [flashes, setFlashes] = useState<Record<string, string>>({});

  const fila = useRef<Item[]>([]);
  const ativos = useRef(0);
  const ultimaLargada = useRef(0);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const seq = useRef(0);
  const rotaRef = useRef(rotaEntre);
  rotaRef.current = rotaEntre;
  const reduzidoRef = useRef(reduzido);
  reduzidoRef.current = reduzido;
  const drenarRef = useRef<() => void>(() => undefined);

  const agendar = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
    return t;
  }, []);

  const iniciar = useCallback(
    (item: Item) => {
      const { m, rota } = item;
      const chave = chaveTipoMsg(m);
      const cor = ESTILO_TIPO_MSG[chave].hex;
      const dur = reduzidoRef.current ? 0.6 : Math.min(2.6, Math.max(1.0, 0.9 + rota.len / 650));
      const id = `${m.id}#${++seq.current}`;
      ativos.current += 1;
      if (opRef.current.orcamento) opRef.current.orcamento.usados += 1;
      ultimaLargada.current = Date.now();

      setPulsos((p) => [...p, { id, d: rota.d, cor, dur, pasta: m.tipo === "entrega", fim: rota.fim, tipo: chave }]);
      const texto = truncar((m.assunto ?? "").trim() || m.tipo, 34);
      setBaloes((b) => ({ ...b, [m.de]: { id, agente: m.de, texto, cor } }));
      agendar(() => setBaloes((b) => (b[m.de]?.id === id ? Object.fromEntries(Object.entries(b).filter(([k]) => k !== m.de)) : b)), DURACAO_BALAO_MS);

      if (chave === "rejeicao") {
        agendar(() => {
          setFlashes((f) => ({ ...f, [m.para]: id }));
          agendar(() => setFlashes((f) => (f[m.para] === id ? Object.fromEntries(Object.entries(f).filter(([k]) => k !== m.para)) : f)), 1400);
        }, dur * 1000);
      }

      agendar(() => {
        setPulsos((p) => p.filter((x) => x.id !== id));
        ativos.current -= 1;
        if (opRef.current.orcamento) opRef.current.orcamento.usados = Math.max(0, opRef.current.orcamento.usados - 1);
        drenarRef.current();
      }, dur * 1000 + 450);
    },
    [agendar],
  );

  const drenar = useCallback(() => {
    if (espera.current || fila.current.length === 0 || ativos.current >= (opRef.current.maxAtivos ?? MAX_ATIVOS)) return;
    const aguardar = Math.max(0, ultimaLargada.current + ESPACO_MS - Date.now());
    espera.current = agendar(() => {
      espera.current = null;
      const orc = opRef.current.orcamento;
      if (orc && orc.usados >= orc.max) {
        // o prédio todo está no limite: tenta de novo daqui a pouco
        espera.current = agendar(() => {
          espera.current = null;
          drenarRef.current();
        }, 400);
        return;
      }
      const prox = fila.current.shift();
      if (prox) iniciar(prox);
      drenarRef.current();
    }, aguardar);
  }, [agendar, iniciar]);
  drenarRef.current = drenar;

  useEvento("mensagem", (m) => {
    const alvo = opRef.current.projeto;
    if (alvo && (m as { projeto?: string }).projeto !== alvo) return;
    const ws = opRef.current.workspace;
    if (ws && (m as { workspace?: string }).workspace !== ws) return;
    opRef.current.aoMensagem?.(m);
    const rota = rotaRef.current(m.de, m.para);
    if (!rota) return;
    fila.current.push({ m, rota });
    if (fila.current.length > MAX_FILA) fila.current.shift();
    drenar();
  });

  useEffect(() => {
    const ts = timers.current;
    return () => {
      ts.forEach(clearTimeout);
      ts.clear();
      const orc = opRef.current.orcamento;
      if (orc) orc.usados = Math.max(0, orc.usados - ativos.current);
      espera.current = null;
      ativos.current = 0;
      fila.current = [];
    };
  }, []);

  return { pulsos, baloes, flashes };
}
