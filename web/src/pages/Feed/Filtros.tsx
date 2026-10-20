import clsx from "clsx";
import { ArrowRight, Check, ChevronDown, Filter, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function ChipFiltro({
  rotulo,
  valor,
  opcoes,
  onChange,
  vazio = "Nenhuma opção",
}: {
  rotulo: string;
  valor: string;
  opcoes: Array<{ valor: string; rotulo: string }>;
  onChange: (v: string) => void;
  vazio?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);
  const atual = opcoes.find((o) => o.valor === valor);
  return (
    <div ref={ref} className="relative">
      <div
        className={clsx(
          "inline-flex items-center rounded-lg border text-sm transition-colors",
          valor ? "border-accent/40 bg-accent-muted text-accent-hover" : "border-border bg-surface-2 text-texto-suave hover:border-border-light hover:text-texto",
        )}
      >
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={aberto}
          onClick={() => setAberto((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5"
        >
          {rotulo}
          {valor && <span className="max-w-[12rem] truncate font-medium">: {atual?.rotulo ?? valor}</span>}
          {!valor && <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
        {valor && (
          <button type="button" aria-label={`Limpar filtro ${rotulo}`} onClick={() => onChange("")} className="mr-1.5 rounded p-0.5 hover:bg-accent/20">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
      {aberto && (
        <div role="menu" aria-label={rotulo} className="absolute left-0 top-full z-20 mt-1 max-h-64 min-w-[12rem] overflow-y-auto rounded-lg border border-border-light bg-surface-3 p-1 shadow-card animate-fade-in">
          {opcoes.length === 0 && <p className="px-3 py-2 text-xs text-texto-fraco">{vazio}</p>}
          {opcoes.map((o) => (
            <button
              key={o.valor}
              type="button"
              role="menuitemradio"
              aria-checked={o.valor === valor}
              onClick={() => {
                onChange(o.valor === valor ? "" : o.valor);
                setAberto(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm text-texto-suave transition-colors hover:bg-surface-4 hover:text-texto"
            >
              <Check className={clsx("h-3.5 w-3.5 shrink-0", o.valor === valor ? "text-accent-hover" : "opacity-0")} aria-hidden="true" />
              <span className="truncate">{o.rotulo}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function BarraBusca({
  busca,
  onBusca,
  de,
  ate,
  onDe,
  onAte,
  filtrando,
  onLimpar,
  children,
}: {
  busca: string;
  onBusca: (v: string) => void;
  de: string;
  ate: string;
  onDe: (v: string) => void;
  onAte: (v: string) => void;
  filtrando: boolean;
  onLimpar: () => void;
  children: React.ReactNode;
}) {
  const campo = "rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-texto [color-scheme:dark] transition-colors focus:border-accent/60";
  return (
    <div className="mb-4 rounded-xl border border-border bg-surface-3 p-3 shadow-card">
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 shrink-0 text-texto-fraco" aria-hidden="true" />
        <label className="relative min-w-[16rem] flex-1">
          <span className="sr-only">Buscar mensagens</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-fraco" aria-hidden="true" />
          <input
            type="search"
            value={busca}
            onChange={(e) => onBusca(e.target.value)}
            placeholder="Buscar assunto, id ou issue..."
            className={clsx(campo, "w-full pl-9 placeholder:text-texto-fraco")}
          />
        </label>
        <div className="flex items-center gap-2">
          <input type="date" aria-label="Data inicial" value={de} max={ate || undefined} onChange={(e) => onDe(e.target.value)} className={campo} />
          <ArrowRight className="h-4 w-4 text-texto-fraco" aria-hidden="true" />
          <input type="date" aria-label="Data final" value={ate} min={de || undefined} onChange={(e) => onAte(e.target.value)} className={campo} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {children}
        {filtrando && (
          <button type="button" onClick={onLimpar} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-texto-suave transition-colors hover:bg-surface-4 hover:text-texto">
            <X className="h-3.5 w-3.5" aria-hidden="true" /> Limpar filtros
          </button>
        )}
      </div>
    </div>
  );
}
