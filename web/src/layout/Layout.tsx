import { Suspense, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Skeleton } from "../components/ui";
import { useContextoPainel } from "../context/ContextoPainel";
import { gravarLocal, lerLocal } from "../lib/armazenamento";
import { LimiteErro } from "./LimiteErro";
import { Sidebar } from "./Sidebar";

const CHAVE = "agent-board:sidebar-recolhida";

export function Layout() {
  const { tv } = useContextoPainel();
  const { pathname } = useLocation();
  const [recolhida, setRecolhida] = useState(() => lerLocal(CHAVE) === "1");

  const alternar = () => {
    setRecolhida((r) => {
      gravarLocal(CHAVE, r ? "0" : "1");
      return !r;
    });
  };

  return (
    <div className="flex min-h-screen bg-surface-0 text-texto">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Pular para o conteúdo
      </a>
      {!tv && <Sidebar recolhida={recolhida} onAlternar={alternar} />}
      <main id="conteudo" tabIndex={-1} className="min-w-0 flex-1 overflow-x-hidden px-10 py-8" data-modo-tv={tv || undefined}>
        <LimiteErro key={pathname}>
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <Outlet />
          </Suspense>
        </LimiteErro>
      </main>
    </div>
  );
}
