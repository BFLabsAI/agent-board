import { scaleSqrt } from "d3";
import { useMemo, useState } from "react";
import type { Workflows } from "../../api/tipos";
import { estiloPapel } from "../../lib/cores";
import { formatarNumero, nomeCurto, truncar } from "../../lib/formato";
import { agentesDaComunicacao } from "./derivar";

const W = 1000;
const H = 500;
const CY = 262;
const R = 30;

interface Pt {
  x: number;
  y: number;
}

export function GrafoComunicacao({
  comunicacao,
  selecionado,
  onSelecionar,
}: {
  comunicacao: Workflows["comunicacao"];
  selecionado: string | null;
  onSelecionar: (id: string | null) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const agentes = useMemo(() => agentesDaComunicacao(comunicacao), [comunicacao]);
  const pos = useMemo(() => {
    const m = new Map<string, Pt>();
    const master = agentes.filter((a) => a.papel === "master");
    const resto = agentes.filter((a) => a.papel !== "master");
    master.forEach((a, i) => m.set(a.id, { x: W / 2, y: CY + (i - (master.length - 1) / 2) * 70 }));
    const centro = master.length > 0;
    resto.forEach((a, i) => {
      const ang = -Math.PI / 2 + (i / Math.max(1, resto.length)) * Math.PI * 2 + (centro ? 0 : 0);
      const unico = resto.length === 1 && centro;
      m.set(a.id, { x: W / 2 + (unico ? 0 : Math.cos(ang) * 360), y: CY + (unico ? -165 : Math.sin(ang) * 170) });
    });
    return m;
  }, [agentes]);
  const maxN = Math.max(1, ...comunicacao.map((e) => e.n));
  const larg = useMemo(() => scaleSqrt().domain([0, maxN]).range([1.5, 12]), [maxN]);
  const ativo = hover ?? selecionado;
  const existe = new Set(comunicacao.map((e) => `${e.de}>${e.para}`));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="group" aria-label="Grafo de comunicação" data-testid="grafo-comunicacao">
      {comunicacao.map((e) => {
        const a = pos.get(e.de);
        const b = pos.get(e.para);
        if (!a || !b || e.de === e.para) return null;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const dupla = existe.has(`${e.para}>${e.de}`);
        const off = dupla ? 26 : 8;
        const c = { x: (a.x + b.x) / 2 - uy * off * 2, y: (a.y + b.y) / 2 + ux * off * 2 };
        const w = larg(e.n);
        const seta = 7 + w * 0.9;
        const ini = { x: a.x + ux * (R + 2), y: a.y + uy * (R + 2) };
        // direção de chegada: do ponto de controle para o alvo
        const vx = b.x - c.x;
        const vy = b.y - c.y;
        const vl = Math.hypot(vx, vy) || 1;
        const tx = vx / vl;
        const ty = vy / vl;
        const ponta = { x: b.x - tx * (R + 3), y: b.y - ty * (R + 3) };
        const fim = { x: ponta.x - tx * seta * 0.8, y: ponta.y - ty * seta * 0.8 };
        const poly = [
          `${ponta.x},${ponta.y}`,
          `${fim.x - ty * seta * 0.55},${fim.y + tx * seta * 0.55}`,
          `${fim.x + ty * seta * 0.55},${fim.y - tx * seta * 0.55}`,
        ].join(" ");
        const meio = { x: 0.25 * ini.x + 0.5 * c.x + 0.25 * fim.x, y: 0.25 * ini.y + 0.5 * c.y + 0.25 * fim.y };
        const cor = estiloPapel(agentes.find((g) => g.id === e.de)?.papel ?? "manager").hex;
        const dentro = !ativo || e.de === ativo || e.para === ativo;
        return (
          <g key={`${e.de}>${e.para}`} opacity={dentro ? 1 : 0.08} style={{ transition: "opacity 160ms" }} data-aresta={`${e.de}>${e.para}`}>
            <title>{`${nomeCurto(e.de)} → ${nomeCurto(e.para)}: ${e.n} mensagens`}</title>
            <path d={`M${ini.x},${ini.y} Q${c.x},${c.y} ${fim.x},${fim.y}`} fill="none" stroke={cor} strokeWidth={w} strokeLinecap="round" opacity={ativo ? 0.85 : 0.55} />
            <polygon points={poly} fill={cor} opacity={ativo ? 0.95 : 0.75} />
            <g transform={`translate(${meio.x} ${meio.y})`}>
              <rect x="-14" y="-9" width="28" height="18" rx="9" fill="#13131e" stroke="#2a2a3d" />
              <text y="4" textAnchor="middle" fontSize="11" fill="#e4e4ed">{formatarNumero(e.n)}</text>
            </g>
          </g>
        );
      })}
      {agentes.map((a) => {
        const p = pos.get(a.id)!;
        const e = estiloPapel(a.papel);
        const sel = a.id === selecionado;
        const acima = a.papel !== "master" && p.y < CY - 40;
        const dentro = !ativo || a.id === ativo || comunicacao.some((c) => (c.de === ativo && c.para === a.id) || (c.para === ativo && c.de === a.id));
        return (
          <g
            key={a.id}
            transform={`translate(${p.x} ${p.y})`}
            role="button"
            tabIndex={0}
            aria-pressed={sel}
            aria-label={`${a.id}: ${a.enviadas} enviadas, ${a.recebidas} recebidas`}
            data-agente={a.id}
            className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-white"
            style={{ opacity: dentro ? 1 : 0.3, transition: "opacity 160ms" }}
            onMouseEnter={() => setHover(a.id)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(a.id)}
            onBlur={() => setHover(null)}
            onClick={() => onSelecionar(sel ? null : a.id)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                onSelecionar(sel ? null : a.id);
              }
            }}
          >
            <circle r={R} fill={`${e.hex}26`} stroke={e.hex} strokeWidth={sel ? 3 : 1.5} />
            <text y="5" textAnchor="middle" fontSize="14" fontWeight="600" fill={e.hex} style={{ filter: "brightness(1.25)" }}>
              {formatarNumero(a.enviadas + a.recebidas)}
            </text>
            <text y={acima ? -R - 22 : R + 18} textAnchor="middle" fontSize="12.5" fill="#e4e4ed">{truncar(nomeCurto(a.id), 20)}</text>
            <text y={acima ? -R - 8 : R + 33} textAnchor="middle" fontSize="10.5" fill="#6b7280">{e.rotulo}</text>
          </g>
        );
      })}
    </svg>
  );
}
