import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cliente } from "../../api/cliente";
import { responderFixture, tarefasFixture, workspaceFixture, workspacesFixture } from "../../api/fixtures";
import { mesclarWorkspace } from "../../api/workspaces";
import { FonteFalsa, mockarCliente, mockarWorkspaces, renderPainel } from "../../test/utils";

beforeEach(() => {
  FonteFalsa.todas = [];
  mockarCliente();
  mockarWorkspaces("varios");
});
afterEach(() => vi.restoreAllMocks());

const fonteAberta = () => FonteFalsa.todas.filter((f) => !f.fechada);
const card = (id: string) => document.querySelector(`[data-testid="card-workspace"][data-workspace="${id}"]`) as HTMLElement;

async function abrir(rota = "/workspaces") {
  renderPainel(rota);
  await screen.findByRole("heading", { level: 1, name: "Workspaces" });
  await waitFor(() => expect(card("bf-labs")).not.toBeNull());
  await waitFor(() => expect(FonteFalsa.todas.some((f) => f.url === "/api/stream?workspace=*")).toBe(true));
  const f = FonteFalsa.todas.find((x) => x.url === "/api/stream?workspace=*")!;
  act(() => f.abrir());
  return f;
}

describe("tela Workspaces", () => {
  it("mostra a faixa de totais e um card por Workspace, com uma conexão de stream só", async () => {
    await abrir();
    expect(document.querySelectorAll('[data-testid="card-workspace"]')).toHaveLength(4);
    expect(screen.getByTestId("total-workspaces")).toHaveTextContent("3");
    const bf = card("bf-labs");
    expect(within(bf).getByText("BF Labs")).toBeInTheDocument();
    expect(within(bf).getByText("bf-labs")).toBeInTheDocument();
    expect(within(bf).getByTestId("selo-saude")).toHaveAttribute("data-saude", workspaceFixture("bf-labs").saude);
    expect(within(bf).getByTestId("latencia")).toHaveTextContent("38 ms");
    expect(within(bf).getAllByTestId("linha-squad").map((l) => l.getAttribute("data-squad"))).toEqual(["bf-marketing", "bf-ads", "bf-sites"]);
    expect(within(bf).getAllByText(/trabalhando/).length).toBeGreaterThan(0);
    expect(fonteAberta()).toHaveLength(1);
  });

  it("Workspace offline aparece esmaecido, com 'offline há X', sem link", async () => {
    await abrir();
    const aura = card("aura-bios");
    expect(aura).toHaveAttribute("data-online", "false");
    expect(aura.className).toContain("opacity-60");
    expect(within(aura).getByTestId("offline-info")).toHaveTextContent(/offline há 47 min/);
    expect(within(aura).getByTestId("selo-saude")).toHaveTextContent("Offline");
    expect(within(aura).queryByRole("link")).toBeNull();
  });

  it("Workspace desatualizado avisa 'atualize o agent-board'", async () => {
    await abrir();
    expect(within(card("itarget")).getByTestId("aviso-desatualizado")).toHaveTextContent("atualize o agent-board");
    expect(within(card("itarget")).getByTestId("versao")).toHaveTextContent("v1.12.0");
    expect(within(card("bf-labs")).queryByTestId("aviso-desatualizado")).toBeNull();
  });

  it("clicar no card abre a Visão geral do Workspace", async () => {
    await abrir();
    await userEvent.click(within(card("bf-labs")).getByRole("link", { name: "BF Labs" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Visão geral" })).toBeInTheDocument();
    expect(screen.getByTestId("local")).toHaveTextContent("/geral?workspace=bf-labs");
  });

  it("o evento 'workspace' atualiza o card (e um Workspace que cai vira offline)", async () => {
    const f = await abrir();
    act(() => f.emitir("workspace", { ...workspaceFixture("bf-labs"), latencia_ms: 71 }));
    await waitFor(() => expect(within(card("bf-labs")).getByTestId("latencia")).toHaveTextContent("71 ms"));
    act(() => f.emitir("workspace", { ...workspaceFixture("bf-labs"), online: false, saude: "offline", totais: null, squads: [], latencia_ms: null, erro: "timeout" }));
    await waitFor(() => expect(card("bf-labs")).toHaveAttribute("data-online", "false"));
    expect(within(card("bf-labs")).getByTestId("offline-info")).toHaveTextContent(/offline/);
    // a queda foi vista agora: "offline agora", não "há 47 min"
    expect(within(card("bf-labs")).getByTestId("offline-info")).not.toHaveTextContent("47");
    expect(screen.getByTestId("total-workspaces")).toHaveTextContent("2");
  });

  it("a mensagem de um squad pulsa o card do Workspace certo, e só ele", async () => {
    const f = await abrir();
    act(() => f.emitir("mensagem", { id: "m1", ts: new Date().toISOString(), de: "a", para: "b", tipo: "andamento", assunto: "oi", projeto: "bf-ads", workspace: "bf-labs" }));
    await waitFor(() => expect(card("bf-labs")).toHaveAttribute("data-pulsando", "true"));
    expect(card("itarget")).not.toHaveAttribute("data-pulsando");
    expect(within(card("bf-labs")).getByTestId("ao-vivo")).toHaveTextContent("+1 mensagem");
  });

  it("não executa HTML vindo da API", async () => {
    const f = await abrir();
    act(() => f.emitir("workspace", { ...workspaceFixture("itarget"), nome: "<img src=x onerror=alert(1)>" }));
    await waitFor(() => expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument());
    expect(document.querySelector("img[src='x']")).toBeNull();
  });
});

describe("mesclarWorkspace", () => {
  it("entra, atualiza e guarda desde quando ficou offline", () => {
    const base = workspacesFixture().workspaces.slice(0, 2);
    const novo = { ...workspaceFixture("itarget") };
    const com = mesclarWorkspace(base, novo);
    expect(com.map((w) => w.id)).toEqual(["r7-workspace", "bf-labs", "itarget"]);
    const agora = Date.parse("2026-10-20T12:00:00Z");
    const caiu = mesclarWorkspace(com, { ...novo, online: false, saude: "offline", totais: null }, agora);
    expect(caiu.find((w) => w.id === "itarget")!.offline_desde).toBe("2026-10-20T12:00:00.000Z");
    const de_novo = mesclarWorkspace(caiu, { ...novo, online: false, saude: "offline", totais: null }, agora + 60000);
    expect(de_novo.find((w) => w.id === "itarget")!.offline_desde).toBe("2026-10-20T12:00:00.000Z");
  });
});

describe("abertura", () => {
  it("sem workspace/projeto na URL e com mais de 1 Workspace online, cai em /workspaces", async () => {
    renderPainel("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Workspaces" })).toBeInTheDocument();
    expect(screen.getByTestId("local")).toHaveTextContent(/^\/workspaces$/);
  });

  it("com ?workspace= ou ?projeto= na URL, não redireciona", async () => {
    renderPainel("/?projeto=r7one");
    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByTestId("local")).toHaveTextContent("/?projeto=r7one");
  });

  it("com 1 Workspace só, mantém o comportamento de antes (Visão geral quando há vários squads)", async () => {
    mockarWorkspaces("um");
    renderPainel("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Visão geral" })).toBeInTheDocument();
  });

  it("2 Workspaces, mas só 1 online: não vai para /workspaces", async () => {
    vi.spyOn(cliente, "workspaces").mockImplementation(async () => {
      const f = workspacesFixture();
      return { ...f, workspaces: [f.workspaces[0], f.workspaces[2]] };
    });
    renderPainel("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Visão geral" })).toBeInTheDocument();
  });
});

