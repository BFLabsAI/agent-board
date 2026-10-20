import { MODO_FIXTURES, cliente, montarUrl } from "../../api/cliente";
import { ErroApi } from "../../api/erro";
import type { Analytics, Contexto, Mensagem } from "../../api/tipos";

export type AlertaPingPong = Analytics["alertas"][number];

/**
 * Alertas de ping-pong do período (campo `alertas` de /api/estado).
 * O cliente compartilhado não expõe essa rota, então a chamada fica aqui.
 * No modo fixtures (sem /api/estado) cai nos alertas de /api/analytics.
 */
export async function buscarAlertas(c: Contexto, sinal?: AbortSignal): Promise<AlertaPingPong[]> {
  if (MODO_FIXTURES) return (await cliente.analytics(c, sinal)).alertas;
  const resp = await fetch(montarUrl("/api/estado", { projeto: c.projeto, periodo: c.periodo }), {
    signal: sinal,
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) throw new ErroApi(resp.status, resp.statusText);
  const corpo = (await resp.json()) as { alertas?: AlertaPingPong[] };
  return Array.isArray(corpo.alertas) ? corpo.alertas : [];
}

/** Mensagens mais novas primeiro, sem repetir id, limitadas a `max`. */
export function mesclarMensagens(atuais: Mensagem[], novas: Mensagem[], max = 12): Mensagem[] {
  const vistos = new Set<string>();
  const out: Mensagem[] = [];
  for (const m of [...novas, ...atuais].sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))) {
    if (vistos.has(m.id)) continue;
    vistos.add(m.id);
    out.push(m);
  }
  return out.slice(0, max);
}

const ESC = String.fromCharCode(27);
const ANSI = new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]`, "g");

/** Linhas da tela do terminal, sem sequências ANSI e sem linhas vazias nas pontas. */
export function linhasDaTela(tela: string | null | undefined): string[] {
  if (!tela) return [];
  const linhas = tela.replace(ANSI, "").replace(/\r/g, "").split("\n").map((l) => l.trimEnd());
  while (linhas.length && !linhas[linhas.length - 1].trim()) linhas.pop();
  while (linhas.length && !linhas[0].trim()) linhas.shift();
  return linhas;
}
