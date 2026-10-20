import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAVE_PROJETO } from "../context/ContextoPainel";
import { ITENS_NAV } from "../rotas";
import { FonteFalsa, mockarCliente, renderPainel } from "../test/utils";

beforeEach(() => {
  FonteFalsa.todas = [];
  mockarCliente();
});
afterEach(() => vi.restoreAllMocks());

const TITULOS: Record<string, string> = {
  "/": "Dashboard",
  "/kanban": "Kanban",
  "/conversas": "Conversas",
  "/feed": "Activity Feed",
  "/analytics": "Analytics",
  "/workflows": "Workflows",
  "/office": "Office",
};

describe("navegação", () => {
  it("a sidebar lista todas as telas", async () => {
    renderPainel("/");
    const nav = await screen.findByRole("navigation", { name: "Navegação principal" });
    for (const item of ITENS_NAV) expect(within(nav).getByRole("link", { name: item.rotulo })).toBeInTheDocument();
  });

  it.each(Object.entries(TITULOS))("renderiza %s", async (rota, titulo) => {
    renderPainel(rota);
    expect(await screen.findByRole("heading", { level: 1, name: titulo })).toBeInTheDocument();
  });

  it("renderiza o detalhe da conversa", async () => {
    renderPainel("/conversas/p-0141");
    expect(await screen.findByRole("heading", { level: 1, name: /Conversa p-0141/ })).toBeInTheDocument();
  });

  it("clicar no menu troca de tela e marca o item ativo", async () => {
    renderPainel("/");
    await userEvent.click(await screen.findByRole("link", { name: "Kanban" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Kanban" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kanban" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("Conversas fica ativo também no detalhe", async () => {
    renderPainel("/conversas/p-0141");
    expect(await screen.findByRole("link", { name: "Conversas" })).toHaveAttribute("aria-current", "page");
  });

  it("rota desconhecida mostra 404 em português", async () => {
    renderPainel("/nada");
    expect(await screen.findByText("Página não encontrada")).toBeInTheDocument();
  });

  it("a navegação preserva projeto, período e modo TV", async () => {
    renderPainel("/?projeto=agent-board&periodo=7d");
    await userEvent.click(await screen.findByRole("link", { name: "Feed".length ? "Activity Feed" : "" }));
    await waitFor(() => expect(screen.getByTestId("local")).toHaveTextContent("/feed?projeto=agent-board&periodo=7d"));
  });
});

describe("modo TV", () => {
  it("?tv=1 esconde a sidebar", async () => {
    renderPainel("/?tv=1");
    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Navegação principal" })).not.toBeInTheDocument();
  });
});

describe("sidebar recolhível", () => {
  it("recolhe, esconde os rótulos e lembra a escolha", async () => {
    renderPainel("/");
    await userEvent.click(await screen.findByRole("button", { name: "Recolher menu" }));
    expect(screen.queryByLabelText("Projeto")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expandir menu" })).toBeInTheDocument();
    expect(window.localStorage.getItem("agent-board:sidebar-recolhida")).toBe("1");
  });
});

describe("seletor de projeto", () => {
  it("lista os projetos de /api/projetos e marca o atual", async () => {
    renderPainel("/");
    const sel = await screen.findByLabelText("Projeto");
    await waitFor(() => expect(within(sel).getAllByRole("option")).toHaveLength(3));
    expect(sel).toHaveValue("r7one");
  });

  it("trocar de projeto grava na URL e no localStorage", async () => {
    renderPainel("/kanban");
    const sel = await screen.findByLabelText("Projeto");
    await waitFor(() => expect(within(sel).getAllByRole("option")).toHaveLength(3));
    await userEvent.selectOptions(sel, "agent-board");
    await waitFor(() => expect(screen.getByTestId("local")).toHaveTextContent("/kanban?projeto=agent-board"));
    expect(window.localStorage.getItem(CHAVE_PROJETO)).toBe("agent-board");
  });

  it("recupera o projeto do localStorage e passa para a API", async () => {
    window.localStorage.setItem(CHAVE_PROJETO, "r7-mentorias");
    const { cliente } = await import("../api/cliente");
    renderPainel("/");
    await waitFor(() => expect(cliente.resumo).toHaveBeenCalledWith(expect.objectContaining({ projeto: "r7-mentorias" }), expect.anything()));
    await waitFor(() => expect(screen.getByTestId("local")).toHaveTextContent("projeto=r7-mentorias"));
  });

  it("projeto da URL vence o do localStorage", async () => {
    window.localStorage.setItem(CHAVE_PROJETO, "r7-mentorias");
    renderPainel("/?projeto=agent-board");
    expect(await screen.findByLabelText("Projeto")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Projeto")).toHaveValue("agent-board"));
  });

  it("ignora projeto salvo que não existe mais", async () => {
    window.localStorage.setItem(CHAVE_PROJETO, "sumiu");
    renderPainel("/");
    const sel = await screen.findByLabelText("Projeto");
    await waitFor(() => expect(sel).toHaveValue("r7one"));
  });

  it("funciona mesmo se o localStorage lançar erro", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    renderPainel("/");
    const sel = await screen.findByLabelText("Projeto");
    await waitFor(() => expect(within(sel).getAllByRole("option")).toHaveLength(3));
    await userEvent.selectOptions(sel, "agent-board");
    await waitFor(() => expect(screen.getByTestId("local")).toHaveTextContent("projeto=agent-board"));
  });
});

describe("seletor de período", () => {
  it("troca o período no contexto global e na URL", async () => {
    renderPainel("/");
    await userEvent.click(await screen.findByRole("radio", { name: "7 dias" }));
    expect(screen.getByRole("radio", { name: "7 dias" })).toBeChecked();
    expect(screen.getByTestId("local")).toHaveTextContent("periodo=7d");
    const { cliente } = await import("../api/cliente");
    await waitFor(() => expect(cliente.resumo).toHaveBeenLastCalledWith(expect.objectContaining({ periodo: "7d" }), expect.anything()));
  });
});

describe("indicador Live", () => {
  it("segue o estado do stream: Live, Reconectando e Offline", async () => {
    renderPainel("/");
    const ind = await screen.findByRole("status");
    await waitFor(() => expect(FonteFalsa.todas.length).toBeGreaterThan(0));
    const fonte = () => FonteFalsa.todas[FonteFalsa.todas.length - 1];
    expect(ind).toHaveAttribute("data-status", "conectando");
    act(() => fonte().abrir());
    expect(ind).toHaveAttribute("data-status", "conectado");
    expect(ind).toHaveTextContent("Live");
    expect(ind).toHaveTextContent("v1.11.0-dev");
    act(() => fonte().falhar());
    expect(ind).toHaveTextContent("Reconectando");
  });

  it("o stream usa o projeto da URL", async () => {
    renderPainel("/?projeto=agent-board");
    await waitFor(() => expect(FonteFalsa.todas.some((f) => f.url === "/api/stream?projeto=agent-board")).toBe(true));
  });
});
