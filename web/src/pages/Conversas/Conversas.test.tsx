import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cliente } from "../../api/cliente";
import { ErroApi } from "../../api/erro";
import { conversasFixture, mensagensFixture } from "../../api/fixtures";
import type { ConversaDetalhe } from "../../api/tipos";
import { FonteFalsa, mockarCliente, renderPainel } from "../../test/utils";
import { etapasDoCiclo, ordenar } from "./util";

function detalhe(id: string): ConversaDetalhe {
  const conversa = conversasFixture().find((c) => c.id === id)!;
  const mensagens = mensagensFixture().filter((m) => m.id === id || m.id.startsWith(`${id}-`)).reverse();
  return { conversa, mensagens };
}

beforeEach(() => {
  FonteFalsa.todas = [];
  mockarCliente();
  vi.spyOn(cliente, "conversa").mockImplementation(async (id) => {
    if (id === "nada") throw new ErroApi(404, "não existe");
    return detalhe(id);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("lista de conversas", () => {
  it("renderiza as linhas com estado, issues e links", async () => {
    renderPainel("/conversas");
    expect(await screen.findByText("Modelo de mensagem de rodapé editável por empresa")).toBeInTheDocument();
    expect(screen.getAllByRole("row").length).toBe(conversasFixture().length + 1);
    expect(screen.getAllByText("#421").length).toBeGreaterThan(0);
    const link = screen.getByRole("link", { name: /Modelo de mensagem de rodapé/ });
    expect(link).toHaveAttribute("href", expect.stringContaining("/conversas/p-0143"));
  });

  it("mostra estado vazio", async () => {
    vi.spyOn(cliente, "conversas").mockResolvedValue([]);
    renderPainel("/conversas");
    expect(await screen.findByText("Nenhuma conversa no período")).toBeInTheDocument();
  });

  it("filtro por estado vai para a URL e refaz a busca", async () => {
    renderPainel("/conversas");
    await screen.findByText("Modelo de mensagem de rodapé editável por empresa");
    await userEvent.selectOptions(screen.getByLabelText("Filtrar por estado"), "rejeitado");
    await waitFor(() => expect(screen.getByTestId("local").textContent).toContain("estado=rejeitado"));
    await waitFor(() => expect(cliente.conversas).toHaveBeenLastCalledWith(expect.objectContaining({ estado: "rejeitado" }), expect.anything()));
  });

  it("o filtro de estado oferece aprovado, rejeitado e aguardando revisão", async () => {
    renderPainel("/conversas");
    await screen.findByText("Modelo de mensagem de rodapé editável por empresa");
    const opcoes = within(screen.getByLabelText("Filtrar por estado")).getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
    expect(opcoes).toEqual(expect.arrayContaining(["aprovado", "rejeitado", "aguardando_revisao"]));
  });

  it("colunas menos importantes somem abaixo de lg e a tabela rola com barra visível", async () => {
    renderPainel("/conversas");
    await screen.findByText("Modelo de mensagem de rodapé editável por empresa");
    const th = screen.getByRole("columnheader", { name: "Participantes" });
    expect(th.className).toContain("hidden");
    expect(th.className).toContain("lg:table-cell");
    expect(document.querySelector("[data-rolagem-x].barra-x")).not.toBeNull();
  });

  it("ordena clicando no cabeçalho", async () => {
    renderPainel("/conversas");
    await screen.findByText("Modelo de mensagem de rodapé editável por empresa");
    await userEvent.click(screen.getByRole("button", { name: "Msgs" }));
    await waitFor(() => expect(screen.getByTestId("local").textContent).toContain("ord=mensagens"));
    const ordem = ordenar(conversasFixture(), "mensagens", "desc").map((c) => c.id);
    const primeira = screen.getAllByRole("row")[1];
    expect(within(primeira).getByText(ordem[0])).toBeInTheDocument();
  });

  it("evento SSE de mensagem refaz o REST (debounce de 1 s)", async () => {
    renderPainel("/conversas");
    await screen.findByText("Modelo de mensagem de rodapé editável por empresa");
    vi.mocked(cliente.conversas).mockClear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fonte = FonteFalsa.todas[FonteFalsa.todas.length - 1];
    act(() => {
      fonte.abrir();
      fonte.emitir("mensagem", { id: "x1", ts: new Date().toISOString(), de: "a", para: "b", tipo: "andamento", responde_a: "p-0145" });
      fonte.emitir("mensagem", { id: "x2", ts: new Date().toISOString(), de: "a", para: "b", tipo: "andamento", responde_a: "p-0145" });
    });
    expect(cliente.conversas).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(cliente.conversas).toHaveBeenCalledTimes(1);
  });
});

describe("detalhe da conversa", () => {
  it("mostra cabeçalho, stepper e timeline com veredito", async () => {
    renderPainel("/conversas/p-0142");
    expect(await screen.findByRole("heading", { level: 1, name: /.+/ })).toBeInTheDocument();
    const etapas = screen.getByRole("region", { name: "Resumo do ciclo" });
    expect(within(etapas).getByText("Pedido")).toBeInTheDocument();
    expect(within(etapas).getByText("Entrega")).toBeInTheDocument();
    const ver = document.querySelector("[data-veredito='rejeitado']");
    expect(ver).not.toBeNull();
    expect(screen.getByLabelText("Voltar para Conversas")).toBeInTheDocument();
  });

  it("master fica à esquerda e os outros à direita", async () => {
    renderPainel("/conversas/p-0141");
    await screen.findByLabelText("Timeline da conversa");
    expect(document.querySelector("[data-msg='p-0141']")).toHaveAttribute("data-lado", "esquerda");
    expect(document.querySelector("[data-msg='p-0141-1']")).toHaveAttribute("data-lado", "direita");
  });

  it("mensagem nova da thread entra no fim", async () => {
    renderPainel("/conversas/p-0145");
    await screen.findByLabelText("Timeline da conversa");
    const antes = document.querySelectorAll("[data-msg]").length;
    const fonte = FonteFalsa.todas[FonteFalsa.todas.length - 1];
    act(() => {
      fonte.abrir();
      fonte.emitir("mensagem", { id: "p-0145-9", ts: new Date(Date.now() + 1000).toISOString(), de: "r7one-manager01-cc", para: "r7one-master", tipo: "entrega", assunto: "Entrega ao vivo", responde_a: "p-0145-2" });
      fonte.emitir("mensagem", { id: "outra", ts: new Date().toISOString(), de: "a", para: "b", tipo: "nota", responde_a: "zzz" });
    });
    expect(await screen.findByText("Entrega ao vivo")).toBeInTheDocument();
    const todas = document.querySelectorAll("[data-msg]");
    expect(todas.length).toBe(antes + 1);
    expect(todas[todas.length - 1]).toHaveAttribute("data-msg", "p-0145-9");
  });

  it("404 mostra estado vazio com volta", async () => {
    renderPainel("/conversas/nada");
    expect(await screen.findByText("Conversa não encontrada")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Voltar para Conversas/ })).toBeInTheDocument();
  });
});

describe("etapasDoCiclo", () => {
  it("marca etapas pendentes e calcula deltas", () => {
    const e = etapasDoCiclo(detalhe("p-0145").mensagens);
    expect(e.map((x) => x.estado)).toEqual(["feito", "feito", "pendente", "pendente"]);
    expect(e[1].delta).toBeGreaterThan(0);
    expect(e[1].rotulo).toBe("Andamento (2)");
  });
});

describe("detalhe: estado x resumo do ciclo", () => {
  it.each([["p-0141", "Aprovado"], ["p-0142", "Rejeitado"]])("%s: o badge do estado bate com a etapa de revisão (%s)", async (id, rotulo) => {
    renderPainel(`/conversas/${id}`);
    await screen.findByRole("heading", { level: 1 });
    const etapa = document.querySelector("[data-etapa='revisao']")!;
    expect(etapa).toHaveTextContent(rotulo);
    expect(screen.getByRole("heading", { level: 1 }).parentElement).toHaveTextContent(rotulo);
  });
});
