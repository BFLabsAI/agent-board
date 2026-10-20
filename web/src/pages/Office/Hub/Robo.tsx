import { memo } from "react";
import type { StatusAgente } from "../../../api/tipos";
import { hashTexto } from "../../../lib/formato";

/**
 * Robô de corpo inteiro, sentado. Origem (0,0) = quadril; y negativo sobe.
 * O nome escolhe olhos e antena; o papel escolhe a cor e o acessório
 * (coroa no master, óculos no researcher, headset no manager).
 */
export const Robo = memo(function Robo({
  nome,
  papel,
  cor,
  status,
  idGrad,
  parte,
}: {
  nome: string;
  papel: string;
  cor: string;
  status: StatusAgente;
  idGrad: string;
  /** "corpo" desenha cadeira, tronco e cabeça (atrás da mesa); "bracos" desenha os braços (na frente) */
  parte: "corpo" | "bracos";
}) {
  const h = hashTexto(nome);
  const olhos = h % 4;
  const antena = (h >> 4) % 3;
  const trabalhando = status === "trabalhando";
  const respira = status === "parado" || status === "pendente" || status === "desconhecido";
  const classeCorpo = trabalhando ? "hub-bob" : respira ? "hub-respira" : "";

  if (parte === "bracos") {
    return (
      <g className={classeCorpo} style={{ willChange: trabalhando || respira ? "transform" : undefined }}>
        {/* braços, atrás do tronco para o ombro ficar limpo */}
        <g transform="translate(-12 -26)">
          <g className={trabalhando ? "hub-braco-a" : undefined}>
            <path d="M0 0 L-3 11 L5 17" stroke="#242438" strokeWidth={5.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <circle cx={5} cy={17} r={3} fill={cor} fillOpacity={0.9} />
          </g>
        </g>
        <g transform="translate(12 -26)">
          <g className={trabalhando ? "hub-braco-b" : undefined}>
            <path d="M0 0 L3 11 L-5 17" stroke="#242438" strokeWidth={5.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <circle cx={-5} cy={17} r={3} fill={cor} fillOpacity={0.9} />
          </g>
        </g>
      </g>
    );
  }
  return (
    <g>
      {/* costas da cadeira */}
      <rect x={-17} y={-46} width={34} height={48} rx={9} fill="#171725" stroke={cor} strokeOpacity={0.28} />
      <g className={classeCorpo} style={{ willChange: trabalhando || respira ? "transform" : undefined }}>
        {/* tronco */}
        <path d="M-12 0 L12 0 L10 -29 Q0 -33 -10 -29 Z" fill={`url(#${idGrad})`} stroke={cor} strokeWidth={1.2} strokeOpacity={0.9} />
        <circle cx={0} cy={-15} r={2.6} fill={cor} />
        <circle cx={0} cy={-15} r={5} fill={cor} fillOpacity={0.18} />
        {/* cabeça */}
        <g transform="translate(0 -30)">
          <line x1={0} y1={-26} x2={0} y2={-33} stroke={cor} strokeWidth={1.6} strokeLinecap="round" />
          {antena === 0 && <circle cx={0} cy={-35} r={2.6} fill={cor} />}
          {antena === 1 && <rect x={-3} y={-38} width={6} height={4} rx={2} fill={cor} />}
          {antena === 2 && <path d="M-3.5 -33 L0 -39 L3.5 -33 Z" fill={cor} />}
          <rect x={-17} y={-18} width={3.5} height={9} rx={1.7} fill={cor} fillOpacity={0.7} />
          <rect x={13.5} y={-18} width={3.5} height={9} rx={1.7} fill={cor} fillOpacity={0.7} />
          <rect x={-14} y={-27} width={28} height={25} rx={8} fill={`url(#${idGrad})`} stroke={cor} strokeWidth={1.4} />
          <rect x={-10} y={-21} width={20} height={13} rx={5} fill="#08080f" />
          {olhos === 0 && (
            <>
              <circle cx={-4.2} cy={-14.5} r={2.5} fill={cor} />
              <circle cx={4.2} cy={-14.5} r={2.5} fill={cor} />
            </>
          )}
          {olhos === 1 && (
            <>
              <rect x={-7.5} y={-16} width={5.5} height={3.4} rx={1.7} fill={cor} />
              <rect x={2} y={-16} width={5.5} height={3.4} rx={1.7} fill={cor} />
            </>
          )}
          {olhos === 2 && (
            <>
              <rect x={-7} y={-17} width={5} height={5} rx={1.2} fill={cor} />
              <rect x={2} y={-17} width={5} height={5} rx={1.2} fill={cor} />
            </>
          )}
          {olhos === 3 && (
            <>
              <path d="M-7.5 -13 Q-4.5 -18 -1.5 -13" stroke={cor} strokeWidth={2} fill="none" strokeLinecap="round" />
              <path d="M1.5 -13 Q4.5 -18 7.5 -13" stroke={cor} strokeWidth={2} fill="none" strokeLinecap="round" />
            </>
          )}
          {status === "esperando" && <line x1={-3} y1={-10} x2={3} y2={-10} stroke={cor} strokeWidth={1.4} strokeLinecap="round" />}
          {papel === "master" && <path d="M-10 -27 L-12 -37 L-5 -31 L0 -40 L5 -31 L12 -37 L10 -27 Z" fill="#f59e0b" stroke="#fde68a" strokeWidth={0.8} strokeLinejoin="round" />}
          {papel === "researcher" && (
            <g fill="none" stroke="#6ee7b7" strokeWidth={1.4}>
              <circle cx={-4.6} cy={-14.5} r={4.6} />
              <circle cx={4.6} cy={-14.5} r={4.6} />
              <line x1={-0.2} y1={-14.5} x2={0.2} y2={-14.5} />
            </g>
          )}
          {papel !== "master" && papel !== "researcher" && (
            <g fill="none" stroke="#a5b4fc" strokeWidth={1.8} strokeLinecap="round">
              <path d="M-15 -14 Q-16 -30 0 -29 Q16 -30 15 -14" />
              <path d="M-15 -14 L-12 -8" />
            </g>
          )}
        </g>
      </g>
    </g>
  );
});
