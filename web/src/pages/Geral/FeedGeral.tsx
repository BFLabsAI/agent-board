import clsx from "clsx";
import { ChevronRight, Loader2, MessagesSquare, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cliente } from "../../api/cliente";
import type { MensagemSquad } from "../../api/tipos";
import { useApi } from "../../api/useApi";
import { useEventoSquad } from "../../api/useStream";
import { EmptyState, Skeleton, TempoRelativo, TipoMsgBadge } from "../../components/ui";
import { nomeCurto } from "../../lib/formato";
import { chaveMsg, corSquad, mesclarFeed } from "./lib";

const POR_PAGINA = 30;

export function ChipSquad({ projeto, className }: { projeto: string; className?: string }) {
  const c = corSquad(projeto);
  return (
    <span
      data-testid="chip-squad"
      data-squad={projeto}
      title={projeto}
      className={clsx("inline-flex max-w-[11rem] shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-5", c.chip, className)}
    >
      <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", c.ponto)} aria-hidden="true" />
      <span className="truncate">{projeto}</span>
    </span>
  );
}

export function FeedGeral({ squads }: { squads: string[] }) {
  const api = useApi((_c, s) => cliente.mensagensGeral({ limite: POR_PAGINA }, s));
  const [itens, setItens] = useState<MensagemSquad[]>([]);
  const [mais, setMais] = useState(false);
  const [filtro, setFiltro] = useState<string | null>(null);
  const [pausado, setPausado] = useState(false);
  const [buffer, setBuffer] = useState<MensagemSquad[]>([]);
  const [novos, setNovos] = useState<ReadonlySet<string>>(new Set());
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erroMais, setErroMais] = useState<string | null>(null);

  useEffect(() => {
    if (!api.dados) return;
    setItens(mesclarFeed([], api.dados.mensagens));
    setMais(api.dados.mais);
    setBuffer([]);
    setNovos(new Set());
  }, [api.dados]);

  useEventoSquad("mensagem", (m, projeto) => {
    const msg: MensagemSquad = { ...m, projeto };
    if (pausado) {
      setBuffer((b) => mesclarFeed(b, [msg]));
      return;
    }
    setItens((atual) => mesclarFeed(atual, [msg]));
    setNovos((s) => new Set(s).add(chaveMsg(msg)));
  });

  const retomar = useCallback(() => {
    setItens((atual) => mesclarFeed(atual, buffer));
    setNovos(new Set(buffer.map(chaveMsg)));
    setBuffer([]);
    setPausado(false);
  }, [buffer]);

  const carregarMais = useCallback(async () => {
    const ultima = itens[itens.length - 1];
    if (!ultima || carregandoMais) return;
    setCarregandoMais(true);
    setErroMais(null);
    try {
      const pag = await cliente.mensagensGeral({ antes: ultima.ts, limite: POR_PAGINA });
      setItens((atual) => mesclarFeed(atual, pag.mensagens));
      setMais(pag.mais);
    } catch (e) {
      setErroMais(e instanceof Error ? e.message : "Falha ao carregar");
    } finally {
      setCarregandoMais(false);
    }
  }, [itens, carregandoMais]);

  const visiveis = useMemo(() => (filtro ? itens.filter((m) => m.projeto === filtro) : itens), [itens, filtro]);
  const nomes = useMemo(() => Array.from(new Set([...squads, ...itens.map((m) => m.projeto)])).sort(), [squads, itens]);

  return (
    <section aria-label="Feed unificado" className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-border bg-surface-3 shadow-card">
      <header className="border-b border-border px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-texto">
            <MessagesSquare className="h-4 w-4 text-accent-hover" aria-hidden="true" /> Feed de todos os squads
          </h2>
          <button
            type="button"
            onClick={() => (pausado ? retomar() : setPausado(true))}
            aria-pressed={pausado}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
              pausado ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-border text-texto-suave hover:bg-surface-4 hover:text-texto",
            )}
          >
            {pausado ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}
            {pausado ? (buffer.length ? `Retomar (${buffer.length} novas)` : "Retomar") : "Pausar"}
          </button>
        </div>
        <div role="group" aria-label="Filtrar por squad" className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={filtro === null}
            onClick={() => setFiltro(null)}
            className={clsx("rounded-md border px-2 py-0.5 text-[11px] font-medium leading-5 transition-colors", filtro === null ? "border-accent/40 bg-accent-muted text-accent-hover" : "border-border text-texto-suave hover:bg-surface-4")}
          >
            Todos
          </button>
          {nomes.map((n) => {
            const c = corSquad(n);
            const ativo = filtro === n;
            return (
              <button
                key={n}
                type="button"
                aria-pressed={ativo}
                onClick={() => setFiltro(ativo ? null : n)}
                className={clsx(
                  "inline-flex max-w-[11rem] items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-5 transition-colors",
                  ativo ? c.chip : "border-border text-texto-suave hover:bg-surface-4",
                )}
              >
                <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", c.ponto)} aria-hidden="true" />
                <span className="truncate">{n}</span>
              </button>
            );
          })}
        </div>
      </header>

      <div className="max-h-[34rem] min-h-0 flex-1 overflow-y-auto xl:max-h-none" data-testid="feed-geral-lista">
        {api.carregando && itens.length === 0 ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }, (_, k) => <Skeleton key={k} className="h-16 w-full" />)}
          </div>
        ) : api.erro && itens.length === 0 ? (
          <div className="p-4"><EmptyState icone={MessagesSquare} titulo="Não foi possível carregar o feed" descricao={api.erro.message} /></div>
        ) : visiveis.length === 0 ? (
          <div className="p-4"><EmptyState icone={MessagesSquare} titulo="Nenhuma mensagem" descricao={filtro ? `Nada carregado de ${filtro}. Carregue mais ou limpe o filtro.` : "Quando os agentes conversarem, aparece aqui."} /></div>
        ) : (
          <ul>
            {visiveis.map((m) => (
              <li
                key={chaveMsg(m)}
                data-testid="feed-geral-linha"
                data-squad={m.projeto}
                data-id={m.id}
                className={clsx("border-b border-border/70 px-4 py-3 last:border-b-0", novos.has(chaveMsg(m)) && "geral-feed-novo")}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <ChipSquad projeto={m.projeto} />
                    <TipoMsgBadge mensagem={m} />
                  </div>
                  <TempoRelativo iso={m.ts} className="shrink-0 text-xs text-texto-fraco" />
                </div>
                <p className="mt-1.5 flex min-w-0 items-center gap-1 text-xs text-texto-suave">
                  <span className="truncate" title={m.de}>{nomeCurto(m.de)}</span>
                  <ChevronRight className="h-3 w-3 shrink-0 text-texto-fraco" aria-label="para" />
                  <span className="truncate" title={m.para}>{nomeCurto(m.para)}</span>
                </p>
                <p className="mt-0.5 line-clamp-2 break-words text-sm text-texto" title={m.assunto}>{m.assunto || "(sem assunto)"}</p>
              </li>
            ))}
          </ul>
        )}
        {(mais || erroMais) && itens.length > 0 && (
          <div className="border-t border-border p-3 text-center">
            {erroMais && <p className="mb-2 text-xs text-red-300">{erroMais}</p>}
            <button
              type="button"
              onClick={() => void carregarMais()}
              disabled={carregandoMais}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-texto-suave transition-colors hover:bg-surface-4 hover:text-texto disabled:opacity-60"
            >
              {carregandoMais && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Carregar mais
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
