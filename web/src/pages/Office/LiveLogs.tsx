import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Terminal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Mensagem } from "../../api/tipos";
import { cliente } from "../../api/cliente";
import { useContextoPainel } from "../../context/ContextoPainel";
import { useEvento } from "../../api/useStream";
import { TempoRelativo, TipoMsgBadge } from "../../components/ui";
import { nomeCurto, truncar } from "../../lib/formato";
import { useReduzirMovimento } from "./useReduzirMovimento";

const MAX = 40;

/** Botão flutuante que abre um painel compacto com as mensagens que chegam pelo SSE. */
export function LiveLogs({ deslocado }: { deslocado?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [msgs, setMsgs] = useState<Mensagem[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const buscou = useRef(false);
  const { projeto } = useContextoPainel();
  const reduzido = useReduzirMovimento();
  const abertoRef = useRef(aberto);
  abertoRef.current = aberto;

  useEvento("mensagem", (m) => {
    setMsgs((l) => (l.some((x) => x.id === m.id) ? l : [m, ...l].slice(0, MAX)));
    if (!abertoRef.current) setNaoLidas((n) => n + 1);
  });

  // ao abrir pela primeira vez, completa com o histórico recente para o painel não nascer vazio
  useEffect(() => {
    if (!aberto) return;
    setNaoLidas(0);
    if (buscou.current) return;
    buscou.current = true;
    const ac = new AbortController();
    cliente
      .mensagens({ projeto: projeto ?? undefined, limite: 15 }, ac.signal)
      .then((p) =>
        setMsgs((atual) => {
          const ids = new Set(atual.map((x) => x.id));
          return [...atual, ...p.mensagens.filter((x) => !ids.has(x.id))].sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, MAX);
        }),
      )
      .catch(() => undefined);
    return () => ac.abort();
  }, [aberto, projeto]);

  return (
    <div className={clsx("absolute bottom-3 z-10 flex flex-col items-end gap-2 transition-[right]", deslocado ? "right-[412px]" : "right-3")}>
      <AnimatePresence>
        {aberto && (
          <motion.section
            key="painel"
            aria-label="Live Logs"
            data-testid="live-logs"
            initial={reduzido ? false : { opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduzido ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: reduzido ? 0 : 0.18 }}
            className="flex max-h-[min(420px,60vh)] w-[340px] flex-col overflow-hidden rounded-xl border border-border-light bg-surface-1/95 shadow-card backdrop-blur-md"
          >
            <header className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs font-semibold text-texto">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-status-trabalhando" aria-hidden="true" />
              Live Logs
              <span className="text-texto-fraco">{msgs.length}</span>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar painel de logs" className="ml-auto rounded p-1 text-texto-fraco hover:bg-surface-4 hover:text-texto">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </header>
            {msgs.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-texto-fraco">Aguardando mensagens do time...</p>
            ) : (
              <ol className="divide-y divide-border overflow-y-auto" data-testid="live-logs-lista">
                {msgs.map((m) => (
                  <li key={m.id} className="px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[10px] text-texto-fraco">
                      <TipoMsgBadge mensagem={m} className="!px-1.5 !py-0 !text-[10px]" />
                      <span className="inline-flex min-w-0 items-center gap-1 truncate">
                        {nomeCurto(m.de)} <ArrowRight className="h-2.5 w-2.5 shrink-0" aria-hidden="true" /> {nomeCurto(m.para)}
                      </span>
                      <TempoRelativo iso={m.ts} className="ml-auto shrink-0" />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-texto" title={m.assunto}>{truncar(m.assunto || "(sem assunto)", 80)}</p>
                  </li>
                ))}
              </ol>
            )}
          </motion.section>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-label={aberto ? "Fechar Live Logs" : "Abrir Live Logs"}
        className="relative inline-flex items-center gap-2 rounded-full border border-border-light bg-surface-2/95 px-3.5 py-2 text-xs font-medium text-texto shadow-card backdrop-blur transition-colors hover:border-accent/50 hover:bg-surface-4"
      >
        <Terminal className="h-4 w-4 text-accent-hover" aria-hidden="true" />
        Live Logs
        {naoLidas > 0 && !aberto && (
          <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white" data-testid="live-logs-nao-lidas">{naoLidas}</span>
        )}
      </button>
    </div>
  );
}
