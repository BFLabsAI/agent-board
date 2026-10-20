import clsx from "clsx";
import { useId } from "react";
import type { Papel, StatusAgente } from "../../api/tipos";
import { estiloPapel } from "../../lib/cores";
import { hashTexto, papelDoNome } from "../../lib/formato";
import { StatusDot } from "./StatusDot";

/** Robô SVG determinístico: o nome escolhe olhos, boca, antena e orelhas; o papel escolhe a cor. */
export function AgentAvatar({
  nome,
  papel,
  tamanho = 40,
  status,
  className,
}: {
  nome: string;
  papel?: Papel;
  tamanho?: number;
  status?: StatusAgente;
  className?: string;
}) {
  const cor = estiloPapel(papel ?? papelDoNome(nome)).hex;
  const h = hashTexto(nome);
  const olhos = h % 4;
  const boca = (h >> 3) % 3;
  const antena = (h >> 5) % 3;
  const orelhas = (h >> 7) % 2 === 0;
  const gid = useId();

  return (
    <span className={clsx("relative inline-flex shrink-0", className)} style={{ width: tamanho, height: tamanho }}>
      <svg viewBox="0 0 40 40" width={tamanho} height={tamanho} role="img" aria-label={`Avatar de ${nome}`} data-avatar={nome}>
        <defs>
          <linearGradient id={`${gid}g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={cor} stopOpacity="0.35" />
            <stop offset="1" stopColor={cor} stopOpacity="0.12" />
          </linearGradient>
        </defs>
        <rect x="0.5" y="0.5" width="39" height="39" rx="11" fill="#13131e" stroke={cor} strokeOpacity="0.35" />
        {/* antena */}
        <line x1="20" y1="8" x2="20" y2="12" stroke={cor} strokeWidth="1.6" strokeLinecap="round" />
        {antena === 0 && <circle cx="20" cy="7" r="2" fill={cor} />}
        {antena === 1 && <rect x="17.5" y="5" width="5" height="3.5" rx="1.5" fill={cor} />}
        {antena === 2 && <path d="M17 8 L20 4.5 L23 8 Z" fill={cor} />}
        {/* orelhas */}
        {orelhas && (
          <>
            <rect x="6" y="20" width="3" height="7" rx="1.5" fill={cor} fillOpacity="0.7" />
            <rect x="31" y="20" width="3" height="7" rx="1.5" fill={cor} fillOpacity="0.7" />
          </>
        )}
        {/* cabeça */}
        <rect x="9" y="12" width="22" height="19" rx="6" fill={`url(#${gid}g)`} stroke={cor} strokeWidth="1.4" />
        {/* olhos */}
        {olhos === 0 && (
          <>
            <circle cx="15.5" cy="20" r="2.2" fill={cor} />
            <circle cx="24.5" cy="20" r="2.2" fill={cor} />
          </>
        )}
        {olhos === 1 && (
          <>
            <rect x="13" y="18.5" width="5" height="3" rx="1.5" fill={cor} />
            <rect x="22" y="18.5" width="5" height="3" rx="1.5" fill={cor} />
          </>
        )}
        {olhos === 2 && (
          <>
            <rect x="13.3" y="17.5" width="4.4" height="4.4" rx="1" fill={cor} />
            <rect x="22.3" y="17.5" width="4.4" height="4.4" rx="1" fill={cor} />
          </>
        )}
        {olhos === 3 && (
          <>
            <path d="M13 21 Q15.5 17 18 21" stroke={cor} strokeWidth="1.8" fill="none" strokeLinecap="round" />
            <path d="M22 21 Q24.5 17 27 21" stroke={cor} strokeWidth="1.8" fill="none" strokeLinecap="round" />
          </>
        )}
        {/* boca */}
        {boca === 0 && <path d="M16 26.5 Q20 29.5 24 26.5" stroke={cor} strokeWidth="1.6" fill="none" strokeLinecap="round" />}
        {boca === 1 && <line x1="16.5" y1="27" x2="23.5" y2="27" stroke={cor} strokeWidth="1.6" strokeLinecap="round" />}
        {boca === 2 && <rect x="16.5" y="25.5" width="7" height="3" rx="1.2" fill="none" stroke={cor} strokeWidth="1.4" />}
      </svg>
      {status && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-surface-1">
          <StatusDot status={status} pulsar={status === "trabalhando"} className="h-2 w-2" />
        </span>
      )}
    </span>
  );
}
