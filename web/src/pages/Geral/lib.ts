import type { Agente, MensagemSquad, SaudeSquad, Squad, StatusAgente, SubAgente, TotaisGeral } from "../../api/tipos";

/** Cor do anel do avatar por status do agente. */
export const HEX_STATUS: Record<StatusAgente, string> = {
  trabalhando: "#34d399",
  esperando: "#fbbf24",
  pendente: "#fb923c",
  parado: "#94a3b8",
  offline: "#64748b",
  desconhecido: "#475569",
};

export const ESTILO_SAUDE: Record<SaudeSquad, { rotulo: string; texto: string; fundo: string; borda: string; ponto: string; barra: string }> = {
  ok: { rotulo: "Saudável", texto: "text-emerald-300", fundo: "bg-emerald-500/10", borda: "border-emerald-500/30", ponto: "bg-emerald-400", barra: "bg-emerald-400/70" },
  atencao: { rotulo: "Atenção", texto: "text-amber-300", fundo: "bg-amber-500/10", borda: "border-amber-500/30", ponto: "bg-amber-400", barra: "bg-amber-400/80" },
  critico: { rotulo: "Crítico", texto: "text-red-300", fundo: "bg-red-500/10", borda: "border-red-500/30", ponto: "bg-red-400", barra: "bg-red-400/80" },
};

/** Por que o squad tem esta saúde (vira o tooltip do selo). Só texto. */
export function motivosSaude(s: Squad): string[] {
  const m: string[] = [];
  const i = s.indicadores;
  if (s.erro) m.push("Projeto com erro de leitura");
  if (!s.cadeia_integra) m.push("Cadeia de mensagens quebrada");
  if (i.atrasados > 0) m.push(`${i.atrasados} ${i.atrasados === 1 ? "pedido atrasado" : "pedidos atrasados"}`);
  if (i.esperando > 0) m.push(`${i.esperando} ${i.esperando === 1 ? "agente esperando" : "agentes esperando"} você`);
  if (i.pendentes > 0) m.push(`${i.pendentes} ${i.pendentes === 1 ? "mensagem pendente" : "mensagens pendentes"}`);
  const pingPong = s.alertas - (i.atrasados > 0 ? i.atrasados : 0) - (s.cadeia_integra ? 0 : 1);
  if (pingPong > 0) m.push("Ping-pong entre agentes");
  if (m.length === 0) m.push("Sem alertas");
  return m;
}

/** Totais recalculados a partir dos agentes em tela, para os status mudarem ao vivo. */
export function totaisVivos(squads: Squad[]): TotaisGeral {
  const t: TotaisGeral = { squads: squads.length, agentes: 0, trabalhando: 0, esperando: 0, subagentes_rodando: 0, abertos: 0, atrasados: 0, revisao: 0, mensagens: 0 };
  for (const s of squads) {
    t.agentes += s.agentes.length;
    t.trabalhando += s.agentes.filter((a) => a.status === "trabalhando").length;
    t.esperando += s.agentes.filter((a) => a.status === "esperando").length;
    t.subagentes_rodando += subsRodando(s.agentes);
    t.abertos += s.indicadores.abertos;
    t.atrasados += s.indicadores.atrasados;
    t.revisao += s.indicadores.revisao;
    t.mensagens += s.indicadores.mensagens;
  }
  return t;
}

export function subsRodando(agentes: Agente[]): number {
  return agentes.reduce((n, a) => n + (a.subagentes ?? []).filter((x) => x.status === "rodando").length, 0);
}

/** Evento `agente` do stream: troca o agente certo do squad certo, mantendo os sub-agents se o evento vier sem eles. */
export function aplicarAgente(squads: Squad[], projeto: string, a: Agente): Squad[] {
  return squads.map((s) => {
    if (s.projeto !== projeto) return s;
    const antes = s.agentes.find((x) => x.agente === a.agente);
    const novo = { ...a, subagentes: a.subagentes ?? antes?.subagentes ?? [] };
    return { ...s, agentes: antes ? s.agentes.map((x) => (x.agente === a.agente ? novo : x)) : [...s.agentes, novo] };
  });
}

/** Evento `subagente` do stream: atualiza a lista do agente pai. */
export function aplicarSub(squads: Squad[], projeto: string, sub: SubAgente): Squad[] {
  return squads.map((s) => {
    if (s.projeto !== projeto) return s;
    return {
      ...s,
      agentes: s.agentes.map((a) => {
        if (a.agente !== sub.agente) return a;
        const lista = a.subagentes ?? [];
        return { ...a, subagentes: lista.some((x) => x.id === sub.id) ? lista.map((x) => (x.id === sub.id ? sub : x)) : [sub, ...lista] };
      }),
    };
  });
}

/** Evento `mensagem`: conta a mensagem e vira a "última" do squad. */
export function aplicarMensagem(squads: Squad[], m: MensagemSquad): Squad[] {
  return squads.map((s) => {
    if (s.projeto !== m.projeto) return s;
    const ult = s.ultima_mensagem;
    return {
      ...s,
      indicadores: { ...s.indicadores, mensagens: s.indicadores.mensagens + 1 },
      ultima_mensagem: !ult || m.ts >= ult.ts ? m : ult,
    };
  });
}

export function chaveMsg(m: MensagemSquad): string {
  return `${m.projeto}/${m.id}`;
}

/** Mais novas primeiro, sem repetir (projeto, id). */
export function mesclarFeed(atuais: MensagemSquad[], novas: MensagemSquad[]): MensagemSquad[] {
  const vistos = new Set<string>();
  const out: MensagemSquad[] = [];
  for (const m of [...novas, ...atuais].sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))) {
    const k = chaveMsg(m);
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(m);
  }
  return out;
}

/** Cor do chip do squad: estável pelo nome. Classes literais para o Tailwind enxergar. */
const PALETA_SQUAD = [
  { chip: "border-sky-500/30 bg-sky-500/10 text-sky-300", ponto: "bg-sky-400" },
  { chip: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300", ponto: "bg-fuchsia-400" },
  { chip: "border-teal-500/30 bg-teal-500/10 text-teal-300", ponto: "bg-teal-400" },
  { chip: "border-orange-500/30 bg-orange-500/10 text-orange-300", ponto: "bg-orange-400" },
  { chip: "border-violet-500/30 bg-violet-500/10 text-violet-300", ponto: "bg-violet-400" },
  { chip: "border-lime-500/30 bg-lime-500/10 text-lime-300", ponto: "bg-lime-400" },
  { chip: "border-rose-500/30 bg-rose-500/10 text-rose-300", ponto: "bg-rose-400" },
  { chip: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300", ponto: "bg-cyan-400" },
] as const;

function hash(t: string): number {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function corSquad(projeto: string): { chip: string; ponto: string } {
  return PALETA_SQUAD[hash(projeto) % PALETA_SQUAD.length];
}
