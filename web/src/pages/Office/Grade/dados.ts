import type { Agente, StatusAgente } from "../../../api/tipos";

export const HEX_STATUS: Record<StatusAgente, string> = {
  trabalhando: "#34d399",
  esperando: "#fbbf24",
  pendente: "#fb923c",
  parado: "#94a3b8",
  offline: "#64748b",
  desconhecido: "#475569",
};

export type FiltroStatus = "todos" | StatusAgente;
export type Ordem = "status" | "nome" | "atividade";

const PESO_STATUS: Record<StatusAgente, number> = { trabalhando: 0, esperando: 1, pendente: 2, parado: 3, offline: 4, desconhecido: 5 };

export const somaAtividade = (a: Agente): number => a.stats.atividade_14d.reduce((s, n) => s + n, 0);

/** aprovadas / (aprovadas + rejeitadas); nulo sem nenhum veredito. */
export function taxaAprovacao(a: Agente): number | null {
  const total = a.stats.aprovadas_7d + a.stats.rejeitadas_7d;
  return total > 0 ? a.stats.aprovadas_7d / total : null;
}

export function ordenar(lista: Agente[], ordem: Ordem): Agente[] {
  const nome = (a: Agente, b: Agente) => a.agente.localeCompare(b.agente, "pt-BR");
  return [...lista].sort((a, b) => {
    if (ordem === "nome") return nome(a, b);
    if (ordem === "atividade") return somaAtividade(b) - somaAtividade(a) || nome(a, b);
    return PESO_STATUS[a.status] - PESO_STATUS[b.status] || nome(a, b);
  });
}

export interface ResumoGrade {
  total: number;
  online: number;
  trabalhando: number;
  atencao: number;
  inativos: number;
  mensagensHoje: number;
  porStatus: Record<StatusAgente, number>;
}

export function resumir(agentes: Agente[]): ResumoGrade {
  const porStatus: Record<StatusAgente, number> = { trabalhando: 0, esperando: 0, pendente: 0, parado: 0, offline: 0, desconhecido: 0 };
  let mensagensHoje = 0;
  for (const a of agentes) {
    porStatus[a.status] = (porStatus[a.status] ?? 0) + 1;
    mensagensHoje += a.stats.atividade_14d[a.stats.atividade_14d.length - 1] ?? 0;
  }
  const inativos = porStatus.offline + porStatus.desconhecido;
  return {
    total: agentes.length,
    online: agentes.length - inativos,
    trabalhando: porStatus.trabalhando,
    atencao: porStatus.esperando + porStatus.pendente,
    inativos,
    mensagensHoje,
    porStatus,
  };
}
