import clsx from "clsx";
import { ChevronsUpDown, Globe2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { WORKSPACE_TODOS } from "../api/stream";
import type { SaudeWorkspace } from "../api/tipos";
import { ROTULO_SAUDE_WORKSPACE } from "../api/workspaces";
import { useContextoPainel } from "../context/ContextoPainel";
import { ESTILO_SAUDE } from "../pages/Geral/lib";

export function pontoSaude(s: SaudeWorkspace): string {
  return s === "offline" ? "bg-zinc-500" : ESTILO_SAUDE[s].ponto;
}

/** Primeiro nível do seletor: Workspace. Lista própria (não nativa) para ter a bolinha de saúde. */
export function SeletorWorkspace() {
  const { workspaces, workspaceSelecionado, telaWorkspaces: telaTodos, predio, setWorkspace } = useContextoPainel();
  const telaWorkspaces = telaTodos || predio;
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const id = useId();

  const opcoes = [{ id: WORKSPACE_TODOS, nome: "Todos os workspaces", saude: null as SaudeWorkspace | null, online: true }].concat(
    workspaces.map((w) => ({ id: w.id, nome: w.nome, saude: w.saude as SaudeWorkspace | null, online: w.online })),
  );
  const valor = telaWorkspaces ? WORKSPACE_TODOS : (workspaceSelecionado ?? "");
  const atual = opcoes.find((o) => o.id === valor);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const abrir = () => {
    setAtivo(Math.max(0, opcoes.findIndex((o) => o.id === valor)));
    setAberto(true);
  };
  const escolher = (i: number) => {
    const o = opcoes[i];
    if (!o || !o.online) return;
    setAberto(false);
    botao.current?.focus();
    if (o.id !== valor) setWorkspace(o.id);
  };
  const aoTeclar = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setAberto(false);
      botao.current?.focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!aberto) return abrir();
      const passo = e.key === "ArrowDown" ? 1 : -1;
      let i = ativo;
      for (let k = 0; k < opcoes.length; k++) {
        i = (i + passo + opcoes.length) % opcoes.length;
        if (opcoes[i].online) break;
      }
      setAtivo(i);
    } else if ((e.key === "Enter" || e.key === " ") && aberto) {
      e.preventDefault();
      escolher(ativo);
    }
  };

  return (
    <div ref={raiz} className="relative" onKeyDown={aoTeclar}>
      <span className="mb-1.5 block px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-texto-fraco">Workspace</span>
      <button
        ref={botao}
        type="button"
        aria-label="Workspace"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={`${id}-lista`}
        onClick={() => (aberto ? setAberto(false) : abrir())}
        className="relative flex w-full items-center rounded-lg border border-border bg-surface-2 py-2 pl-9 pr-8 text-left text-sm text-texto focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
      >
        {atual?.saude ? (
          <span className={clsx("absolute left-3.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full", pontoSaude(atual.saude))} aria-hidden="true" />
        ) : (
          <Globe2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-fraco" aria-hidden="true" />
        )}
        <span className="truncate">{atual?.nome ?? valor ?? "Workspace"}</span>
        <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-texto-fraco" aria-hidden="true" />
      </button>
      {aberto && (
        <ul
          id={`${id}-lista`}
          role="listbox"
          aria-label="Workspaces"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border-light bg-surface-5 p-1 shadow-lg animate-fade-in"
        >
          {opcoes.map((o, i) => (
            <li
              key={o.id}
              role="option"
              aria-selected={o.id === valor}
              aria-disabled={!o.online || undefined}
              data-workspace={o.id}
              onMouseEnter={() => o.online && setAtivo(i)}
              onClick={() => escolher(i)}
              className={clsx(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm",
                o.online ? "cursor-pointer text-texto" : "cursor-not-allowed text-texto-fraco opacity-60",
                i === ativo && o.online && "bg-surface-3",
                o.id === valor && "font-medium text-accent-hover",
              )}
            >
              {o.saude ? (
                <span className={clsx("h-2 w-2 shrink-0 rounded-full", pontoSaude(o.saude))} title={ROTULO_SAUDE_WORKSPACE[o.saude]} aria-hidden="true" />
              ) : (
                <Globe2 className="h-3.5 w-3.5 shrink-0 text-texto-fraco" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 truncate">{o.nome}</span>
              {!o.online && <span className="shrink-0 text-[11px] uppercase tracking-wide">offline</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
