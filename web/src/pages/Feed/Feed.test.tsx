import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { cliente } from "../../api/cliente";
import { mensagensFixture } from "../../api/fixtures";
import type { Mensagem } from "../../api/tipos";
import { FonteFalsa, mockarCliente, renderPainel } from "../../test/utils";
import { agrupar, camposDaMensagem, casaFiltro, FILTROS_VAZIOS, raizDe } from "./lib";

let espiao: MockInstance<typeof cliente.mensagens>;

function msgsAgora(n = 0): Mensagem[] {
  return mensagensFixture().filter((m) => Date.parse(m.ts) > Date.now() - n || n === 0);
}

beforeEach(() => {
  FonteFalsa.todas = [];
  mockarCliente();
  espiao = vi.spyOn(cliente, "mensagens").mockImplementation(async (f = {}) => {
    let l = mensagensFixture();
    if (f.agente) l = l.filter((m) => m.de === f.agente || m.para === f.agente);
    if (f.tipo) l = l.filter((m) => m.tipo === f.tipo);
    if (f.q) l = l.filter((m) => `${m.assunto} ${m.id}`.toLowerCase().includes(f.q!.toLowerCase()));
    return { mensagens: l, mais: false };
  });
});
afterEach(() => vi.restoreAllMocks());

const nova = (id: string, extra: Partial<Mensagem> = {}): Mensagem => ({
  id, ts: new Date().toISOString(), de: "r7one-master", para: "r7one-manager01-cc", tipo: "pedido", assunto: `Assunto ${id}`, issues: [999], ...extra,
});

async function abrir(rota = "/feed?periodo=7d") {
  renderPainel(rota);
  await screen.findByRole("heading", { level: 1, name: "Activity Feed" }, { timeout: 5000 });
  await waitFor(() => expect(screen.getAllByTestId("feed-linha").length).toBeGreaterThan(0));
}

describe("lib", () => {
  it("acha a raiz da thread subindo responde_a", () => {
    const todas = msgsAgora();
    const porId = new Map(todas.map((m) => [m.id, m]));
    const filha = todas.find((m) => m.id === "p-0141-3")!;
    expect(raizDe(filha, porId)).toBe("p-0141");
    expect(agrupar(todas).find((g) => g.raiz === "p-0141")!.mensagens).toHaveLength(4);
  });
  it("casaFiltro respeita agente, tipo e issue", () => {
    const m = nova("x");
    expect(casaFiltro(m, { ...FILTROS_VAZIOS, agente: "r7one-master" }, "hoje")).toBe(true);
    expect(casaFiltro(m, { ...FILTROS_VAZIOS, agente: "outro" }, "hoje")).toBe(false);
    expect(casaFiltro(m, { ...FILTROS_VAZIOS, tipo: "entrega" }, "hoje")).toBe(false);
    expect(casaFiltro(m, { ...FILTROS_VAZIOS, issue: "999" }, "hoje")).toBe(true);
    expect(casaFiltro(m, { ...FILTROS_VAZIOS, issue: "1" }, "hoje")).toBe(false);
  });
  it("campos omitem prev", () => {
    const campos = camposDaMensagem({ ...nova("a"), prev: "abc" } as unknown as Mensagem).map(([k]) => k);
    expect(campos).not.toContain("prev");
    expect(campos[0]).toBe("id");
  });
});

describe("Feed", () => {
  it("renderiza as mensagens agrupadas por conversa", async () => {
    await abrir();
    expect(screen.getAllByTestId("feed-grupo").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Conversa" })[0]).toHaveAttribute("href", expect.stringContaining("/conversas/"));
  });

  it("alterna para lista e grava o modo na URL", async () => {
    await abrir();
    await userEvent.click(screen.getByRole("radio", { name: "Lista" }));
    expect(screen.queryAllByTestId("feed-grupo")).toHaveLength(0);
    expect(screen.getByTestId("local")).toHaveTextContent("modo=lista");
  });

  it("expande a linha e mostra os campos sem prev", async () => {
    await abrir("/feed?periodo=7d&modo=lista");
    await userEvent.click(screen.getAllByRole("button", { name: /Expandir mensagem/ })[0]);
    const dl = document.querySelector("dl")!;
    expect(within(dl as HTMLElement).getByText("id")).toBeInTheDocument();
    expect(within(dl as HTMLElement).queryByText("prev")).toBeNull();
  });

  it("filtra por tipo via chip, na URL e no REST", async () => {
    await abrir();
    await userEvent.click(screen.getByRole("button", { name: /^Tipo/ }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "entrega" }));
    expect(screen.getByTestId("local")).toHaveTextContent("tipo=entrega");
    await waitFor(() => expect(espiao).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: "entrega" }), expect.anything()));
  });

  it("filtros iniciais vêm da URL", async () => {
    renderPainel("/feed?periodo=7d&agente=r7one-manager01-cc");
    await waitFor(() => expect(espiao).toHaveBeenCalledWith(expect.objectContaining({ agente: "r7one-manager01-cc" }), expect.anything()));
  });

  it("mostra estado vazio", async () => {
    espiao.mockResolvedValue({ mensagens: [], mais: false });
    renderPainel("/feed");
    expect(await screen.findByText("Nenhuma mensagem no período")).toBeInTheDocument();
  });

  it("mensagem nova por SSE entra no topo com destaque", async () => {
    await abrir("/feed?periodo=7d&modo=lista");
    await waitFor(() => expect(FonteFalsa.todas.length).toBeGreaterThan(0));
    act(() => FonteFalsa.todas[0].emitir("mensagem", nova("p-9000")));
    const linhas = await screen.findAllByTestId("feed-linha");
    expect(linhas[0]).toHaveAttribute("data-id", "p-9000");
    expect(linhas[0]).toHaveClass("feed-novo");
  });

  it("mensagem que não casa com o filtro não entra", async () => {
    await abrir("/feed?periodo=7d&modo=lista&tipo=entrega");
    act(() => FonteFalsa.todas[0].emitir("mensagem", nova("p-9001")));
    expect(screen.queryByText("Assunto p-9001")).toBeNull();
  });

  it("pausado, vai para o buffer e o chip aplica", async () => {
    await abrir("/feed?periodo=7d&modo=lista");
    await userEvent.click(screen.getByRole("button", { name: "Pausar" }));
    act(() => FonteFalsa.todas[0].emitir("mensagem", nova("p-9002")));
    expect(screen.queryByText(/Assunto p-9002/)).toBeNull();
    await userEvent.click(await screen.findByRole("button", { name: "1 nova" }));
    expect(await screen.findByText(/Assunto p-9002/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /nova/ })).toBeNull();
  });

  it("faixa explicativa recolhe e expande", async () => {
    await abrir();
    const b = screen.getByRole("button", { name: /Sobre mensagens, filtros e agrupamento/ });
    expect(b).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(b);
    expect(screen.getByText("Ciclo de vida")).toBeInTheDocument();
  });

  it("pagina com antes= quando há mais", async () => {
    const todas = mensagensFixture();
    espiao.mockImplementation(async (f: { antes?: string } = {}) =>
      f.antes ? { mensagens: [], mais: false } : { mensagens: todas.slice(0, 5), mais: true },
    );
    renderPainel("/feed?periodo=7d&modo=lista");
    // sem layout no jsdom a sentinela já está "na tela": a próxima página é pedida sozinha
    await waitFor(() => expect(espiao).toHaveBeenCalledWith(expect.objectContaining({ antes: todas[4].ts })));
  });
});
