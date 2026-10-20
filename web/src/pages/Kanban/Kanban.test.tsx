import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cliente } from "../../api/cliente";
import { agentesFixture, tarefasFixture } from "../../api/fixtures";
import { FonteFalsa, mockarCliente, renderPainel } from "../../test/utils";

import { configure } from "@testing-library/react";
configure({ asyncUtilTimeout: 5000 });

beforeEach(() => {
  FonteFalsa.todas = [];
  mockarCliente();
});
afterEach(() => vi.restoreAllMocks());

const coluna = (nome: string) => screen.getByRole("region", { name: nome });
const fonte = () => FonteFalsa.todas[FonteFalsa.todas.length - 1];

describe("Kanban: tarefas", () => {
  it("renderiza as colunas com contadores e cards", async () => {
    renderPainel("/kanban");
    await screen.findByText("SSE no lugar de polling na tela de conversas");
    for (const n of ["Atrasado", "Aberto", "Em andamento", "Aguardando revisão", "Aprovado", "Rejeitado", "Concluído"]) {
      expect(coluna(n)).toBeInTheDocument();
    }
    expect(within(coluna("Aberto")).getByText("Corrigir fuso horário dos agendamentos de follow-up")).toBeInTheDocument();
    expect(coluna("Atrasado").querySelector("[data-contador]")).toHaveTextContent("1");
    expect(within(coluna("Atrasado")).getByText("#427")).toBeInTheDocument();
    expect(within(coluna("Atrasado")).getByText(/Venceu/)).toBeInTheDocument();
    expect(within(coluna("Atrasado")).getByText("feat/import-csv")).toBeInTheDocument();
  });

  it("o card leva à conversa", async () => {
    renderPainel("/kanban");
    const t = await screen.findByText("SSE no lugar de polling na tela de conversas");
    expect(t.closest("a")).toHaveAttribute("href", expect.stringContaining("/conversas/p-0145"));
  });

  it("o tooltip explica entrada e saída", async () => {
    renderPainel("/kanban");
    await screen.findByText("SSE no lugar de polling na tela de conversas");
    const dica = within(coluna("Aguardando revisão")).getByRole("tooltip");
    expect(dica).toHaveTextContent(/entrega foi enviada ao master/);
  });

  it("estado vazio", async () => {
    vi.spyOn(cliente, "tarefas").mockResolvedValue([]);
    renderPainel("/kanban");
    expect(await screen.findByText("Nenhuma tarefa ainda")).toBeInTheDocument();
  });

  it("busca e filtro por agente", async () => {
    renderPainel("/kanban");
    await screen.findByText("SSE no lugar de polling na tela de conversas");
    await userEvent.type(screen.getByRole("searchbox"), "#427");
    expect(screen.queryByText("SSE no lugar de polling na tela de conversas")).not.toBeInTheDocument();
    expect(screen.getByText(/Importar contatos/)).toBeInTheDocument();
    await userEvent.clear(screen.getByRole("searchbox"));
    await userEvent.selectOptions(screen.getByLabelText("Agente"), "r7one-manager01-cc");
    expect(screen.queryByText(/Importar contatos/)).not.toBeInTheDocument();
    expect(screen.getByText("SSE no lugar de polling na tela de conversas")).toBeInTheDocument();
  });

  it("o evento tarefa move o card de coluna", async () => {
    renderPainel("/kanban");
    await screen.findByText("Corrigir fuso horário dos agendamentos de follow-up");
    await waitFor(() => expect(FonteFalsa.todas.length).toBeGreaterThan(0));
    const t = tarefasFixture().find((x) => x.id === "p-0147")!;
    act(() => {
      fonte().abrir();
      fonte().emitir("tarefa", { ...t, estado: "em_andamento", andamento: "Começou agora" });
    });
    await waitFor(() => expect(within(coluna("Em andamento")).getByText("Corrigir fuso horário dos agendamentos de follow-up")).toBeInTheDocument());
    expect(within(coluna("Aberto")).queryByText("Corrigir fuso horário dos agendamentos de follow-up")).not.toBeInTheDocument();
  });
});

describe("Kanban: agentes", () => {
  it("o modo fica em ?modo= e mostra as colunas de agentes", async () => {
    renderPainel("/kanban");
    await screen.findByText("SSE no lugar de polling na tela de conversas");
    await userEvent.click(screen.getByRole("radio", { name: "Agentes" }));
    expect(await screen.findByTestId("local")).toHaveTextContent("modo=agentes");
    for (const n of ["Trabalhando", "Esperando você", "Com pendente", "Parado", "Offline"]) expect(coluna(n)).toBeInTheDocument();
    expect(within(coluna("Esperando você")).getByText("manager03-cc")).toBeInTheDocument();
    expect(within(coluna("Esperando você")).getByText(/Não/)).toBeInTheDocument();
  });

  it("o evento agente move o agente de coluna", async () => {
    renderPainel("/kanban?modo=agentes");
    await screen.findByRole("region", { name: "Esperando você" });
    await within(coluna("Esperando você")).findByText("manager03-cc");
    await waitFor(() => expect(FonteFalsa.todas.length).toBeGreaterThan(0));
    const a = agentesFixture().find((x) => x.agente === "r7one-manager03-cc")!;
    act(() => {
      fonte().abrir();
      fonte().emitir("agente", { ...a, status: "trabalhando" });
    });
    await waitFor(() => expect(within(coluna("Trabalhando")).getByText("manager03-cc")).toBeInTheDocument());
    expect(within(coluna("Esperando você")).queryByText("manager03-cc")).not.toBeInTheDocument();
  });

  it("estado vazio", async () => {
    vi.spyOn(cliente, "agentes").mockResolvedValue([]);
    renderPainel("/kanban?modo=agentes");
    expect(await screen.findByText("Nenhum agente cadastrado")).toBeInTheDocument();
  });
});
