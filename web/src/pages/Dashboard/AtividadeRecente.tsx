import clsx from "clsx";
import { MessageSquare } from "lucide-react";
import type { Mensagem } from "../../api/tipos";
import { Card, EmptyState, Skeleton, TempoRelativo, TipoMsgBadge } from "../../components/ui";
import { nomeCurto } from "../../lib/formato";

export function AtividadeRecente({
  mensagens,
  novos,
  carregando,
}: {
  mensagens: Mensagem[];
  novos: ReadonlySet<string>;
  carregando: boolean;
}) {
  if (carregando && mensagens.length === 0) {
    return (
      <Card semPadding className="divide-y divide-border">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </Card>
    );
  }
  if (mensagens.length === 0) {
    return <EmptyState icone={MessageSquare} titulo="Nenhuma atividade ainda" descricao="As mensagens do board aparecem aqui assim que forem enviadas." />;
  }
  return (
    <Card semPadding className="overflow-hidden">
      <ul className="divide-y divide-border" aria-label="Atividade recente">
        {mensagens.map((m) => (
          <li
            key={m.id}
            data-mensagem={m.id}
            className={clsx(
              "px-4 py-3 transition-colors hover:bg-surface-4",
              novos.has(m.id) && "animate-slide-up bg-accent-muted",
            )}
          >
            <div className="flex items-center gap-3">
              <TipoMsgBadge mensagem={m} />
              <span className="min-w-0 flex-1 truncate text-xs text-texto-suave" title={`${m.de} → ${m.para}`}>
                {nomeCurto(m.de)} <span aria-hidden="true">→</span>
                <span className="sr-only">para</span> {nomeCurto(m.para)}
              </span>
              <TempoRelativo iso={m.ts} className="shrink-0 text-xs text-texto-fraco" />
            </div>
            <p className="mt-1.5 truncate text-sm text-texto" title={m.assunto}>
              {m.assunto || <span className="text-texto-fraco">(sem assunto)</span>}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
