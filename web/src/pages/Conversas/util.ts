import type { Conversa, EstadoTarefa, Mensagem } from "../../api/tipos";
import { papelDoNome } from "../../lib/formato";

export type Coluna = "assunto" | "estado" | "mensagens" | "duracao" | "inicio" | "fim";
export type Direcao = "asc" | "desc";

export const ESTADOS: ReadonlyArray<EstadoTarefa> = [
  "aberto",
  "em_andamento",
  "atrasado",
  "aguardando_revisao",
  "aprovado",
  "rejeitado",
  "concluido",
];

export function colunaValida(v: string | null): Coluna {
  return v === "assunto" || v === "estado" || v === "mensagens" || v === "duracao" || v === "inicio" || v === "fim" ? v : "fim";
}

export function ordenar(lista: Conversa[], coluna: Coluna, dir: Direcao): Conversa[] {
  const f = dir === "asc" ? 1 : -1;
  const chave = (c: Conversa): string | number => {
    switch (coluna) {
      case "assunto": return c.assunto.toLowerCase();
      case "estado": return c.estado ?? "";
      case "mensagens": return c.n_mensagens;
      case "duracao": return c.duracao_min;
      case "inicio": return Date.parse(c.inicio) || 0;
      default: return Date.parse(c.fim) || 0;
    }
  };
  return [...lista].sort((a, b) => {
    const x = chave(a);
    const y = chave(b);
    return x < y ? -f : x > y ? f : 0;
  });
}

export function ehMaster(agente: string): boolean {
  return papelDoNome(agente) === "master";
}

export interface Etapa {
  chave: "pedido" | "andamento" | "entrega" | "revisao";
  rotulo: string;
  estado: "feito" | "pendente" | "pulado";
  ts: string | null;
  /** minutos desde a etapa anterior concluída */
  delta: number | null;
  detalhe?: string;
  veredito?: "aprovado" | "rejeitado";
}

/** Resumo do ciclo: Pedido → Andamento(s) → Entrega → Revisão/Veredito. */
export function etapasDoCiclo(msgs: Mensagem[]): Etapa[] {
  const raiz = msgs[0];
  const pedido = raiz && raiz.tipo === "pedido" ? raiz : undefined;
  const andamentos = msgs.filter((m) => m.tipo === "andamento");
  const entrega = msgs.find((m) => m.tipo === "entrega");
  const revisao = [...msgs].reverse().find((m) => m.tipo === "resposta" && m.veredito) ?? [...msgs].reverse().find((m) => m.tipo === "resposta");
  const brutas: Omit<Etapa, "delta">[] = [
    { chave: "pedido", rotulo: "Pedido", estado: pedido ? "feito" : "pulado", ts: pedido?.ts ?? null },
    {
      chave: "andamento",
      rotulo: andamentos.length > 1 ? `Andamento (${andamentos.length})` : "Andamento",
      estado: andamentos.length ? "feito" : "pendente",
      ts: andamentos[0]?.ts ?? null,
      detalhe: andamentos.length ? andamentos[andamentos.length - 1].assunto : undefined,
    },
    { chave: "entrega", rotulo: "Entrega", estado: entrega ? "feito" : "pendente", ts: entrega?.ts ?? null },
    {
      chave: "revisao",
      rotulo: revisao?.veredito === "aprovado" ? "Aprovado" : revisao?.veredito === "rejeitado" ? "Rejeitado" : revisao ? "Resposta" : "Revisão",
      estado: revisao ? "feito" : "pendente",
      ts: revisao?.ts ?? null,
      veredito: revisao?.veredito,
    },
  ];
  let anterior: string | null = null;
  return brutas.map((e) => {
    let delta: number | null = null;
    if (e.ts && anterior) delta = Math.max(0, (Date.parse(e.ts) - Date.parse(anterior)) / 60000);
    if (e.ts) anterior = e.ts;
    return { ...e, delta };
  });
}

export function minutosEntre(a: string, b: string): number {
  return Math.max(0, (Date.parse(b) - Date.parse(a)) / 60000);
}
