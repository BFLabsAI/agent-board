import { memo, useId } from "react";
import type { Agente } from "../../../api/tipos";
import { Drones, type PosSub } from "./Drones";
import { useReduzirMovimento } from "../useReduzirMovimento";
import { estiloPapel, ESTILO_STATUS_AGENTE } from "../../../lib/cores";
import { nomeCurto, truncar } from "../../../lib/formato";
import { caixa, P, pontos } from "./geometria";
import { Robo } from "./Robo";

const HEX_STATUS: Record<string, string> = {
  trabalhando: "#34d399", esperando: "#fbbf24", pendente: "#fb923c", parado: "#94a3b8", offline: "#64748b", desconhecido: "#475569",
};

/** Última linha não vazia da tela do terminal, sem códigos de controle. */
export function ultimaLinha(tela: string | null | undefined): string {
  if (!tela) return "";
  // eslint-disable-next-line no-control-regex
  const limpa = tela.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");
  const linhas = limpa.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return linhas[linhas.length - 1] ?? "";
}

const H = 26; // altura do tampo
const TAMPO = caixa(0, 0, 124, 66, H - 5, H);
const PERNA_E = caixa(-54, 0, 9, 56, 0, H - 5);
const PERNA_D = caixa(54, 0, 9, 56, 0, H - 5);
const ZONA = pontos([P(-92, -62), P(92, -62), P(92, 62), P(-92, 62)]);
const ZONA_SEL = pontos([P(-104, -74), P(104, -74), P(104, 74), P(-104, 74)]);
const MON_X0 = -52, MON_X1 = 6, MON_Y = 4, MON_ALTO = 40;
const MONITOR_QUADRO = pontos([P(MON_X0 - 3, MON_Y, H + MON_ALTO + 3), P(MON_X1 + 3, MON_Y, H + MON_ALTO + 3), P(MON_X1 + 3, MON_Y, H + 6), P(MON_X0 - 3, MON_Y, H + 6)]);
const MONITOR_COSTAS = caixa((MON_X0 + MON_X1) / 2, MON_Y - 4, MON_X1 - MON_X0 + 6, 5, H + 6, H + MON_ALTO + 3);
const TECLADO = pontos([P(-8, 4, H), P(26, 4, H), P(26, 18, H), P(-8, 18, H)]);

export interface PropsMesa {
  agente: Agente;
  x: number;
  y: number;
  escala: number;
  /** atrasado: algum pedido dela passou do prazo */
  atrasado: boolean;
  selecionado: boolean;
  flash: string | null;
  mestre?: boolean;
  aoSelecionar: (nome: string) => void;
  aoHover: (nome: string | null) => void;
  aoHoverSub: (p: PosSub | null) => void;
  aoSelecionarSub?: (agente: string, subId: string) => void;
}

