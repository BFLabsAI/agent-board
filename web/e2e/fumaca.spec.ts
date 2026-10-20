/**
 * Fumaça do painel v2: sobe o servidor Python de verdade com um projeto temporário,
 * abre cada rota, exige zero erro de console e zero resposta 4xx/5xx, e confere que
 * uma mensagem gravada no log chega na tela por SSE, sem recarregar a página.
 *
 *   npm run e2e        (faz o build antes)
 *
 * Não roda no `npm test`. Variáveis: PW_CHROMIUM_PATH (navegador), PAINEL_PYTHON (python3).
 * Nunca toca o cadastro real: usa um AGENT_BOARD_HOME temporário e um orca falso.
 */
import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ_REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPTS = join(RAIZ_REPO, "scripts");
const PY = process.env.PAINEL_PYTHON ?? "python3";
const PROJETO = "qa-fumaca";
const MASTER = "qa-master";
const G1 = "qa-manager01-cc";
const G2 = "qa-manager02-omp";

let tmp = "";
let raizProj = "";
let home = "";
let porta = 0;
let base = "";
let servidor: ChildProcess | null = null;

function portaLivre(): Promise<number> {
  return new Promise((ok, falha) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => ok(p));
    });
    s.on("error", falha);
  });
}

/** Grava uma linha no log do projeto temporário pela mesma função que os hooks usam. */
function gravar(linha: Record<string, unknown>): void {
  const codigo = `
import json, sys, datetime
sys.path.insert(0, ${JSON.stringify(SCRIPTS)})
import registro
d = json.loads(sys.argv[2])
d.setdefault("ts", datetime.datetime.now(datetime.timezone.utc).astimezone().isoformat(timespec="seconds"))
registro.gravar_log(sys.argv[1], d)
`;
  execFileSync(PY, ["-c", codigo, raizProj, JSON.stringify(linha)], { env: { ...process.env, AGENT_BOARD_HOME: home } });
}

async function subir(): Promise<void> {
  servidor = spawn(PY, [join(SCRIPTS, "painel.py"), "servir", "--porta", String(porta), "--raiz", raizProj], {
    env: { ...process.env, AGENT_BOARD_HOME: home, ORCA_BIN: join(tmp, "orca-falso") },
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/api/projetos`)).ok) return;
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("servidor do painel não respondeu em 10 s");
}

test.beforeAll(async () => {
  expect(existsSync(join(SCRIPTS, "painel_web", "index.html")), "rode `npm run build` antes (o `npm run e2e` já faz)").toBe(true);
  tmp = mkdtempSync(join(tmpdir(), "painel-e2e-"));
  raizProj = join(tmp, "projeto");
  home = join(tmp, "home");
  mkdirSync(join(raizProj, "docs", "agent-board"), { recursive: true });
  mkdirSync(home, { recursive: true });
  const cfg = JSON.parse(readFileSync(join(RAIZ_REPO, "templates", "agent-board.json"), "utf8"));
  cfg.projeto = PROJETO;
  cfg.prefixo = "qa";
  writeFileSync(join(raizProj, "docs", "agent-board", "agent-board.json"), JSON.stringify(cfg, null, 2));
  const cad = (agente: string, papel: string) => ({ projeto: PROJETO, agente, papel, raiz: raizProj, cadastrado_em: "2026-10-01T00:00:00+00:00" });
  writeFileSync(
    join(home, "paineis.json"),
    JSON.stringify({ versao: 1, paineis: { term_m: cad(MASTER, "master"), term_g1: cad(G1, "manager"), term_g2: cad(G2, "manager") } }),
  );
  // orca falso: três terminais abertos, um com spinner (trabalhando)
  const terminais = [
    { handle: "term_m", title: "✳ claude", preview: "❯ ", lastOutputAt: null, agentIdentity: "claude" },
    { handle: "term_g1", title: "⠙ claude", preview: "trabalhando...", lastOutputAt: null, agentIdentity: "claude" },
    { handle: "term_g2", title: "omp", preview: "> ", lastOutputAt: null, agentIdentity: "omp" },
  ];
  writeFileSync(join(tmp, "terminais.json"), JSON.stringify({ result: { terminals: terminais } }));
  const orca = join(tmp, "orca-falso");
  writeFileSync(orca, `#!/bin/sh\ncat ${join(tmp, "terminais.json")}\n`);
  chmodSync(orca, 0o755);

  porta = await portaLivre();
  base = `http://127.0.0.1:${porta}`;
  // histórico inicial: um ciclo completo aprovado
  gravar({ id: "c-seed-1", de: MASTER, para: G1, tipo: "pedido", assunto: "#801 Ciclo semente", issues: [801] });
  gravar({ id: "e-seed-1", de: G1, para: MASTER, tipo: "entrega", assunto: "#801 entregue", issues: [801], branch: "ab/qa-manager01-cc", responde_a: "c-seed-1" });
  gravar({ id: "r-seed-1", de: MASTER, para: G1, tipo: "resposta", assunto: "#801 aprovado", responde_a: "e-seed-1", veredito: "aprovado" });
  await subir();
});

test.afterAll(() => {
  servidor?.kill("SIGTERM");
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

/** Coleta erros de console, erros de página e respostas 4xx/5xx de uma página. */
function vigiar(page: Page): string[] {
  const erros: string[] = [];
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error") erros.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 400) erros.push(`HTTP ${r.status()} ${r.url()}`);
  });
  return erros;
}

const ROTAS: { caminho: string; texto: RegExp }[] = [
  { caminho: "/", texto: /Dashboard/ },
  { caminho: "/kanban", texto: /Kanban/ },
  { caminho: "/conversas", texto: /Conversas/ },
  { caminho: "/conversas/c-seed-1", texto: /Ciclo semente/ },
  { caminho: "/feed", texto: /Activity Feed/ },
  { caminho: "/analytics", texto: /Analytics/ },
  { caminho: "/workflows", texto: /Workflows/ },
  { caminho: "/office", texto: /Office/ },
  { caminho: "/office?modo=mapa", texto: /Office/ },
  { caminho: "/office?modo=grade", texto: /Office/ },
  { caminho: "/office?tv=1", texto: /Sair do modo TV/ },
];

for (const { caminho, texto } of ROTAS) {
  test(`rota ${caminho} abre sem erro de console nem 4xx/5xx`, async ({ page }) => {
    const erros = vigiar(page);
    const sep = caminho.includes("?") ? "&" : "?";
    await page.goto(`${base}${caminho}${sep}projeto=${PROJETO}&periodo=7d`);
    await expect(page.getByText(texto).first()).toBeVisible();
    await page.waitForTimeout(800); // deixa as chamadas REST e o SSE assentarem
    expect(erros).toEqual([]);
  });
}

test("navegação pela sidebar percorre as 7 telas", async ({ page }) => {
  const erros = vigiar(page);
  await page.goto(`${base}/?projeto=${PROJETO}`);
  for (const nome of ["Kanban", "Conversas", "Activity Feed", "Analytics", "Workflows", "Office", "Dashboard"]) {
    await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: nome }).click();
    await expect(page.getByRole("heading", { name: nome === "Dashboard" ? /Dashboard/ : new RegExp(nome) }).first()).toBeVisible();
  }
  expect(erros).toEqual([]);
});

