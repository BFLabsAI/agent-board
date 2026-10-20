import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cliente } from "../../api/cliente";
import { MASTER, agentesFixture, tarefasFixture } from "../../api/fixtures";
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
    for (const n of ["Atrasado", "Aberto", "Em andamento", "Aguardando revisão", "Fechadas"]) {
      expect(coluna(n)).toBeInTheDocument();
    }
    expect(within(coluna("Aberto")).getByText("Corrigir fuso horário dos agendamentos de follow-up")).toBeInTheDocument();
    expect(coluna("Atrasado").querySelector("[data-contador]")).toHaveTextContent("1");
    expect(within(coluna("Atrasado")).getByText("#427")).toBeInTheDocument();
    expect(within(coluna("Atrasado")).getByText(/Venceu/)).toBeInTheDocument();
    expect(within(coluna("Atrasado")).getByText("feat/import-csv")).toBeInTheDocument();
  });

  it("Fechadas agrupa aprovado, rejeitado e concluído em abas com contador", async () => {
    renderPainel("/kanban");
    await screen.findByText("SSE no lugar de polling na tela de conversas");
    const f = coluna("Fechadas");
    const abas = within(f).getAllByRole("tab");
    expect(abas.map((a) => a.textContent)).toEqual([expect.stringMatching(/^Aprovado\d+$/), expect.stringMatching(/^Rejeitado\d+$/), expect.stringMatching(/^Concluído\d+$/)]);
    expect(abas[0]).toHaveAttribute("aria-selected", "true");
    await userEvent.click(abas[1]);
    expect(abas[1]).toHaveAttribute("aria-selected", "true");
    const total = Array.from(f.querySelectorAll("[data-contador-aba]")).reduce((n, e) => n + Number(e.textContent), 0);
    expect(f.querySelector("[data-contador]")).toHaveTextContent(String(total));
  });

  it("card movido por SSE para Fechadas troca a aba e destaca o cabeçalho", async () => {
    renderPainel("/kanban");
    await screen.findByText("Corrigir fuso horário dos agendamentos de follow-up");
    await waitFor(() => expect(FonteFalsa.todas.length).toBeGreaterThan(0));
    const t = tarefasFixture().find((x) => x.id === "p-0147")!;
    act(() => {
      fonte().abrir();
      fonte().emitir("tarefa", { ...t, estado: "rejeitado" });
    });
    await waitFor(() => expect(within(coluna("Fechadas")).getByRole("tab", { name: /Rejeitado/ })).toHaveAttribute("aria-selected", "true"));
    expect(within(coluna("Fechadas")).getByText("Corrigir fuso horário dos agendamentos de follow-up")).toBeInTheDocument();
    expect(coluna("Fechadas").querySelector("header")).toHaveAttribute("data-brilho");
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

describe("Kanban: sub-agents", () => {
  it("modo Agentes aninha os sub-agents abaixo do pai, com +N expansível", async () => {
    renderPainel("/kanban?modo=agentes");
    await screen.findAllByText("manager01-cc");
    const card = document.querySelector('[data-agente="r7one-manager01-cc"]') as HTMLElement;
    expect(within(card).getAllByRole("listitem")).toHaveLength(3);
    expect(within(card).getByText("Backoff exponencial no cliente")).toBeInTheDocument();
    expect(within(card).getAllByText(/^(general-purpose|Explore)$/).length).toBeGreaterThan(0);
    expect(within(card).getAllByText(/^Bash$|^Edit$/).length).toBeGreaterThan(0);
  });

  it("+N expande a lista quando há mais de 3", async () => {
    const base = agentesFixture().find((x) => x.agente === MASTER)!;
    const subs = Array.from({ length: 5 }, (_, i) => ({ ...base.subagentes[0], id: `z${i}`, descricao: `sub ${i}`, status: "concluido" as const, inicio: new Date(Date.now() - i * 60000).toISOString(), duracao_s: 10 }));
    vi.spyOn(cliente, "agentes").mockResolvedValue([{ ...base, subagentes: subs }]);
    renderPainel("/kanban?modo=agentes");
    const mais = await screen.findByRole("button", { name: /\+2/ });
    expect(screen.getAllByText(/^sub \d$/)).toHaveLength(3);
    await userEvent.click(mais);
    expect(screen.getAllByText(/^sub \d$/)).toHaveLength(5);
  });

  it("tolera subagentes ausente no JSON real", async () => {
    const sem = agentesFixture().map((a) => { const x = { ...a } as Partial<typeof a>; delete x.subagentes; return x as typeof a; });
    vi.spyOn(cliente, "agentes").mockResolvedValue(sem);
    const t = tarefasFixture().map((x) => { const y = { ...x } as Partial<typeof x>; delete y.subagentes; return y as typeof x; });
    vi.spyOn(cliente, "tarefas").mockResolvedValue(t);
    renderPainel("/kanban?modo=agentes");
    expect(await screen.findAllByText("manager01-cc")).not.toHaveLength(0);
    expect(document.querySelector("[data-sublista]")).toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: "Tarefas" }));
    expect(await screen.findByText("SSE no lugar de polling na tela de conversas")).toBeInTheDocument();
    expect(document.querySelector("[data-subs-tarefa]")).toBeNull();
  });

  it("o evento subagente atualiza o card do pai", async () => {
    renderPainel("/kanban?modo=agentes");
    await screen.findAllByText("manager01-cc");
    await waitFor(() => expect(FonteFalsa.todas.length).toBeGreaterThan(0));
    const s = agentesFixture().find((x) => x.agente === "r7one-researcher01-cc")!.subagentes[0];
    act(() => {
      fonte().abrir();
      fonte().emitir("subagente", { ...s, id: "novo1", descricao: "Sub recém-criado", status: "rodando", fim: null, duracao_s: null });
    });
    expect(await screen.findByText("Sub recém-criado")).toBeInTheDocument();
    act(() => fonte().emitir("subagente", { ...s, id: "novo1", descricao: "Sub recém-criado", status: "erro" }));
    await waitFor(() => expect(document.querySelector('[data-sub="novo1"]')).toHaveAttribute("data-status", "erro"));
  });

  it("modo Tarefas mostra 'N sub-agents (M rodando)' e expande a lista", async () => {
    renderPainel("/kanban");
    await screen.findByText("SSE no lugar de polling na tela de conversas");
    const card = document.querySelector('[data-tarefa="p-0145"]') as HTMLElement;
    const botao = within(card).getByRole("button", { name: /sub-agents/ });
    expect(botao.textContent).toMatch(/\d+ sub-agents \(\d+ rodando\)/);
    expect(botao).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(botao);
    expect(within(card).getByRole("list", { name: "Sub-agents da tarefa" })).toBeInTheDocument();
    expect(within(card).getByText("Backoff exponencial no cliente")).toBeInTheDocument();
  });
});
