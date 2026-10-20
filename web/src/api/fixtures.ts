/**
 * Dados falsos realistas para testes e para rodar o painel sem servidor:
 *   VITE_FIXTURES=1 npm run dev
 * O tempo é relativo a "agora", então "há 4 min" sempre aparece fresco.
 */
import { ErroApi } from "./erro";
import type { FonteEventos } from "./stream";
import type {
  Agente,
  Analytics,
  Conversa,
  ConversaDetalhe,
  EstadoTarefa,
  Mensagem,
  PaginaMensagens,
  Periodo,
  Projeto,
  Resumo,
  Tarefa,
  TipoMsg,
  Workflows,
} from "./tipos";

export const PROJETO_FIXTURE = "r7one";
const MIN = 60_000;

function iso(t: number): string {
  return new Date(t).toISOString();
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MASTER = "r7one-master";
export const MANAGERS = ["r7one-manager01-cc", "r7one-manager02-omp", "r7one-manager03-cc"];
export const RESEARCHER = "r7one-researcher01-cc";

interface Passo {
  /** minutos depois do início da thread */
  dt: number;
  de: string;
  para: string;
  tipo: TipoMsg;
  assunto: string;
  veredito?: "aprovado" | "rejeitado";
}
interface Thread {
  id: string;
  /** minutos atrás em que a thread começou */
  atras: number;
  de: string;
  para: string;
  assunto: string;
  issues: number[];
  branch: string | null;
  estado: EstadoTarefa;
  prazoMin?: number;
  passos: Passo[];
}

const THREADS: Thread[] = [
  {
    id: "p-0141", atras: 190, de: MASTER, para: "r7one-manager01-cc", estado: "aprovado",
    assunto: "Webhook de leads: validar assinatura X-Sinal-Signature", issues: [412], branch: "feat/webhook-assinatura",
    passos: [
      { dt: 12, de: "r7one-manager01-cc", para: MASTER, tipo: "andamento", assunto: "Lendo o handler atual e escrevendo os testes" },
      { dt: 58, de: "r7one-manager01-cc", para: MASTER, tipo: "entrega", assunto: "Assinatura HMAC validada, 14 testes verdes" },
      { dt: 71, de: MASTER, para: "r7one-manager01-cc", tipo: "resposta", assunto: "Aprovado, pode mergear", veredito: "aprovado" },
    ],
  },
  {
    id: "p-0142", atras: 150, de: MASTER, para: "r7one-manager02-omp", estado: "rejeitado",
    assunto: "Kanban: arrastar deal entre etapas sem recarregar", issues: [418, 419], branch: "feat/kanban-dnd",
    passos: [
      { dt: 9, de: "r7one-manager02-omp", para: MASTER, tipo: "andamento", assunto: "Implementando o drop otimista" },
      { dt: 62, de: "r7one-manager02-omp", para: MASTER, tipo: "entrega", assunto: "Drag and drop pronto, falta o rollback em erro" },
      { dt: 80, de: MASTER, para: "r7one-manager02-omp", tipo: "resposta", assunto: "Rejeitado: sem rollback quando a API falha", veredito: "rejeitado" },
    ],
  },
  {
    id: "p-0143", atras: 120, de: MASTER, para: "r7one-manager03-cc", estado: "aguardando_revisao",
    assunto: "Modelo de mensagem de rodapé editável por empresa", issues: [421], branch: "feat/rodape-modelo",
    passos: [
      { dt: 6, de: "r7one-manager03-cc", para: MASTER, tipo: "andamento", assunto: "Migração criada, falta o formulário" },
      { dt: 83, de: "r7one-manager03-cc", para: MASTER, tipo: "entrega", assunto: "Modelos padrão e personalizado funcionando" },
    ],
  },
  {
    id: "p-0144", atras: 95, de: MASTER, para: RESEARCHER, estado: "aprovado",
    assunto: "Levantar limites de taxa da UazAPI para campanhas", issues: [], branch: null,
    passos: [
      { dt: 20, de: RESEARCHER, para: MASTER, tipo: "andamento", assunto: "Lendo a especificação OpenAPI" },
      { dt: 44, de: RESEARCHER, para: MASTER, tipo: "entrega", assunto: "Resumo em docs/agent-board/notas/uazapi-limites.md" },
      { dt: 50, de: MASTER, para: RESEARCHER, tipo: "resposta", assunto: "Obrigado, fechado", veredito: "aprovado" },
    ],
  },
  {
    id: "p-0145", atras: 70, de: MASTER, para: "r7one-manager01-cc", estado: "em_andamento",
    assunto: "SSE no lugar de polling na tela de conversas", issues: [425], branch: "feat/sse-conversas",
    passos: [
      { dt: 7, de: "r7one-manager01-cc", para: MASTER, tipo: "andamento", assunto: "Endpoint de stream escrito, ligando no Redis" },
      { dt: 41, de: "r7one-manager01-cc", para: MASTER, tipo: "andamento", assunto: "Front consumindo o stream, falta reconexão" },
    ],
  },
  {
    id: "p-0146", atras: 45, de: MASTER, para: "r7one-manager02-omp", estado: "atrasado", prazoMin: -15,
    assunto: "Importar contatos de CSV com deduplicação por telefone", issues: [427], branch: "feat/import-csv",
    passos: [{ dt: 10, de: "r7one-manager02-omp", para: MASTER, tipo: "andamento", assunto: "Parser pronto, deduplicando" }],
  },
  {
    id: "p-0147", atras: 22, de: MASTER, para: "r7one-manager03-cc", estado: "aberto",
    assunto: "Corrigir fuso horário dos agendamentos de follow-up", issues: [430], branch: null,
    passos: [],
  },
  {
    id: "p-0148", atras: 9, de: MASTER, para: RESEARCHER, estado: "aberto",
    assunto: "Comparar bibliotecas de Sankey para o painel", issues: [], branch: null,
    passos: [],
  },
];

const NOTAS: Mensagem[] = [
  { id: "n-0021", ts: "", de: MASTER, para: MASTER, tipo: "nota", assunto: "Decisão: pessoa nunca tem 2 deals ativos" },
];

export function mensagensFixture(agora = Date.now()): Mensagem[] {
  const out: Mensagem[] = [];
  for (const t of THREADS) {
    const inicio = agora - t.atras * MIN;
    out.push({
      id: t.id, ts: iso(inicio), de: t.de, para: t.para, tipo: "pedido", assunto: t.assunto,
      issues: t.issues, ...(t.branch ? { branch: t.branch } : {}),
      ...(t.prazoMin !== undefined ? { prazo: iso(agora + t.prazoMin * MIN) } : {}),
    });
    t.passos.forEach((p, i) => {
      out.push({
        id: `${t.id}-${i + 1}`, ts: iso(inicio + p.dt * MIN), de: p.de, para: p.para, tipo: p.tipo, assunto: p.assunto,
        responde_a: i === 0 ? t.id : `${t.id}-${i}`, issues: t.issues,
        ...(p.veredito ? { veredito: p.veredito } : {}),
      });
    });
  }
  out.push({ ...NOTAS[0], ts: iso(agora - 130 * MIN) });
  return out.sort((a, b) => (a.ts < b.ts ? 1 : -1));
}

function ultimaDoThread(t: Thread, agora: number): number {
  const ult = t.passos.length ? t.passos[t.passos.length - 1].dt : 0;
  return agora - t.atras * MIN + ult * MIN;
}

export function tarefasFixture(agora = Date.now()): Tarefa[] {
  return THREADS.map((t) => {
    const inicio = agora - t.atras * MIN;
    const and = [...t.passos].reverse().find((p) => p.tipo === "andamento");
    const fechada = ["aprovado", "rejeitado", "concluido"].includes(t.estado);
    return {
      id: t.id, ts: iso(inicio), tipo: "pedido" as const, de: t.de, para: t.para, assunto: t.assunto,
      estado: t.estado, prazo: t.prazoMin !== undefined ? iso(agora + t.prazoMin * MIN) : null,
      issues: t.issues, branch: t.branch,
      andamento: and ? and.assunto : null, andamento_ts: and ? iso(inicio + and.dt * MIN) : null,
      fechada_em: fechada ? iso(ultimaDoThread(t, agora)) : null,
    };
  }).reverse();
}

export function conversasFixture(agora = Date.now()): Conversa[] {
  return THREADS.map((t) => {
    const inicio = agora - t.atras * MIN;
    const fim = ultimaDoThread(t, agora);
    const parts = Array.from(new Set([t.de, t.para, ...t.passos.flatMap((p) => [p.de, p.para])]));
    return {
      id: t.id, assunto: t.assunto, tipo: "pedido", de: t.de, para: t.para, estado: t.estado,
      inicio: iso(inicio), fim: iso(fim), duracao_min: Math.round((fim - inicio) / MIN),
      n_mensagens: 1 + t.passos.length, participantes: parts, issues: t.issues, branch: t.branch,
    };
  }).reverse();
}

const TELAS: Record<string, string | null> = {
  "r7one-master": "Revisando a entrega de rodapé: conferindo o diff de 3 arquivos...",
  "r7one-manager01-cc": "✻ Escrevendo testes do stream (reconexão com backoff)...",
  "r7one-manager02-omp": "⠹ Rodando go test ./internal/importer/...",
  "r7one-manager03-cc": "Do you want to proceed?\n❯ 1. Sim\n  2. Não",
  "r7one-researcher01-cc": null,
};

function agenteBase(
  agente: string, papel: string, harness: Agente["harness"], status: Agente["status"],
  worktree: string | null, branch: string | null, semente: number, agora: number,
): Agente {
  const rnd = mulberry32(semente);
  const atividade = Array.from({ length: 14 }, () => Math.floor(rnd() * 14));
  const tarefas = tarefasFixture(agora);
  const atual = tarefas.find(
    (t) => t.para === agente && ["aberto", "em_andamento", "atrasado"].includes(t.estado),
  );
  const entregas = 3 + Math.floor(rnd() * 5);
  const rej = Math.floor(rnd() * 2);
  return {
    agente, papel, handle: `term_${agente.replace(/[^a-z0-9]/g, "").slice(-10)}`, harness, worktree, branch, status,
    tela: TELAS[agente] ?? null,
    ultima_saida: status === "offline" ? null : iso(agora - Math.floor(rnd() * 90) * 1000),
    pendentes: status === "pendente" ? 2 : atual ? 1 : 0,
    tarefa_atual: atual ? { id: atual.id, assunto: atual.assunto, estado: atual.estado } : null,
    stats: {
      atividade_14d: atividade,
      mensagens_7d: atividade.slice(-7).reduce((a, b) => a + b, 0),
      entregas_7d: entregas, aprovadas_7d: entregas - rej, rejeitadas_7d: rej,
      tempo_resposta_p50_min: status === "offline" ? null : 3 + Math.round(rnd() * 12),
    },
  };
}

export function agentesFixture(agora = Date.now()): Agente[] {
  return [
    agenteBase(MASTER, "master", "cc", "trabalhando", "/root/r7one", "main", 1, agora),
    agenteBase("r7one-manager01-cc", "manager", "cc", "trabalhando", "/root/r7one-wt/sse", "feat/sse-conversas", 2, agora),
    agenteBase("r7one-manager02-omp", "manager", "omp", "pendente", "/root/r7one-wt/csv", "feat/import-csv", 3, agora),
    agenteBase("r7one-manager03-cc", "manager", "cc", "esperando", "/root/r7one-wt/rodape", "feat/rodape-modelo", 4, agora),
    agenteBase(RESEARCHER, "researcher", "cc", "parado", "/root/r7one-wt/pesquisa", null, 5, agora),
  ];
}

export function projetosFixture(): Projeto[] {
  return [
    { projeto: PROJETO_FIXTURE, raiz: "/root/r7one", agentes: 5, atual: true },
    { projeto: "agent-board", raiz: "/root/agent-board", agentes: 3, atual: false },
    { projeto: "r7-mentorias", raiz: "/root/r7-mentorias", agentes: 4, atual: false },
  ];
}

export function resumoFixture(periodo: Periodo = "hoje", projeto = PROJETO_FIXTURE, agora = Date.now()): Resumo {
  const ag = agentesFixture(agora);
  const tar = tarefasFixture(agora);
  return {
    projeto, versao: "1.11.0-dev", agora: iso(agora), periodo,
    cadeia: { linhas: 1284, integra: true, problemas: [] },
    indicadores: {
      mensagens: 31, mensagens_antes: 24, pendentes: 3, agentes_com_pendente: 2,
      atrasados: tar.filter((t) => t.estado === "atrasado").length,
      revisao: tar.filter((t) => t.estado === "aguardando_revisao").length,
      revisao_mais_antiga: iso(agora - 37 * MIN),
      tempo_resposta: { media: 6.4, p50: 4.2, p90: 14.8 },
      trabalhando: ag.filter((a) => a.status === "trabalhando").length,
      esperando: ag.filter((a) => a.status === "esperando").length,
      offline: ag.filter((a) => a.status === "offline").length,
      abertos: tar.filter((t) => ["aberto", "em_andamento", "atrasado"].includes(t.estado)).length,
      entregas_periodo: 5,
    },
  };
}

export function analyticsFixture(agora = Date.now()): Analytics {
  const rnd = mulberry32(42);
  const heatmap = Array.from({ length: 371 }, (_, i) => {
    const d = new Date(agora - (370 - i) * 86_400_000);
    const util = d.getUTCDay() % 6 !== 0;
    return { dia: d.toISOString().slice(0, 10), n: util ? Math.floor(rnd() * 40) : Math.floor(rnd() * 8) };
  });
  const ult = heatmap.slice(-30).map((h) => {
    const entregas = Math.floor(h.n / 8);
    const rej = rnd() < 0.2 ? 1 : 0;
    return { dia: h.dia, mensagens: h.n, entregas, aprovadas: Math.max(0, entregas - rej), rejeitadas: rej };
  });
  const horas = Array.from({ length: 24 }, (_, h) => (h >= 8 && h <= 20 ? 10 + Math.floor(rnd() * 40) : Math.floor(rnd() * 6)));
  const por_agente = agentesFixture(agora).map((a, i) => ({
    agente: a.agente, enviadas: 60 + i * 17, recebidas: 55 + i * 9, entregas: a.papel === "manager" ? 12 + i : 0,
    aprovadas: a.papel === "manager" ? 10 + i : 0, rejeitadas: a.papel === "manager" ? 2 : 0,
    p50_min: a.papel === "master" ? 2 : 4 + i, p90_min: a.papel === "master" ? 9 : 14 + i * 3,
  }));
  return {
    heatmap, ultimos_30d: ult, horas, por_agente,
    tipos: [
      { tipo: "andamento", n: 212 }, { tipo: "pedido", n: 74 }, { tipo: "entrega", n: 61 },
      { tipo: "resposta", n: 66 }, { tipo: "nota", n: 9 },
    ],
    alertas: [{ de: MASTER, para: "r7one-manager02-omp", n: 14, janela_min: 10, ate: iso(agora - 26 * 3600_000) }],
  };
}

export function workflowsFixture(): Workflows {
  const ms = MANAGERS;
  return {
    nos: [
      { id: MASTER, coluna: "master", rotulo: "master", n: 8 },
      ...ms.map((m, i) => ({ id: m, coluna: "manager" as const, rotulo: m.replace("r7one-", ""), n: 3 - (i === 2 ? 1 : 0) })),
      { id: RESEARCHER, coluna: "researcher", rotulo: "researcher01-cc", n: 2 },
      { id: "#412", coluna: "issue", rotulo: "#412", n: 1 }, { id: "#418", coluna: "issue", rotulo: "#418", n: 1 },
      { id: "#421", coluna: "issue", rotulo: "#421", n: 1 }, { id: "#425", coluna: "issue", rotulo: "#425", n: 1 },
      { id: "revisao", coluna: "revisao", rotulo: "Revisão", n: 4 },
      { id: "aprovado", coluna: "resultado", rotulo: "Aprovado", n: 2 },
      { id: "rejeitado", coluna: "resultado", rotulo: "Rejeitado", n: 1 },
      { id: "em_aberto", coluna: "resultado", rotulo: "Em aberto", n: 3 },
    ],
    arestas: [
      { de: MASTER, para: ms[0], n: 2 }, { de: MASTER, para: ms[1], n: 2 }, { de: MASTER, para: ms[2], n: 2 },
      { de: MASTER, para: RESEARCHER, n: 2 },
      { de: ms[0], para: "#412", n: 1 }, { de: ms[1], para: "#418", n: 1 }, { de: ms[2], para: "#421", n: 1 },
      { de: ms[0], para: "#425", n: 1 },
      { de: "#412", para: "revisao", n: 1 }, { de: "#418", para: "revisao", n: 1 }, { de: "#421", para: "revisao", n: 1 },
      { de: "revisao", para: "aprovado", n: 2 }, { de: "revisao", para: "rejeitado", n: 1 },
      { de: "#425", para: "em_aberto", n: 1 },
    ],
    comunicacao: ms.map((m, i) => ({ de: MASTER, para: m, n: 12 - i * 3 }))
      .concat(ms.map((m, i) => ({ de: m, para: MASTER, n: 15 - i * 4 }))),
    fluxos: [
      { sequencia: ["pedido", "andamento", "entrega", "resposta:aprovado"], n: 9 },
      { sequencia: ["pedido", "andamento", "andamento", "entrega", "resposta:rejeitado"], n: 3 },
      { sequencia: ["pedido", "andamento"], n: 2 },
    ],
    kpis: { conversas: 14, taxa_aprovacao: 0.82, tempo_ate_entrega_p50_min: 58, fluxo_mais_comum: "pedido > andamento > entrega > resposta:aprovado", msgs_por_conversa: 4.1 },
  };
}

function periodoValido(v: unknown): Periodo {
  return v === "24h" || v === "7d" ? v : "hoje";
}

type Params = Record<string, string | number | undefined | null>;

/** Imita o servidor: mesma rota, mesmas formas de resposta. */
export function responderFixture(caminho: string, params: Params = {}): unknown {
  const agora = Date.now();
  const projeto = (params.projeto as string | undefined) || PROJETO_FIXTURE;
  if (caminho !== "/api/projetos" && !projetosFixture().some((p) => p.projeto === projeto)) {
    throw new ErroApi(404, "projeto desconhecido");
  }
  const q = String(params.q ?? "").toLowerCase();
  switch (true) {
    case caminho === "/api/projetos":
      return projetosFixture();
    case caminho === "/api/resumo":
      return resumoFixture(periodoValido(params.periodo), projeto, agora);
    case caminho === "/api/agentes":
      return agentesFixture(agora);
    case caminho === "/api/tarefas":
      return tarefasFixture(agora);
    case caminho === "/api/conversas": {
      let lista = conversasFixture(agora);
      if (params.agente) lista = lista.filter((c) => c.participantes.includes(String(params.agente)));
      if (params.estado) lista = lista.filter((c) => c.estado === params.estado);
      if (q) lista = lista.filter((c) => `${c.assunto} ${c.id} ${c.issues.join(" ")}`.toLowerCase().includes(q));
      return lista.slice(0, Number(params.limite) || 100);
    }
    case caminho.startsWith("/api/conversas/"): {
      const id = decodeURIComponent(caminho.slice("/api/conversas/".length));
      const conversa = conversasFixture(agora).find((c) => c.id === id);
      if (!conversa) throw new ErroApi(404, "conversa não encontrada");
      const mensagens = mensagensFixture(agora)
        .filter((m) => m.id === id || m.id.startsWith(`${id}-`))
        .reverse();
      const det: ConversaDetalhe = { conversa, mensagens };
      return det;
    }
    case caminho === "/api/mensagens": {
      let lista = mensagensFixture(agora);
      if (params.antes) lista = lista.filter((m) => m.ts < String(params.antes));
      if (params.agente) lista = lista.filter((m) => m.de === params.agente || m.para === params.agente);
      if (params.tipo) lista = lista.filter((m) => m.tipo === params.tipo);
      if (q) lista = lista.filter((m) => `${m.assunto ?? ""} ${m.id}`.toLowerCase().includes(q));
      const limite = Number(params.limite) || 100;
      const pag: PaginaMensagens = { mensagens: lista.slice(0, limite), mais: lista.length > limite };
      return pag;
    }
    case caminho === "/api/analytics":
      return analyticsFixture(agora);
    case caminho === "/api/workflows":
      return workflowsFixture();
    default:
      throw new ErroApi(404, "rota desconhecida");
  }
}

/**
 * EventSource falso para o modo fixtures: conecta, manda "ola" e, de tempos
 * em tempos, uma mensagem nova e uma atualização de agente.
 */
export function fabricaFixtures(): FonteEventos {
  const ouvintes = new Map<string, Array<(ev: MessageEvent) => void>>();
  let n = 0;
  const emitir = (tipo: string, dado: unknown) =>
    ouvintes.get(tipo)?.forEach((f) => f({ data: JSON.stringify(dado) } as MessageEvent));
  const fonte: FonteEventos = {
    onopen: null,
    onerror: null,
    addEventListener(tipo, fn) {
      ouvintes.set(tipo, [...(ouvintes.get(tipo) ?? []), fn]);
    },
    close() {
      clearInterval(timer);
    },
  };
  const timer = setInterval(() => {
    n += 1;
    const agora = Date.now();
    emitir("ping", { agora: iso(agora) });
    if (n % 3 === 0) {
      const alvo = MANAGERS[n % MANAGERS.length];
      emitir("mensagem", {
        id: `live-${n}`, ts: iso(agora), de: alvo, para: MASTER, tipo: "andamento",
        assunto: "Atualização simulada (fixtures)", responde_a: "p-0145",
      } satisfies Mensagem);
    }
  }, 5000);
  setTimeout(() => {
    fonte.onopen?.(new Event("open"));
    emitir("ola", { projeto: PROJETO_FIXTURE, agora: iso(Date.now()) });
  }, 300);
  return fonte;
}
