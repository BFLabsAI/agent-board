import clsx from "clsx";
import { select, zoom, zoomIdentity, type ZoomBehavior } from "d3";
import { Lock, Maximize2, Minus, Plus, Unlock } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useReduzirMovimento } from "./useReduzirMovimento";

const K_MIN = 0.2;
const K_MAX = 4;

function Botao({ rotulo, onClick, children, ativo }: { rotulo: string; onClick: () => void; children: ReactNode; ativo?: boolean }) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      aria-pressed={ativo}
      onClick={onClick}
      className={clsx(
        "flex h-8 w-8 items-center justify-center rounded-md text-texto-suave transition-colors hover:bg-surface-5 hover:text-texto",
        ativo && "bg-accent-muted text-accent-hover",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Área com pan (arraste) e zoom (roda, pinça e botões) feitos com d3-zoom.
 * O conteúdo recebe só um transform CSS, sem re-render do React a cada quadro.
 */
export function CanvasZoom({ children, className, medida }: { children: ReactNode; className?: string; /** tamanho natural informado pelo modo (ex.: Mapa); sem ele, mede o DOM */ medida?: { w: number; h: number } | null }) {
  const medidaRef = useRef(medida);
  medidaRef.current = medida;
  const contRef = useRef<HTMLDivElement>(null);
  const conteudoRef = useRef<HTMLDivElement>(null);
  const comportamento = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null);
  const travadoRef = useRef(false);
  const interagiu = useRef(false);
  const reduzido = useReduzirMovimento();
  const reduzidoRef = useRef(reduzido);
  reduzidoRef.current = reduzido;
  const [k, setK] = useState(1);
  const [travado, setTravado] = useState(false);
  const [pronto, setPronto] = useState(false);

  const ajustar = useCallback((animar: boolean) => {
    const cont = contRef.current, conteudo = conteudoRef.current, z = comportamento.current;
    if (!cont || !conteudo || !z) return false;
    const [w, h] = [cont.clientWidth, cont.clientHeight];
    const cw = medidaRef.current?.w || conteudo.offsetWidth;
    const ch = medidaRef.current?.h || conteudo.offsetHeight;
    if (!w || !h || !cw || !ch) return false;
    const escala = Math.min(Math.max(Math.min(w / cw, h / ch) * 0.97, K_MIN), 1.6);
    const t = zoomIdentity.translate((w - cw * escala) / 2, (h - ch * escala) / 2).scale(escala);
    const sel = select(cont);
    if (animar && !reduzidoRef.current) sel.transition().duration(320).call(z.transform, t);
    else sel.call(z.transform, t);
    return true;
  }, []);

  useEffect(() => {
    const cont = contRef.current;
    if (!cont) return;
    const z = zoom<HTMLDivElement, unknown>()
      .scaleExtent([K_MIN, K_MAX])
      .filter((ev: Event) => {
        if (travadoRef.current) return false;
        if (ev.type === "dblclick") return false;
        const e = ev as MouseEvent;
        return (!e.ctrlKey || ev.type === "wheel") && !e.button;
      })
      .on("zoom", (ev) => {
        const { x, y, k: kk } = ev.transform;
        if (conteudoRef.current) conteudoRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${kk})`;
        setK(kk);
        if (ev.sourceEvent) interagiu.current = true;
      });
    comportamento.current = z;
    select(cont).call(z);

    const refit = () => {
      if (!interagiu.current && ajustar(false)) setPronto(true);
    };
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(refit);
      ro.observe(cont);
      if (conteudoRef.current) ro.observe(conteudoRef.current);
      refit();
    } else {
      setPronto(true);
    }
    return () => {
      ro?.disconnect();
      select(cont).on(".zoom", null);
    };
  }, [ajustar]);

  useEffect(() => {
    if (medida && !interagiu.current && ajustar(false)) setPronto(true);
  }, [medida, ajustar]);

  const passo = (fator: number) => {
    const cont = contRef.current, z = comportamento.current;
    if (!cont || !z) return;
    interagiu.current = true;
    const sel = select(cont);
    if (reduzido) sel.call(z.scaleBy, fator);
    else sel.transition().duration(200).call(z.scaleBy, fator);
  };

  const alternarTrava = () => {
    travadoRef.current = !travadoRef.current;
    setTravado(travadoRef.current);
  };

  return (
    <div className={clsx("relative h-full w-full overflow-hidden", className)} data-testid="canvas-zoom">
      <div
        ref={contRef}
        data-travado={travado || undefined}
        className={clsx("absolute inset-0 touch-none", travado ? "cursor-default" : "cursor-grab active:cursor-grabbing")}
      >
        <div
          ref={conteudoRef}
          className={clsx("absolute left-0 top-0 w-max origin-top-left transition-opacity duration-300", pronto ? "opacity-100" : "opacity-0")}
          style={{ transformOrigin: "0 0", willChange: "transform" }}
        >
          {children}
        </div>
      </div>
      <div
        role="toolbar"
        aria-label="Controles de zoom"
        className="absolute bottom-3 left-3 z-10 flex flex-col items-center gap-0.5 rounded-lg border border-border bg-surface-2/90 p-1 shadow-card backdrop-blur"
      >
        <Botao rotulo="Aproximar" onClick={() => passo(1.3)}><Plus className="h-4 w-4" aria-hidden="true" /></Botao>
        <span className="py-0.5 text-[10px] tabular-nums text-texto-fraco" data-testid="zoom-pct">{Math.round(k * 100)}%</span>
        <Botao rotulo="Afastar" onClick={() => passo(1 / 1.3)}><Minus className="h-4 w-4" aria-hidden="true" /></Botao>
        <span className="my-0.5 h-px w-5 bg-border" />
        <Botao rotulo="Ajustar à tela" onClick={() => { interagiu.current = false; ajustar(true); }}><Maximize2 className="h-4 w-4" aria-hidden="true" /></Botao>
        <Botao rotulo={travado ? "Destravar zoom e arraste" : "Travar zoom e arraste"} onClick={alternarTrava} ativo={travado}>
          {travado ? <Lock className="h-4 w-4" aria-hidden="true" /> : <Unlock className="h-4 w-4" aria-hidden="true" />}
        </Botao>
      </div>
    </div>
  );
}
