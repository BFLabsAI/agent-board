import type { WorkspaceResumo, SaudeWorkspace } from "./tipos";

/** Local primeiro, depois por nome (mesma ordem do servidor). */
export function ordenarWorkspaces(lista: WorkspaceResumo[]): WorkspaceResumo[] {
  return [...lista].sort((a, b) => Number(b.local) - Number(a.local) || a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Aplica um evento `workspace` na lista (entra, sai ou muda). Quando o
 * Workspace passa a offline e o servidor não diz desde quando, guarda o
 * momento em que a queda foi vista, para a tela mostrar "offline há X".
 */
export function mesclarWorkspace(lista: WorkspaceResumo[], novo: WorkspaceResumo, agora: number = Date.now()): WorkspaceResumo[] {
  const antigo = lista.find((w) => w.id === novo.id);
  let item = novo;
  if (!novo.online) {
    const desde = novo.offline_desde ?? (antigo && !antigo.online ? antigo.offline_desde : null) ?? (antigo?.online ? new Date(agora).toISOString() : null);
    item = { ...novo, offline_desde: desde };
  }
  return ordenarWorkspaces([...lista.filter((w) => w.id !== novo.id), item]);
}

export function workspacesOnline(lista: WorkspaceResumo[]): WorkspaceResumo[] {
  return lista.filter((w) => w.online);
}

export const ROTULO_SAUDE_WORKSPACE: Record<SaudeWorkspace, string> = {
  ok: "Saudável",
  atencao: "Atenção",
  critico: "Crítico",
  offline: "Offline",
};
