import type { Analytics, Mensagem } from "../../api/tipos";

export interface Kpis {
  mensagens: number;
  mediaDia: number;
  entregas: number;
  aprovadas: number;
  rejeitadas: number;
  taxaAprovacao: number | null;
  ativos: number;
  totalAgentes: number;
}

/** `cadastrados`: nomes do cadastro (/api/agentes). Sem ele, cai para quem aparece no analytics. */
export function calcularKpis(a: Analytics, cadastrados?: string[]): Kpis {
  const dias = a.ultimos_30d;
  const soma = (f: (d: Analytics["ultimos_30d"][number]) => number) => dias.reduce((s, d) => s + f(d), 0);
  const mensagens = soma((d) => d.mensagens);
  const aprovadas = soma((d) => d.aprovadas);
  const rejeitadas = soma((d) => d.rejeitadas);
  const julgadas = aprovadas + rejeitadas;
  return {
    mensagens,
    mediaDia: dias.length ? mensagens / dias.length : 0,
    entregas: soma((d) => d.entregas),
    aprovadas,
    rejeitadas,
    taxaAprovacao: julgadas > 0 ? aprovadas / julgadas : null,
    ativos: a.por_agente.filter((p) => p.enviadas + p.recebidas > 0 && (!cadastrados || cadastrados.includes(p.agente))).length,
    totalAgentes: cadastrados ? cadastrados.length : a.por_agente.length,
  };
}

export const CEL_MIN = 10;
export const CEL_MAX = 16;
export const GAP_HEAT = 3;

export interface JanelaHeat {
  /** primeira coluna exibida (colunas anteriores ficam de fora) */
  inicio: number;
  /** quantas colunas (semanas) aparecem */
  visiveis: number;
  /** lado da célula em px, entre CEL_MIN e CEL_MAX */
  cel: number;
  /** true se mesmo com a célula mínima não cabe e precisa rolar */
  rola: boolean;
}

/**
 * Escolhe quantas semanas mostrar e o tamanho da célula para o heatmap ocupar a largura útil.
 * Parte da primeira semana com dado; se sobrar espaço com a célula máxima, mostra semanas anteriores (vazias)
 * até preencher a largura. Se não couber nem com a célula mínima, rola na horizontal.
 */
export function janelaHeatmap(celulas: CelulaHeat[], colunas: number, larguraUtil: number): JanelaHeat {
  const passoMax = CEL_MAX + GAP_HEAT;
  const passoMin = CEL_MIN + GAP_HEAT;
  const w = Math.max(larguraUtil, passoMin * 4);
  const primeira = celulas.find((c) => c.n > 0)?.col ?? colunas - 1;
  const comDado = Math.max(1, colunas - primeira);
  const cabeMax = Math.max(1, Math.floor(w / passoMax));
  const visiveis = Math.min(colunas, Math.max(comDado, cabeMax));
  const cel = Math.min(CEL_MAX, Math.max(CEL_MIN, Math.floor(w / visiveis) - GAP_HEAT));
  const rola = visiveis * (cel + GAP_HEAT) > w + 0.5;
  return { inicio: colunas - visiveis, visiveis, cel, rola };
}

/** Mediana simples; nulos ficam de fora. */
function mediana(v: Array<number | null>): number | null {
  const n = v.filter((x): x is number => x !== null).sort((x, y) => x - y);
  if (!n.length) return null;
  const m = Math.floor(n.length / 2);
  return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2;
}

/** Fallback do tempo de resposta quando o resumo não traz: mediana dos p50/p90 por agente. */
export function temposDosAgentes(a: Analytics): { p50: number | null; p90: number | null } {
  return { p50: mediana(a.por_agente.map((p) => p.p50_min)), p90: mediana(a.por_agente.map((p) => p.p90_min)) };
}

export interface CelulaHeat {
  dia: string;
  n: number;
  col: number;
  linha: number;
  nivel: 0 | 1 | 2 | 3 | 4;
}

function diaDaSemana(dia: string): number {
  return new Date(`${dia}T00:00:00Z`).getUTCDay();
}

