import { FolderGit2, ChevronsUpDown } from "lucide-react";
import { PROJETO_TODOS } from "../api/stream";
import { useContextoPainel } from "../context/ContextoPainel";
import { SeletorWorkspace } from "./SeletorWorkspace";

/** Seletor de dois níveis: Workspace › Squad. Com um Workspace só, mostra apenas o squad. */
export function SeletorProjeto() {
  const { workspaces, telaWorkspaces: telaTodos, predio } = useContextoPainel();
  const telaWorkspaces = telaTodos || predio;
  return (
    <div className="space-y-3">
      {(workspaces.length > 1 || telaWorkspaces) && <SeletorWorkspace />}
      {!telaWorkspaces && <SeletorSquad />}
    </div>
  );
}

function SeletorSquad() {
  const { projetos, projeto, projetoExibido, setProjeto, projetosCarregando, geral } = useContextoPainel();
  const valor = geral ? PROJETO_TODOS : (projeto ?? projetoExibido ?? "");
  return (
    <label className="block">
      <span className="mb-1.5 block px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-texto-fraco">Squad</span>
      <span className="relative block">
        <FolderGit2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-fraco" aria-hidden="true" />
        <select
          aria-label="Projeto"
          value={valor}
          disabled={projetosCarregando || projetos.length === 0}
          onChange={(e) => setProjeto(e.target.value)}
          className="w-full appearance-none rounded-lg border border-border bg-surface-2 py-2 pl-9 pr-8 text-sm text-texto focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30 disabled:opacity-60"
        >
          {projetos.length === 0 && <option value="">{projetosCarregando ? "Carregando…" : "Nenhum projeto"}</option>}
          {geral && <option value={PROJETO_TODOS}>Todos os squads</option>}
          {projetos.map((p) => (
            <option key={p.projeto} value={p.projeto}>
              {p.projeto}
            </option>
          ))}
        </select>
        <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-texto-fraco" aria-hidden="true" />
      </span>
    </label>
  );
}
