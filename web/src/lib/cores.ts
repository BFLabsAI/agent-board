import type { EstadoTarefa, Mensagem, Papel, StatusAgente } from "../api/tipos";

/** Cada entrada usa classes literais para o Tailwind enxergar no build. */
export interface Estilo {
  rotulo: string;
  texto: string;
  fundo: string;
  borda: string;
  ponto: string;
}

export const ESTILO_STATUS_AGENTE: Record<StatusAgente, Estilo> = {
  trabalhando: { rotulo: "Trabalhando", texto: "text-status-trabalhando", fundo: "bg-status-trabalhando/10", borda: "border-status-trabalhando/30", ponto: "bg-status-trabalhando" },
  esperando: { rotulo: "Esperando você", texto: "text-status-esperando", fundo: "bg-status-esperando/10", borda: "border-status-esperando/30", ponto: "bg-status-esperando" },
  pendente: { rotulo: "Com pendente", texto: "text-status-pendente", fundo: "bg-status-pendente/10", borda: "border-status-pendente/30", ponto: "bg-status-pendente" },
  parado: { rotulo: "Parado", texto: "text-status-parado", fundo: "bg-status-parado/10", borda: "border-status-parado/30", ponto: "bg-status-parado" },
  offline: { rotulo: "Offline", texto: "text-status-offline", fundo: "bg-status-offline/10", borda: "border-status-offline/30", ponto: "bg-status-offline" },
  desconhecido: { rotulo: "Desconhecido", texto: "text-status-desconhecido", fundo: "bg-status-desconhecido/10", borda: "border-status-desconhecido/30", ponto: "bg-status-desconhecido" },
};

export const ESTILO_ESTADO_TAREFA: Record<EstadoTarefa, Estilo> = {
  aberto: { rotulo: "Aberto", texto: "text-tarefa-aberto", fundo: "bg-tarefa-aberto/10", borda: "border-tarefa-aberto/30", ponto: "bg-tarefa-aberto" },
  em_andamento: { rotulo: "Em andamento", texto: "text-tarefa-em_andamento", fundo: "bg-tarefa-em_andamento/10", borda: "border-tarefa-em_andamento/30", ponto: "bg-tarefa-em_andamento" },
  atrasado: { rotulo: "Atrasado", texto: "text-tarefa-atrasado", fundo: "bg-tarefa-atrasado/10", borda: "border-tarefa-atrasado/30", ponto: "bg-tarefa-atrasado" },
  concluido: { rotulo: "Concluído", texto: "text-tarefa-concluido", fundo: "bg-tarefa-concluido/10", borda: "border-tarefa-concluido/30", ponto: "bg-tarefa-concluido" },
  aguardando_revisao: { rotulo: "Aguardando revisão", texto: "text-tarefa-aguardando_revisao", fundo: "bg-tarefa-aguardando_revisao/10", borda: "border-tarefa-aguardando_revisao/30", ponto: "bg-tarefa-aguardando_revisao" },
  aprovado: { rotulo: "Aprovado", texto: "text-tarefa-aprovado", fundo: "bg-tarefa-aprovado/10", borda: "border-tarefa-aprovado/30", ponto: "bg-tarefa-aprovado" },
  rejeitado: { rotulo: "Rejeitado", texto: "text-tarefa-rejeitado", fundo: "bg-tarefa-rejeitado/10", borda: "border-tarefa-rejeitado/30", ponto: "bg-tarefa-rejeitado" },
};

const NEUTRO: Estilo = { rotulo: "—", texto: "text-gray-400", fundo: "bg-gray-500/10", borda: "border-gray-500/30", ponto: "bg-gray-400" };

export function estiloStatus(status: string): Estilo {
  return (
    (ESTILO_STATUS_AGENTE as Record<string, Estilo>)[status] ??
    (ESTILO_ESTADO_TAREFA as Record<string, Estilo>)[status] ?? { ...NEUTRO, rotulo: status }
  );
}

export type ChaveTipoMsg = "pedido" | "andamento" | "entrega" | "resposta" | "rejeicao" | "nota";

export const ESTILO_TIPO_MSG: Record<ChaveTipoMsg, Estilo & { hex: string }> = {
  pedido: { rotulo: "Pedido", texto: "text-msg-pedido", fundo: "bg-msg-pedido/10", borda: "border-msg-pedido/30", ponto: "bg-msg-pedido", hex: "#60a5fa" },
  andamento: { rotulo: "Andamento", texto: "text-msg-andamento", fundo: "bg-msg-andamento/10", borda: "border-msg-andamento/30", ponto: "bg-msg-andamento", hex: "#a78bfa" },
  entrega: { rotulo: "Entrega", texto: "text-msg-entrega", fundo: "bg-msg-entrega/10", borda: "border-msg-entrega/30", ponto: "bg-msg-entrega", hex: "#34d399" },
  resposta: { rotulo: "Resposta", texto: "text-msg-resposta", fundo: "bg-msg-resposta/10", borda: "border-msg-resposta/30", ponto: "bg-msg-resposta", hex: "#2dd4bf" },
  rejeicao: { rotulo: "Rejeição", texto: "text-msg-rejeicao", fundo: "bg-msg-rejeicao/10", borda: "border-msg-rejeicao/30", ponto: "bg-msg-rejeicao", hex: "#fb7185" },
  nota: { rotulo: "Nota", texto: "text-msg-nota", fundo: "bg-msg-nota/10", borda: "border-msg-nota/30", ponto: "bg-msg-nota", hex: "#94a3b8" },
};

/** Uma resposta com veredito "rejeitado" é pintada como rejeição. */
export function chaveTipoMsg(m: Pick<Mensagem, "tipo" | "veredito">): ChaveTipoMsg {
  if (m.tipo === "resposta" && m.veredito === "rejeitado") return "rejeicao";
  if (m.tipo in ESTILO_TIPO_MSG) return m.tipo as ChaveTipoMsg;
  return "nota";
}

export interface EstiloPapel {
  rotulo: string;
  hex: string;
  texto: string;
  fundo: string;
  borda: string;
}

export function estiloPapel(papel: Papel): EstiloPapel {
  switch (papel) {
    case "master":
      return { rotulo: "Master", hex: "#f59e0b", texto: "text-papel-master", fundo: "bg-papel-master/10", borda: "border-papel-master/30" };
    case "researcher":
      return { rotulo: "Researcher", hex: "#10b981", texto: "text-papel-researcher", fundo: "bg-papel-researcher/10", borda: "border-papel-researcher/30" };
    default:
      return { rotulo: papel === "manager" ? "Manager" : String(papel), hex: "#6366f1", texto: "text-papel-manager", fundo: "bg-papel-manager/10", borda: "border-papel-manager/30" };
  }
}
