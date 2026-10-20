import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { StatusSub, SubAgente } from "../../../api/tipos";
import { rodandoDe } from "../subagentes";

/** Pontos de flutuação ao redor da mesa (coordenadas locais da mesa, antes da escala). */
export const SLOTS: [number, number][] = [
  [-122, -26],
  [-102, -84],
  [-58, -122],
  [66, -128],
  [108, -86],
  [128, -30],
];
export const MAX_DRONES = SLOTS.length;
/** Onde o drone "pousa" (tampo da mesa) e de onde sai a linha fina. */
export const ANCORA: [number, number] = [0, -30];
const DURACAO_SAIDA = 1100;

export interface PosSub {
  sub: SubAgente;
  x: number;
  y: number;
}

interface Saindo {
  sub: SubAgente;
  slot: number;
}

const COR_STATUS: Record<StatusSub, string> = { rodando: "#34d399", concluido: "#94a3b8", erro: "#f87171", perdido: "#fbbf24" };

/** Hash simples para espalhar a fase do bob entre drones. */
const fase = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
};

/**
 * Drones dos sub-agents rodando, flutuando em volta da mesa do pai. Cada um tem uma linha fina até a mesa.
 * Ao terminar, o drone pousa na mesa e some (erro: flash vermelho e some). Só transform/opacity.
 */
export function Drones({
  subs,
  cor,
  reduzido,
  escala,
  mx,
  my,
  aoHoverSub,
  aoAbrirSub,
}: {
  subs: SubAgente[];
  cor: string;
  reduzido: boolean;
  escala: number;
  mx: number;
  my: number;
  aoHoverSub: (p: PosSub | null) => void;
  aoAbrirSub: (id: string) => void;
}) {
  const rodando = rodandoDe(subs);
  const slots = useRef(new Map<string, number>());
  const anterior = useRef(new Map<string, SubAgente>());
  const [saindo, setSaindo] = useState<Saindo[]>([]);

  // quem rodava e deixou de rodar vira "saindo" por um instante
  useLayoutEffect(() => {
    const atual = new Map(rodando.map((s) => [s.id, s]));
    const foram: Saindo[] = [];
    for (const [id, antigo] of anterior.current) {
      if (atual.has(id)) continue;
      const slot = slots.current.get(id);
      if (slot === undefined) continue;
      const novo = subs.find((s) => s.id === id);
      foram.push({ sub: { ...antigo, ...(novo ?? {}), status: novo && novo.status !== "rodando" ? novo.status : "concluido" }, slot });
    }
    anterior.current = atual;
    const ids = foram.map((f) => f.sub.id);
    if (reduzido) {
      ids.forEach((id) => slots.current.delete(id));
      return;
    }
    if (foram.length === 0) return;
    setSaindo((l) => [...l.filter((x) => !ids.includes(x.sub.id)), ...foram]);
    // sem cleanup: um novo evento não pode cancelar a limpeza dos que já pousaram
    setTimeout(() => {
      ids.forEach((id) => slots.current.delete(id));
      setSaindo((l) => l.filter((x) => !ids.includes(x.sub.id)));
    }, DURACAO_SAIDA);
  }, [subs, reduzido]);

  // slot estável por id: o menor livre (os que estão saindo ainda ocupam o seu)
  const ocupados = new Set<number>(slots.current.values());
  const visiveis: { sub: SubAgente; slot: number }[] = [];
  let sobram = 0;
  for (const s of rodando) {
    let slot = slots.current.get(s.id);
    if (slot === undefined) {
      slot = SLOTS.findIndex((_, i) => !ocupados.has(i));
      if (slot < 0) {
        sobram++;
        continue;
      }
      slots.current.set(s.id, slot);
      ocupados.add(slot);
    }
    visiveis.push({ sub: s, slot });
  }

  const desenhar = (sub: SubAgente, slot: number, saida: boolean) => {
    const [sx, sy] = SLOTS[slot];
    const dx = ANCORA[0] - sx;
    const dy = ANCORA[1] - sy;
    const luz = COR_STATUS[sub.status];
    const erro = sub.status === "erro";
    const classeCorpo = saida ? (erro ? "hub-drone-erro" : "hub-drone-pousa") : "hub-drone-entra";
    return (
      <g
        key={sub.id}
        transform={`translate(${sx} ${sy})`}
        data-testid="drone"
        data-sub={sub.id}
        data-status={sub.status}
        data-saindo={saida || undefined}
        style={{ cursor: saida ? undefined : "pointer" }}
        pointerEvents={saida ? "none" : undefined}
        onMouseEnter={saida ? undefined : () => aoHoverSub({ sub, x: mx + sx * escala, y: my + sy * escala })}
        onMouseLeave={saida ? undefined : () => aoHoverSub(null)}
        onClick={
          saida
            ? undefined
            : (e) => {
                e.stopPropagation();
                aoAbrirSub(sub.id);
              }
        }
      >
        <line x1={0} y1={0} x2={dx} y2={dy} stroke={cor} strokeOpacity={saida ? 0 : 0.45} strokeWidth={0.9} strokeDasharray="2 3" className={saida ? "hub-drone-linha-sai" : undefined} />
        <g className="hub-drone-flutua" style={{ animationDelay: `${-fase(sub.id) * 3.4}s` } as CSSProperties}>
          <g className={classeCorpo} style={{ "--dx": `${dx}px`, "--dy": `${dy}px` } as CSSProperties}>
            <g transform="scale(1.45)">
            <circle r={15} fill="transparent" />
            <ellipse cx={-10} cy={-7} rx={7.5} ry={1.7} fill={cor} fillOpacity={0.55} className="hub-drone-rotor" />
            <ellipse cx={10} cy={-7} rx={7.5} ry={1.7} fill={cor} fillOpacity={0.55} className="hub-drone-rotor" style={{ animationDelay: "-0.07s" }} />
            <line x1={-10} y1={-7} x2={-5} y2={-2} stroke={cor} strokeOpacity={0.8} strokeWidth={1.2} />
            <line x1={10} y1={-7} x2={5} y2={-2} stroke={cor} strokeOpacity={0.8} strokeWidth={1.2} />
            <rect x={-8} y={-4.5} width={16} height={10} rx={4.5} fill="#171726" stroke={cor} strokeWidth={1.4} />
            <rect x={-8} y={-4.5} width={16} height={10} rx={4.5} fill={cor} fillOpacity={0.22} />
            <circle cy={0.5} r={2.3} fill={luz} className={sub.status === "rodando" ? "hub-drone-luz" : undefined} />
            {erro && saida && <circle r={16} fill="#ef4444" className="hub-drone-flash" />}
            </g>
          </g>
        </g>
      </g>
    );
  };

  return (
    <g data-testid="drones" aria-hidden="true">
      {visiveis.map(({ sub, slot }) => desenhar(sub, slot, false))}
      {saindo.map(({ sub, slot }) => desenhar(sub, slot, true))}
      {sobram > 0 && (
        <g transform="translate(-26 -150)" data-testid="drones-mais">
          <rect x={-14} y={-8} width={28} height={16} rx={8} fill="#0c0c14" fillOpacity={0.92} stroke={cor} strokeOpacity={0.6} />
          <text y={4} textAnchor="middle" fontSize={10} fontWeight={700} fill="#e4e4ed">+{sobram}</text>
        </g>
      )}
    </g>
  );
}
