import clsx from "clsx";
import { Activity, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cliente } from "../api/cliente";
import { useApi } from "../api/useApi";
import { NavLinkPainel } from "../components/LinkPainel";
import { Segmented } from "../components/ui";
import { PERIODOS, useContextoPainel } from "../context/ContextoPainel";
import { ITENS_NAV } from "../rotas";
import { IndicadorLive } from "./IndicadorLive";
import { SeletorProjeto } from "./SeletorProjeto";

export function Sidebar({ recolhida, onAlternar }: { recolhida: boolean; onAlternar: () => void }) {
  const { projetoExibido, periodo, setPeriodo } = useContextoPainel();
  const { dados: resumo } = useApi((c, s) => cliente.resumo(c, s));

  return (
    <aside
      className={clsx(
        "sticky top-0 flex h-screen shrink-0 flex-col border-r border-border bg-surface-1 transition-[width] duration-200",
        recolhida ? "w-[76px]" : "w-64",
      )}
    >
      <div className={clsx("flex items-center gap-3 border-b border-border px-4 py-5", recolhida && "justify-center px-0")}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/25 bg-accent-muted text-accent-hover">
          <Activity className="h-5 w-5" aria-hidden="true" />
        </div>
        {!recolhida && (
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold leading-tight text-texto">agent-board</div>
            <div className="truncate text-xs text-texto-suave">{projetoExibido ?? "sem projeto"}</div>
          </div>
        )}
      </div>

      {!recolhida && (
        <div className="px-3 pt-4">
          <SeletorProjeto />
        </div>
      )}

      <nav aria-label="Navegação principal" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {ITENS_NAV.map(({ caminho, rotulo, icone: Icone, exato }) => (
          <NavLinkPainel
            key={caminho}
            to={caminho}
            end={exato}
            title={recolhida ? rotulo : undefined}
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-[15px] font-medium transition-colors",
                recolhida && "justify-center px-0",
                isActive
                  ? "border-accent/25 bg-accent-muted text-accent-hover"
                  : "border-transparent text-texto-suave hover:bg-surface-3 hover:text-texto",
              )
            }
          >
            <Icone className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            {recolhida ? <span className="sr-only">{rotulo}</span> : rotulo}
          </NavLinkPainel>
        ))}
      </nav>

      <div className="space-y-3 border-t border-border p-3">
        {!recolhida && (
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-texto-fraco">Período</div>
            <Segmented
              ariaLabel="Período"
              tamanho="sm"
              cheio
              opcoes={PERIODOS}
              valor={periodo}
              onChange={setPeriodo}
            />
          </div>
        )}
        <button
          type="button"
          onClick={onAlternar}
          aria-label={recolhida ? "Expandir menu" : "Recolher menu"}
          className={clsx(
            "flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium uppercase tracking-wider text-texto-suave transition-colors hover:bg-surface-3 hover:text-texto",
            recolhida && "justify-center px-0",
          )}
        >
          {recolhida ? <PanelLeftOpen className="h-4 w-4" aria-hidden="true" /> : <PanelLeftClose className="h-4 w-4" aria-hidden="true" />}
          {!recolhida && "Recolher"}
        </button>
        <IndicadorLive versao={resumo?.versao} recolhido={recolhida} />
      </div>
    </aside>
  );
}
