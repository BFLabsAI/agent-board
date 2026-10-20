import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MODO_FIXTURES } from "./api/cliente";
import type { FabricaFonte } from "./api/stream";
import { App } from "./App";
import { ProvedorPainel } from "./context/ContextoPainel";
import "./index.css";

async function iniciar() {
  // com VITE_FIXTURES=1 o stream também é simulado
  const fabrica: FabricaFonte | undefined = MODO_FIXTURES ? (await import("./api/fixtures")).fabricaFixtures : undefined;
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BrowserRouter>
        <ProvedorPainel fabricaStream={fabrica}>
          <App />
        </ProvedorPainel>
      </BrowserRouter>
    </StrictMode>,
  );
}

void iniciar();
