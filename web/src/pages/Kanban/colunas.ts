import type { EstadoTarefa, StatusAgente } from "../../api/tipos";

export interface ColunaTarefa {
  estado: EstadoTarefa;
  titulo: string;
  entra: string;
  sai: string;
  /** raia vermelha destacada */
  destaque?: boolean;
}

/** Regras de entrada e saída: tabela de docs/userguide/painel.md. */
export const COLUNAS_TAREFA: ColunaTarefa[] = [
  { estado: "atrasado", titulo: "Atrasado", destaque: true, entra: "O prazo venceu e ainda não chegou resposta.", sai: "Chega a resposta do destino." },
  { estado: "aberto", titulo: "Aberto", entra: "Um pedido foi enviado.", sai: "Chega um andamento ou uma resposta." },
  { estado: "em_andamento", titulo: "Em andamento", entra: "O destino mandou um andamento.", sai: "Chega a resposta." },
  { estado: "aguardando_revisao", titulo: "Aguardando revisão", entra: "Uma entrega foi enviada ao master.", sai: "O master responde com veredito." },
  { estado: "aprovado", titulo: "Aprovado", entra: "O master respondeu a entrega com veredito aprovado.", sai: "Não sai: fica aqui enquanto estiver no período escolhido." },
  { estado: "rejeitado", titulo: "Rejeitado", entra: "O master respondeu a entrega com veredito rejeitado.", sai: "Não sai: fica aqui enquanto estiver no período escolhido." },
  { estado: "concluido", titulo: "Concluído", entra: "Chegou a resposta do pedido, sem veredito.", sai: "Não sai: só aparecem as fechadas no período escolhido; o resto fica no histórico." },
];

export interface ColunaAgente {
  status: StatusAgente;
  titulo: string;
  entra: string;
  sai: string;
}

export const COLUNAS_AGENTE: ColunaAgente[] = [
  { status: "trabalhando", titulo: "Trabalhando", entra: "A tela do terminal mostra atividade em andamento.", sai: "A tela para de mudar ou pede uma resposta sua." },
  { status: "esperando", titulo: "Esperando você", entra: "O terminal está parado numa pergunta ou confirmação para o humano.", sai: "Você responde no terminal." },
  { status: "pendente", titulo: "Com pendente", entra: "Recebeu mensagem que ainda não respondeu.", sai: "Responde a todas as mensagens." },
  { status: "parado", titulo: "Parado", entra: "Terminal aberto, sem atividade e sem pendência.", sai: "Volta a trabalhar ou recebe uma mensagem." },
  { status: "offline", titulo: "Offline", entra: "O painel cadastrado não está mais aberto (ou o estado é desconhecido).", sai: "O terminal volta a abrir ou é recadastrado." },
];
