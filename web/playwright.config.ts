import { defineConfig } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Chromium usado pelo e2e. Ordem: PW_CHROMIUM_PATH; o chromium do cache do Playwright
 * que estiver instalado (o da VPS é outra revisão que a do pacote); senão o padrão do pacote.
 */
function chromiumLocal(): string | undefined {
  const env = process.env.PW_CHROMIUM_PATH;
  if (env) return env;
  const cache = join(process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), ".cache", "ms-playwright"));
  if (!existsSync(cache)) return undefined;
  for (const d of readdirSync(cache).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
    const exe = join(cache, d, "chrome-linux64", "chrome");
    if (existsSync(exe)) return exe;
  }
  return undefined;
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    viewport: { width: 1280, height: 900 },
    launchOptions: { executablePath: chromiumLocal() },
  },
});