test("mensagem gravada no log chega por SSE em Dashboard, Kanban, Feed, Conversas e Office, sem recarregar", async ({ context }) => {
  const telas: Record<string, string> = {
    dash: "/",
    kanban: "/kanban",
    feed: "/feed",
    conversas: "/conversas",
    office: "/office",
  };
  const paginas: Record<string, Page> = {};
  const erros: string[] = [];
  for (const [nome, caminho] of Object.entries(telas)) {
    const p = await context.newPage();
    p.on("pageerror", (e) => erros.push(`${nome} pageerror: ${e.message}`));
    await p.goto(`${base}${caminho}?projeto=${PROJETO}&periodo=24h`);
    await p.evaluate(() => {
      (window as unknown as { __marca: number }).__marca = 1;
    });
    paginas[nome] = p;
  }
  await expect(paginas.dash.getByText("Live", { exact: true })).toBeVisible();

  // 1) pedido novo: Feed, Conversas e Kanban mostram o assunto; Dashboard conta 1 pedido aberto
  gravar({ id: "c-live-1", de: MASTER, para: G2, tipo: "pedido", assunto: "#802 Pedido ao vivo", issues: [802] });
  await expect(paginas.feed.getByText("#802 Pedido ao vivo").first()).toBeVisible({ timeout: 10_000 });
  await expect(paginas.conversas.getByText("#802 Pedido ao vivo").first()).toBeVisible({ timeout: 10_000 });
  await expect(paginas.kanban.getByText("#802 Pedido ao vivo").first()).toBeVisible({ timeout: 10_000 });
  await expect(paginas.dash.getByText("#802 Pedido ao vivo").first()).toBeVisible({ timeout: 10_000 });

  // 2) entrega: o card do pedido sai do trilho e a entrega entra em "Aguardando revisão"
  gravar({ id: "e-live-1", de: G2, para: MASTER, tipo: "entrega", assunto: "#802 entregue", issues: [802], branch: "ab/qa-manager02-omp", responde_a: "c-live-1" });
  const coluna = paginas.kanban.locator("section", { has: paginas.kanban.getByText("Aguardando revisão", { exact: false }) }).first();
  await expect(coluna.getByText("#802 entregue")).toBeVisible({ timeout: 10_000 });

  // 3) veredito: a entrega muda de coluna (Aprovado), sem reload
  gravar({ id: "r-live-1", de: MASTER, para: G2, tipo: "resposta", assunto: "#802 aprovado", responde_a: "e-live-1", veredito: "aprovado" });
  const aprovado = paginas.kanban.locator("section", { has: paginas.kanban.getByText("Aprovado", { exact: true }) }).first();
  await expect(aprovado.getByText("#802 entregue")).toBeVisible({ timeout: 10_000 });

  // 4) Office: o contador do Live Logs sobe com a mensagem nova (o pulso é desenhado no mesmo evento)
  await paginas.office.getByRole("button", { name: /Live Logs/ }).click();
  await expect(paginas.office.getByText("#802 aprovado").first()).toBeVisible({ timeout: 10_000 });

  for (const [nome, p] of Object.entries(paginas)) {
    const intacta = await p.evaluate(() => (window as unknown as { __marca?: number }).__marca === 1);
    expect(intacta, `${nome} recarregou a página`).toBe(true);
  }
  expect(erros).toEqual([]);
});

test("SSE reconecta depois que o servidor cai e volta", async ({ page }) => {
  await page.goto(`${base}/feed?projeto=${PROJETO}&periodo=24h`);
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  servidor?.kill("SIGTERM");
  await expect(page.getByText("Offline", { exact: true })).toBeVisible({ timeout: 20_000 });
  await subir();
  gravar({ id: "c-live-2", de: MASTER, para: G1, tipo: "pedido", assunto: "#803 Depois da reconexão", issues: [803] });
  await expect(page.getByText("#803 Depois da reconexão").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
});
