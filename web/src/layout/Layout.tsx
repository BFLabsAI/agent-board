import { Suspense, useState } from "react";
import { Outlet } from "react-router-dom";
import { Skeleton } from "../components/ui";
import { useContextoPainel } from "../context/ContextoPainel";
import { gravarLocal, lerLocal } from "../lib/armazenamento";
import { Sidebar } from "./Sidebar";

const CHAVE = "agent-board:sidebar-recolhida";

export function Layout() {
  const { tv } = useContextoPainel();
  const [recolhida, setRecolhida] = useState(() => lerLocal(CHAVE) === "1");

  const alternar = () => {
    setRecolhida((r) => {
      gravarLocal(CHAVE, r ? "0" : "1");
      return !r;
    });
  };

  return (
    <div className="flex min-h-screen bg-surface-0 text-texto">
      {!tv && <Sidebar recolhida={recolhida} onAlternar={alternar} />}
      <main className="min-w-0 flex-1 overflow-x-hidden px-10 py-8" data-modo-tv={tv || undefined}>
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
