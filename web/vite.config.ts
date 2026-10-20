import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const ALVO = "127.0.0.1:8765";

export default defineConfig({
  base: "/",
  plugins: [react()],
  build: {
    outDir: "../scripts/painel_web",
    emptyOutDir: true,
    assetsDir: "assets",
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
  },
  server: {
    proxy: {
      "/api": {
        target: `http://${ALVO}`,
        changeOrigin: true,
        headers: { Host: ALVO },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    exclude: ["e2e/**", "node_modules/**"], // e2e roda só com `npm run e2e`
    testTimeout: 15000, // a VPS roda várias suítes em paralelo; 5 s dava falso negativo
  },
});
