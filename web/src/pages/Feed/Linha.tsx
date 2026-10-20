import clsx from "clsx";
import { ChevronRight, ExternalLink } from "lucide-react";
import { forwardRef } from "react";
import type { Mensagem } from "../../api/tipos";
import { LinkPainel } from "../../components/LinkPainel";
import { Badge, TempoRelativo, TipoMsgBadge } from "../../components/ui";
import { formatarDataHora, formatarHora, nomeCurto } from "../../lib/formato";
import { camposDaMensagem } from "./lib";

function Valor({ chave, valor, raizDe }: { chave: string; valor: unknown; raizDe: (id: string) => string }) {
  if (chave === "responde_a" && typeof valor === "string") {
    return (
      <span className="flex flex-wrap gap-x-2">
        {valor.split(",").map((id) => id.trim()).filter(Boolean).map((id) => (
          <LinkPainel key={id} to={`/conversas/${encodeURIComponent(raizDe(id))}`} className="text-accent-hover underline-offset-2 hover:underline">
            {id}
          </LinkPainel>
        ))}
      </span>
    );
  }
  if (Array.isArray(valor)) return <span>{valor.map((v) => (chave === "issues" ? `#${String(v)}` : String(v))).join(", ")}</span>;
  if ((chave === "ts" || chave === "prazo") && typeof valor === "string") return <span>{formatarDataHora(valor)} <span className="text-texto-fraco">({valor})</span></span>;
  return <span>{typeof valor === "object" ? JSON.stringify(valor) : String(valor)}</span>;
}

interface Props {
  m: Mensagem;
  expandida: boolean;
  onAlternar: () => void;
  novo?: boolean;
  raizDe: (id: string) => string;
  recuo?: boolean;
}

export const Linha = forwardRef<HTMLDivElement, Props>(function Linha({ m, expandida, onAlternar, novo, raizDe, recuo }, ref) {
  const raiz = raizDe(m.id);
  const painel = `feed-det-${m.id}`;
  return (
    <div
      ref={ref}
      data-testid="feed-linha"
      data-id={m.id}
      className={clsx("border-b border-border/70 last:border-b-0", novo && "feed-novo", recuo && "bg-surface-2/40")}
    >
      <div className="group flex items-center gap-2 pr-3 transition-colors hover:bg-surface-4/60">
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={expandida}
          aria-controls={painel}
          aria-label={`${expandida ? "Recolher" : "Expandir"} mensagem ${m.id}`}
          className={clsx("flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left", recuo && "pl-10")}
        >
          <ChevronRight className={clsx("h-4 w-4 shrink-0 text-texto-fraco transition-transform", expandida && "rotate-90")} aria-hidden="true" />
          <span className="w-12 shrink-0 font-mono text-xs text-texto-fraco" title={formatarDataHora(m.ts)}>{formatarHora(m.ts)}</span>
          <TipoMsgBadge mensagem={m} className="min-w-[6.5rem] justify-center" />
          <span className="min-w-0 flex-1 truncate text-sm">
            <span className="text-texto-suave">{nomeCurto(m.de)} <span aria-label="para">›</span> {nomeCurto(m.para)}</span>
            {m.assunto && <span className="text-texto"> · {m.assunto}</span>}
          </span>
          {(m.issues ?? []).length > 0 && (
            <span className="hidden shrink-0 gap-1 md:flex">
              {(m.issues ?? []).slice(0, 3).map((i) => (
                <Badge key={i} tom="accent" className="px-2 py-0.5 font-mono">#{i}</Badge>
              ))}
              {(m.issues ?? []).length > 3 && <Badge className="px-2 py-0.5">+{(m.issues ?? []).length - 3}</Badge>}
            </span>
          )}
          <TempoRelativo iso={m.ts} className="w-20 shrink-0 text-right text-xs text-texto-fraco" />
        </button>
        <LinkPainel
          to={`/conversas/${encodeURIComponent(raiz)}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-texto transition-colors hover:border-accent/50 hover:text-accent-hover"
        >
          Conversa <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </LinkPainel>
      </div>
      {expandida && (
        <dl id={painel} className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1.5 border-t border-border/60 bg-surface-1/70 px-6 py-3 text-xs animate-fade-in">
          {camposDaMensagem(m).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-mono text-texto-fraco">{k}</dt>
              <dd className="min-w-0 break-words font-mono text-texto">
                <Valor chave={k} valor={v} raizDe={raizDe} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
});