/** Nível 0 a 4 pelo quartil do máximo (n = 0 é sempre 0). */
export function nivelHeat(n: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (n <= 0 || max <= 0) return 0;
  const f = n / max;
  if (f > 0.75) return 4;
  if (f > 0.5) return 3;
  if (f > 0.25) return 2;
  return 1;
}

/** Posiciona cada dia numa grade semanas × 7 (domingo na linha 0). */
export function montarHeatmap(h: Analytics["heatmap"]): { celulas: CelulaHeat[]; colunas: number; meses: Array<{ col: number; rotulo: string }> } {
  if (!h.length) return { celulas: [], colunas: 0, meses: [] };
  const max = h.reduce((m, d) => Math.max(m, d.n), 0);
  const inicio = diaDaSemana(h[0].dia);
  const celulas = h.map((d, i) => ({
    ...d,
    col: Math.floor((i + inicio) / 7),
    linha: (i + inicio) % 7,
    nivel: nivelHeat(d.n, max),
  }));
  const colunas = celulas[celulas.length - 1].col + 1;
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const meses: Array<{ col: number; rotulo: string }> = [];
  let ultimo = -1;
  let colUlt = -10;
  for (const c of celulas) {
    const mes = Number(c.dia.slice(5, 7)) - 1;
    if (mes !== ultimo) {
      ultimo = mes;
      // o rótulo vai na primeira coluna do mês; evita colisão com o anterior
      if (c.col - colUlt >= 3) {
        meses.push({ col: c.col, rotulo: nomes[mes] });
        colUlt = c.col;
      }
    }
  }
  return { celulas, colunas, meses };
}

function somarEm<T extends { n: number }>(lista: T[], achar: (x: T) => boolean, novo: T): T[] {
  const i = lista.findIndex(achar);
  if (i < 0) return [...lista, novo];
  return lista.map((x, j) => (j === i ? { ...x, n: x.n + 1 } : x));
}

/** Incremento otimista de uma mensagem do stream nos contadores. Não muta a entrada. */
export function aplicarMensagem(a: Analytics, m: Mensagem): Analytics {
  const dia = m.ts.slice(0, 10);
  const hora = Number(m.ts.slice(11, 13));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return a;
  const entrega = m.tipo === "entrega";
  const aprov = m.tipo === "resposta" && m.veredito === "aprovado";
  const rejei = m.tipo === "resposta" && m.veredito === "rejeitado";

  let heatmap = a.heatmap;
  if (heatmap.some((h) => h.dia === dia)) heatmap = heatmap.map((h) => (h.dia === dia ? { ...h, n: h.n + 1 } : h));
  else if (!heatmap.length || dia > heatmap[heatmap.length - 1].dia) heatmap = [...heatmap, { dia, n: 1 }];

  let ult = a.ultimos_30d;
  const delta = { mensagens: 1, entregas: +entrega, aprovadas: +aprov, rejeitadas: +rejei };
  if (ult.some((d) => d.dia === dia)) {
    ult = ult.map((d) =>
      d.dia === dia
        ? { ...d, mensagens: d.mensagens + 1, entregas: d.entregas + delta.entregas, aprovadas: d.aprovadas + delta.aprovadas, rejeitadas: d.rejeitadas + delta.rejeitadas }
        : d,
    );
  } else if (!ult.length || dia > ult[ult.length - 1].dia) {
    ult = [...ult.slice(-29), { dia, ...delta }];
  }

  const horas = hora >= 0 && hora < 24 ? a.horas.map((n, i) => (i === hora ? n + 1 : n)) : a.horas;

  const tipos = somarEm(a.tipos, (t) => t.tipo === m.tipo, { tipo: m.tipo, n: 1 });

  const por_agente = a.por_agente.map((p) => {
    if (p.agente === m.de) {
      return { ...p, enviadas: p.enviadas + 1, entregas: p.entregas + delta.entregas };
    }
    if (p.agente === m.para) {
      return { ...p, recebidas: p.recebidas + 1, aprovadas: p.aprovadas + delta.aprovadas, rejeitadas: p.rejeitadas + delta.rejeitadas };
    }
    return p;
  });

  return { ...a, heatmap, ultimos_30d: ult, horas, tipos, por_agente };
}
