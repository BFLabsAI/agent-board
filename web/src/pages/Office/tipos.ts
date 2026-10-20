import type { Agente, Tarefa } from "../../api/tipos";

/** Props comuns aos modos do Office (Hub, Mapa, Grade). index.tsx carrega os dados e passa para o modo ativo. */
export interface PropsModoOffice {
  agentes: Agente[];
  tarefas: Tarefa[];
  selecionado: string | null;
  aoSelecionar: (agente: string) => void;
  /** abre a gaveta do pai já rolada até o sub-agent */
  aoSelecionarSub?: (agente: string, subId: string) => void;
}