export const Mesa = memo(function Mesa({ agente, x, y, escala, atrasado, selecionado, flash, mestre, aoSelecionar, aoHover, aoHoverSub, aoSelecionarSub }: PropsMesa) {
  const reduzido = useReduzirMovimento();
  const gid = useId().replace(/:/g, "");
  const cor = estiloPapel(agente.papel).hex;
  const st = agente.status;
  const offline = st === "offline";
  const trabalhando = st === "trabalhando";
  const linha = ultimaLinha(agente.tela);
  const luz = HEX_STATUS[st] ?? HEX_STATUS.desconhecido;
  const nome = mestre ? "master" : nomeCurto(agente.agente);
  const nomeTxt = truncar(nome, 16);
  const larguraPlaca = Math.max(64, nomeTxt.length * 6.4 + 34);
  const pendentes = Math.max(0, agente.pendentes);
  const notas = Math.min(5, pendentes);
  const extra = pendentes - notas;
  const corNota = atrasado ? "#f87171" : "#fcd34d";
  const rotulo = `${nome}: ${ESTILO_STATUS_AGENTE[st]?.rotulo ?? st}`;

  const ativar = () => aoSelecionar(agente.agente);

  return (
    <g
      className="hub-mesa"
      data-testid="mesa"
      data-agente={agente.agente}
      data-status={st}
      transform={`translate(${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}) scale(${escala})`}
      role="button"
      tabIndex={0}
      aria-label={rotulo}
      aria-pressed={selecionado}
      onClick={ativar}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          ativar();
        }
      }}
      onMouseEnter={() => aoHover(agente.agente)}
      onMouseLeave={() => aoHover(null)}
      onFocus={() => aoHover(agente.agente)}
      onBlur={() => aoHover(null)}
    >
      <defs>
        <linearGradient id={`${gid}-rb`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={cor} stopOpacity="0.42" />
          <stop offset="1" stopColor="#12121d" stopOpacity="0.98" />
        </linearGradient>
        <radialGradient id={`${gid}-so`}>
          <stop offset="0" stopColor="#000" stopOpacity="0.55" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${gid}-tela`}>
          <polygon points={pontos([P(MON_X0, MON_Y, H + MON_ALTO), P(MON_X1, MON_Y, H + MON_ALTO), P(MON_X1, MON_Y, H + 9), P(MON_X0, MON_Y, H + 9)])} />
        </clipPath>
      </defs>

      {/* área de clique generosa */}
      <rect x={-110} y={-150} width={220} height={240} fill="transparent" />

      <g opacity={offline ? 0.42 : 1} className="hub-mesa-corpo">
        <ellipse cx={4} cy={14} rx={118} ry={44} fill={`url(#${gid}-so)`} />
        <polygon points={ZONA} fill={cor} fillOpacity={mestre ? 0.03 : 0.07} stroke={cor} strokeOpacity={0.3} strokeWidth={1} />
        {selecionado && <polygon points={ZONA_SEL} fill="none" stroke="#818cf8" strokeWidth={2.2} className="hub-selecao" />}
        <polygon points={ZONA_SEL} fill="none" stroke="#a5b4fc" strokeWidth={1.4} className="hub-mesa-aro" />

        {/* cadeira e robô (ou cadeira vazia) */}
        <g transform="translate(27 -30)">
          {offline ? (
            <g>
              <rect x={-17} y={-46} width={34} height={48} rx={9} fill="#171725" stroke={cor} strokeOpacity={0.28} />
              <ellipse cx={0} cy={2} rx={15} ry={6} fill="#1f1f30" />
            </g>
          ) : (
            <Robo nome={agente.agente} papel={agente.papel} cor={cor} status={st} idGrad={`${gid}-rb`} parte="corpo" />
          )}
        </g>

        {/* mesa */}
        <polygon points={PERNA_E.esq} fill="#14141f" />
        <polygon points={PERNA_E.dir} fill="#0d0d16" />
        <polygon points={PERNA_D.esq} fill="#14141f" />
        <polygon points={PERNA_D.dir} fill="#0d0d16" />
        <polygon points={TAMPO.esq} fill="#1b1b2b" stroke={cor} strokeOpacity={0.35} strokeWidth={0.8} />
        <polygon points={TAMPO.dir} fill="#12121d" stroke={cor} strokeOpacity={0.3} strokeWidth={0.8} />
        <polygon points={TAMPO.topo} fill="#262640" stroke={cor} strokeOpacity={0.65} strokeWidth={1.1} />
        <polygon points={TECLADO} fill="#14141f" stroke={cor} strokeOpacity={0.4} strokeWidth={0.7} />

        {/* monitor */}
        <polygon points={MONITOR_COSTAS.dir} fill="#0c0c14" />
        <polygon points={MONITOR_COSTAS.esq} fill="#10101a" />
        <polygon points={MONITOR_QUADRO} fill="#0a0a12" stroke={cor} strokeOpacity={0.7} strokeWidth={1} />
        <g clipPath={`url(#${gid}-tela)`}>
          <polygon
            points={pontos([P(MON_X0, MON_Y, H + MON_ALTO), P(MON_X1, MON_Y, H + MON_ALTO), P(MON_X1, MON_Y, H + 9), P(MON_X0, MON_Y, H + 9)])}
            fill={offline ? "#0e0e16" : trabalhando ? "#0c2a22" : "#101626"}
          />
          {!offline && (
            <g transform={`matrix(0.866 0.5 0 1 ${P(MON_X0, MON_Y, H + MON_ALTO)[0]} ${P(MON_X0, MON_Y, H + MON_ALTO)[1]})`} className={trabalhando ? "hub-pisca" : undefined}>
              <text x={3} y={9} className="hub-mono" fontSize={5} fill={trabalhando ? "#6ee7b7" : "#94a3b8"} data-testid="monitor-linha">
                {linha ? truncar(linha, 22) : "ocioso"}
              </text>
              {[0, 1, 2].map((i) => (
                <rect key={i} x={3} y={14 + i * 5.5} width={[28, 20, 34][i]} height={1.6} rx={0.8} fill={cor} fillOpacity={0.35} />
              ))}
              {trabalhando && <rect x={3 + Math.min(truncar(linha, 22).length, 22) * 3.05} y={4} width={2.4} height={5.6} fill="#6ee7b7" className="hub-cursor" />}
            </g>
          )}
        </g>
        {!offline && trabalhando && <circle cx={P(MON_X1 - 6, MON_Y, H + 4)[0]} cy={P(MON_X1 - 6, MON_Y, H + 4)[1]} r={1.6} fill="#34d399" className="hub-luz-pulsa" />}

        {/* braços digitando (na frente da mesa) */}
        {!offline && (
          <g transform="translate(27 -30)">
            <Robo nome={agente.agente} papel={agente.papel} cor={cor} status={st} idGrad={`${gid}-rb`} parte="bracos" />
          </g>
        )}

        {/* post-its: um por pendente */}
        {notas > 0 && (
          <g data-testid="postits" data-atrasado={atrasado || undefined}>
            {Array.from({ length: notas }, (_, i) => {
              const [px, py] = P(18 + i * 5, -14 + (i % 2) * 11, H);
              const rot = [-8, 6, -3, 9, -6][i];
              return (
                <g key={i} transform={`translate(${px} ${py}) matrix(0.866 0.5 -0.866 0.5 0 0) rotate(${rot})`}>
                  <rect x={-6} y={-6} width={12} height={12} rx={1} fill={corNota} stroke={atrasado ? "#fecaca" : "#fef3c7"} strokeWidth={0.5} />
                  <line x1={-3.5} y1={-2} x2={3.5} y2={-2} stroke="#00000055" strokeWidth={0.8} />
                  <line x1={-3.5} y1={1.5} x2={1.5} y2={1.5} stroke="#00000055" strokeWidth={0.8} />
                </g>
              );
            })}
            {extra > 0 && (
              <text x={P(56, -8, H)[0]} y={P(56, -8, H)[1] + 4} fontSize={11} fontWeight={700} fill={corNota} textAnchor="middle">+{extra}</text>
            )}
          </g>
        )}

        {/* partículas de trabalho */}
        {trabalhando && (
          <g aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <circle key={i} cx={14 + i * 11} cy={-76 - (i % 2) * 6} r={1.6} fill="#6ee7b7" className="hub-particula" style={{ animationDelay: `${i * 0.6}s` }} />
            ))}
          </g>
        )}

        {/* balão de espera */}
        {st === "esperando" && (
          <g transform="translate(27 -112)" data-testid="balao-espera">
            <g className="hub-balao-pulsa">
              <path d="M-11 -11 h22 a6 6 0 0 1 6 6 v10 a6 6 0 0 1 -6 6 h-9 l-5 7 l-1 -7 h-6 a6 6 0 0 1 -6 -6 v-10 a6 6 0 0 1 6 -6z" fill="#fbbf24" stroke="#fde68a" strokeWidth={1} />
              <text y={5.5} textAnchor="middle" fontSize={15} fontWeight={800} fill="#1c1400">?</text>
            </g>
          </g>
        )}

        {flash && (
          <g key={flash} className="hub-flash" data-testid="flash-rejeicao" aria-hidden="true">
            <polygon points={ZONA_SEL} fill="#ef4444" fillOpacity={0.3} stroke="#fb7185" strokeWidth={2.5} />
            <ellipse cx={0} cy={-30} rx={96} ry={78} fill="none" stroke="#fb7185" strokeOpacity={0.5} strokeWidth={1.5} />
          </g>
        )}

        {/* placa com nome e luz de status */}
        <g transform="translate(0 72)">
          <rect x={-larguraPlaca / 2} y={-9} width={larguraPlaca} height={19} rx={9.5} fill="#0c0c14" fillOpacity={0.92} stroke={cor} strokeOpacity={0.5} />
          <circle cx={-larguraPlaca / 2 + 11} cy={0.5} r={3.6} fill={luz} className={trabalhando ? "hub-luz-pulsa" : undefined} data-testid="luz-status" />
          <circle cx={-larguraPlaca / 2 + 11} cy={0.5} r={6.4} fill={luz} fillOpacity={0.18} />
          <text x={6} y={4} textAnchor="middle" fontSize={11} fontWeight={600} fill="#e4e4ed">{nomeTxt}</text>
        </g>
      </g>
      <Drones
        subs={agente.subagentes ?? []}
        cor={cor}
        reduzido={reduzido}
        escala={escala}
        mx={x}
        my={y}
        aoHoverSub={aoHoverSub}
        aoAbrirSub={(id) => aoSelecionarSub?.(agente.agente, id)}
      />
      <title>{rotulo}</title>
    </g>
  );
});
