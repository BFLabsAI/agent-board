/**
 * Tipos do contrato da API do painel (docs/referencia/painel-api.md).
 * Mantenha 1:1 com o servidor: mudou lá, muda aqui.
 */

export type Papel = "master" | "manager" | "researcher" | (string & {});
export type StatusAgente = "trabalhando" | "esperando" | "pendente" | "parado" | "offline" | "desconhecido";
export type EstadoTarefa =
  | "aberto"
  | "em_andamento"
  | "atrasado"
  | "concluido"
  | "aguardando_revisao"
  | "aprovado"
  | "rejeitado";
export type TipoMsg = "pedido" | "andamento" | "resposta" | "entrega" | "nota" | "status" | (string & {});
export type Periodo = "hoje" | "24h" | "7d";

/** Linha do comunicacoes.jsonl, sem o campo "prev". */
export interface Mensagem {
  id: string;
  ts: string;
  de: string;
  para: string;
  tipo: TipoMsg;
  assunto?: string;
  modo?: string | null;
  /** ids separados por vírgula */
  responde_a?: string | null;
  issues?: number[];
  branch?: string;
  prazo?: string;
  veredito?: "aprovado" | "rejeitado";
}

/** Sub-agents (1.12): rodam abaixo de um agente do cadastro (o "pai"). */
export type StatusSub = "rodando" | "concluido" | "erro" | "perdido";

export interface SubAgente {
  id: string;
  /** nome do agente pai no cadastro */
  agente: string;
  tipo: string | null;
  /** texto não confiável (descrição que o pai passou) */
  descricao: string | null;
  status: StatusSub;
  fundo: boolean;
  inicio: string;
  fim: string | null;
  /** true quando o sub-agent foi visto sem o evento de início (sessão antiga): inicio é só o 1º evento visto */
  inicio_aproximado?: boolean;
  duracao_s: number | null;
  /** resumo é texto não confiável, já mascarado no servidor */
  ultima_atividade: { ts: string; ferramenta: string; resumo: string } | null;
  n_atividades: number;
  tarefa: { id: string; assunto: string } | null;
}

export interface SubAgenteResumo {
  id: string;
  tipo: string | null;
  descricao: string | null;
  status: StatusSub;
}

export interface TarefaAtual {
  id: string;
  assunto: string;
  estado: EstadoTarefa;
}

export interface StatsAgente {
  /** 14 inteiros, do mais antigo (índice 0) a hoje */
  atividade_14d: number[];
  mensagens_7d: number;
  entregas_7d: number;
  aprovadas_7d: number;
  rejeitadas_7d: number;
  tempo_resposta_p50_min: number | null;
  subagentes_7d: number;
}

export interface Agente {
  agente: string;
  papel: Papel;
  handle: string;
  harness: "cc" | "omp" | "maestri" | null;
  worktree: string | null;
  branch: string | null;
  status: StatusAgente;
  /** preview do Orca (texto não confiável) */
  tela: string | null;
  ultima_saida: string | null;
  pendentes: number;
  tarefa_atual: TarefaAtual | null;
  stats: StatsAgente;
  /** rodando + os 5 terminados mais recentes (24 h) */
  subagentes: SubAgente[];
}

export interface Tarefa {
  id: string;
  ts: string;
  tipo: "pedido" | "entrega";
  de: string;
  para: string;
  assunto: string;
  estado: EstadoTarefa;
  prazo: string | null;
  issues: number[];
  branch: string | null;
  andamento: string | null;
  andamento_ts: string | null;
  fechada_em: string | null;
  subagentes: SubAgenteResumo[];
}

export interface Conversa {
  id: string;
  assunto: string;
  tipo: TipoMsg;
  de: string;
  para: string;
  estado: EstadoTarefa | null;
  inicio: string;
  fim: string;
  duracao_min: number;
  n_mensagens: number;
  participantes: string[];
  issues: number[];
  branch: string | null;
}

export interface ConversaDetalhe {
  conversa: Conversa;
  mensagens: Mensagem[];
}

export interface Projeto {
  projeto: string;
  raiz: string;
  agentes: number;
  atual: boolean;
}

export interface Cadeia {
  linhas: number;
  integra: boolean;
  problemas: string[];
}

/** Indicadores do v1 (painel_estado.montar) mais os campos novos do v2. */
export interface Indicadores {
  mensagens: number;
  mensagens_antes: number;
  pendentes: number;
  agentes_com_pendente: number;
  atrasados: number;
  revisao: number;
  revisao_mais_antiga: string | null;
  /** O v1 devolve {media, p90}; o plano fala em p50. Tratar p50 como opcional. */
  tempo_resposta: { media: number; p50?: number; p90: number } | null;
  trabalhando: number;
  esperando: number;
  offline: number;
  abertos: number;
  entregas_periodo: number;
  subagentes_rodando: number;
}

export interface Resumo {
  projeto: string;
  versao: string;
  agora: string;
  periodo: Periodo;
  cadeia: Cadeia;
  indicadores: Indicadores;
}

export interface PaginaMensagens {
  mensagens: Mensagem[];
  mais: boolean;
}

export interface Analytics {
  heatmap: { dia: string; n: number }[];
  ultimos_30d: { dia: string; mensagens: number; entregas: number; aprovadas: number; rejeitadas: number }[];
  horas: number[];
  por_agente: {
    agente: string;
    enviadas: number;
    recebidas: number;
    entregas: number;
    aprovadas: number;
    rejeitadas: number;
    p50_min: number | null;
    p90_min: number | null;
  }[];
  tipos: { tipo: string; n: number }[];
  alertas: { de: string; para: string; n: number; janela_min: number; ate: string }[];
  subagentes: {
    por_agente: { agente: string; n: number; rodando: number; erro: number; duracao_media_s: number | null }[];
    por_tipo: { tipo: string; n: number; duracao_media_s: number | null }[];
    /** 30 dias, crescente */
    por_dia_30: { dia: string; n: number }[];
  };
}

export type ColunaWorkflow = "master" | "manager" | "researcher" | "subagente" | "issue" | "revisao" | "resultado";

export interface Workflows {
  nos: { id: string; coluna: ColunaWorkflow; rotulo: string; n: number }[];
  arestas: { de: string; para: string; n: number }[];
  comunicacao: { de: string; para: string; n: number }[];
  fluxos: { sequencia: string[]; n: number }[];
  kpis: {
    conversas: number;
    taxa_aprovacao: number | null;
    tempo_ate_entrega_p50_min: number | null;
    fluxo_mais_comum: string | null;
    msgs_por_conversa: number | null;
    subagentes: number;
  };
}

/** Eventos do /api/stream */
export interface EventoOla {
  projeto: string;
  agora: string;
}
export interface EventoPing {
  agora: string;
}
export interface EventosStream {
  ola: EventoOla;
  mensagem: Mensagem;
  agente: Agente;
  tarefa: Tarefa;
  subagente: SubAgente;
  ping: EventoPing;
}
export type NomeEvento = keyof EventosStream;

/** Filtros das rotas (todas aceitam projeto; as de período aceitam periodo). */
export interface Contexto {
  projeto?: string;
  periodo?: Periodo;
}
export interface FiltroConversas extends Contexto {
  limite?: number;
  agente?: string;
  estado?: EstadoTarefa;
  q?: string;
}
export interface FiltroSubagentes extends Contexto {
  agente?: string;
  status?: StatusSub;
  limite?: number;
}
export interface FiltroMensagens extends Contexto {
  antes?: string;
  limite?: number;
  agente?: string;
  tipo?: string;
  q?: string;
}
