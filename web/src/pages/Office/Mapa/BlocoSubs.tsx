import type { SubAgente } from "../../../api/tipos";
import { resumoTerminados } from "../subagentes";
import { caminho, alturaSub, L } from "./layout";
import { SubCard } from "./SubCard";

interface Props {
  /** largura do card do pai */
  w: number;
  cor: string;
  subs: SubAgente[];
  extra: number;
  terminados: SubAgente[];
  reduzido: boolean;
  aoAbrir: (id: string) => void;
}

/**
 * Sub-agents sob o pai, centralizados no eixo dele. Conector: desce do centro do pai, vai à esquerda
 * e corre numa espinha curta até cada item. Rodando/perdido = sub-card; concluído/erro = 1 linha de resumo.
 */
export function BlocoSubs({ w, cor, subs, extra, terminados, reduzido, aoAbrir }: Props) {
  const largura = w - 2 * L.subInset;
  const resumo = resumoTerminados(terminados);
  type Item = { chave: string; alt: number; sub?: SubAgente; tipo: "sub" | "mais" | "resumo" };
  const itens: Item[] = [
    ...subs.map((s): Item => ({ chave: s.id, alt: alturaSub(s), sub: s, tipo: "sub" })),
    ...(extra > 0 ? [{ chave: "mais", alt: L.subMaisAlt, tipo: "mais" } as Item] : []),
    ...(resumo ? [{ chave: "resumo", alt: L.subResumoAlt, tipo: "resumo" } as Item] : []),
  ];
  if (itens.length === 0) return null;

  let y = L.subTopo;
  const pos = itens.map((it) => {
    const topo = y;
    y += it.alt + L.subGap;
    return { it, topo, meio: topo + it.alt / 2 };
  });
  const total = y - L.subGap + 4;
  const esp = L.subInset / 2;
  const barra = L.subTopo / 2;
  const ultimo = pos[pos.length - 1].meio;

  return (
    <div className="relative" data-testid="subs-pai" style={{ width: w, height: total, marginTop: 2 }}>
      <svg className="pointer-events-none absolute left-0 top-0" width={w} height={total} aria-hidden="true">
        <path d={caminho([[w / 2, 0], [w / 2, barra], [esp, barra], [esp, ultimo]], 8)} fill="none" stroke={cor} strokeOpacity={0.4} strokeWidth={1.25} strokeLinecap="round" />
        {pos.map(({ it, meio }) => {
          const d = `M ${esp} ${meio} L ${L.subInset} ${meio}`;
          const rodando = it.sub?.status === "rodando";
          return (
            <g key={it.chave} data-lig-sub={it.sub?.id}>
              <path d={d} fill="none" stroke={cor} strokeOpacity={0.4} strokeWidth={1.25} strokeLinecap="round" strokeDasharray={it.sub?.status === "perdido" || it.tipo === "resumo" ? "3 3" : undefined} />
              {rodando && !reduzido && (
                <path d={caminho([[w / 2, 0], [w / 2, barra], [esp, barra], [esp, meio], [L.subInset, meio]], 8)} fill="none" stroke="#34d399" strokeWidth={2} strokeLinecap="round" strokeDasharray="3 11" data-pulso-sub={it.sub?.id}>
                  <animate attributeName="stroke-dashoffset" from="28" to="0" dur="1.4s" repeatCount="indefinite" />
                </path>
              )}
            </g>
          );
        })}
      </svg>
      {pos.map(({ it, topo }) => (
        <div key={it.chave} className="absolute" style={{ left: L.subInset, top: topo }}>
          {it.tipo === "sub" && it.sub && <SubCard sub={it.sub} corPai={cor} largura={largura} aoAbrir={aoAbrir} />}
          {it.tipo === "mais" && (
            <span data-testid="sub-mais" className="inline-flex items-center rounded-md border border-border bg-surface-2 px-1.5 text-[11px] font-medium text-texto-suave" style={{ height: L.subMaisAlt }}>
              +{extra} rodando
            </span>
          )}
          {it.tipo === "resumo" && (
            <button
              type="button"
              data-testid="sub-resumo"
              onClick={() => aoAbrir(terminados[0].id)}
              title="Ver os sub-agents terminados na gaveta"
              style={{ width: largura, height: L.subResumoAlt }}
              className="truncate rounded-md border border-dashed border-border px-2 text-left text-[11px] text-texto-fraco transition-colors hover:border-border-light hover:bg-surface-4 hover:text-texto-suave focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {resumo}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