describe("seletor Workspace › Squad", () => {
  it("lista os Workspaces com bolinha de saúde; offline esmaecido e não selecionável", async () => {
    renderPainel("/geral?workspace=bf-labs");
    await screen.findByRole("heading", { level: 1, name: "Visão geral" });
    const botao = await screen.findByRole("button", { name: "Workspace" });
    await waitFor(() => expect(botao).toHaveTextContent("BF Labs"));
    await userEvent.click(botao);
    const lista = screen.getByRole("listbox", { name: "Workspaces" });
    const opcoes = within(lista).getAllByRole("option");
    expect(opcoes.map((o) => o.getAttribute("data-workspace"))).toEqual(["*", "r7-workspace", "bf-labs", "aura-bios", "itarget"]);
    const aura = opcoes[3];
    expect(aura).toHaveAttribute("aria-disabled", "true");
    expect(aura).toHaveTextContent("offline");
    expect(aura.className).toContain("opacity-60");
    expect(opcoes[2]).toHaveAttribute("aria-selected", "true");
    expect(opcoes[2].querySelector("span.rounded-full")).not.toBeNull();
    await userEvent.click(aura);
    expect(screen.getByTestId("local")).toHaveTextContent("/geral?workspace=bf-labs");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("trocar de Workspace leva à Visão geral dele, e o squad é o segundo nível", async () => {
    vi.spyOn(cliente, "projetos").mockImplementation(async (_s, ws) =>
      ws === "itarget" ? [{ projeto: "itarget-app", raiz: "/x", agentes: 3, atual: true }, { projeto: "itarget-crm", raiz: "/y", agentes: 3, atual: false }] : [{ projeto: "r7one", raiz: "/r", agentes: 5, atual: true }],
    );
    renderPainel("/kanban?projeto=r7one");
    await screen.findByRole("heading", { level: 1, name: "Kanban" });
    await userEvent.click(await screen.findByRole("button", { name: "Workspace" }));
    await userEvent.click(screen.getByRole("option", { name: /iTarget/ }));
    expect(await screen.findByRole("heading", { level: 1, name: "Visão geral" })).toBeInTheDocument();
    expect(screen.getByTestId("local")).toHaveTextContent("/geral?workspace=itarget");
    const sel = await screen.findByLabelText("Projeto");
    await waitFor(() => expect(within(sel).getAllByRole("option").map((o) => o.textContent)).toEqual(["Todos os squads", "itarget-app", "itarget-crm"]));
    await userEvent.selectOptions(sel, "itarget-crm");
    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByTestId("local")).toHaveTextContent("/?projeto=itarget-crm&workspace=itarget");
  });

  it("'Todos os workspaces' abre a tela Workspaces", async () => {
    renderPainel("/geral?workspace=bf-labs");
    await userEvent.click(await screen.findByRole("button", { name: "Workspace" }));
    await userEvent.click(screen.getByRole("option", { name: "Todos os workspaces" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Workspaces" })).toBeInTheDocument();
    expect(screen.getByTestId("local")).toHaveTextContent(/^\/workspaces$/);
  });

  it("com um Workspace só, não mostra o nível Workspace", async () => {
    mockarWorkspaces("um");
    renderPainel("/?projeto=r7one");
    await screen.findByLabelText("Projeto");
    expect(screen.queryByRole("button", { name: "Workspace" })).toBeNull();
  });

  it("o stream muda de conexão com o Workspace, sempre uma só", async () => {
    renderPainel("/kanban?projeto=bf-ads&workspace=bf-labs");
    await waitFor(() => expect(FonteFalsa.todas.some((f) => f.url === "/api/w/bf-labs/api/stream?projeto=bf-ads" && !f.fechada)).toBe(true));
    expect(fonteAberta()).toHaveLength(1);
    await userEvent.click(await screen.findByRole("link", { name: "Workspaces" }));
    await waitFor(() => expect(FonteFalsa.todas.some((f) => f.url === "/api/stream?workspace=*" && !f.fechada)).toBe(true));
    expect(fonteAberta()).toHaveLength(1);
  });
});

describe("tela de squad em Workspace remoto", () => {
  it("o Kanban carrega pelo prefixo /api/w/<id>", async () => {
    vi.restoreAllMocks();
    FonteFalsa.todas = [];
    const urls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (entrada) => {
      const url = String(entrada);
      urls.push(url);
      const u = new URL(url, "http://painel");
      try {
        return new Response(JSON.stringify(responderFixture(u.pathname, Object.fromEntries(u.searchParams))), { status: 200 });
      } catch (e) {
        return new Response(JSON.stringify({ erro: (e as Error).message }), { status: (e as { status?: number }).status ?? 500 });
      }
    });
    renderPainel("/kanban?projeto=bf-ads&workspace=bf-labs");
    await screen.findByRole("heading", { level: 1, name: "Kanban" });
    const assunto = tarefasFixture()[0].assunto;
    expect(await screen.findAllByText(assunto, { exact: false })).not.toHaveLength(0);
    expect(urls).toContain("/api/w/bf-labs/api/tarefas?projeto=bf-ads&periodo=hoje");
    expect(urls).toContain("/api/w/bf-labs/api/agentes?projeto=bf-ads");
    expect(urls.filter((u) => /^\/api\/(tarefas|agentes)/.test(u))).toEqual([]);
  });
});
