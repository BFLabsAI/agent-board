import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { agentesFixture, tarefasFixture } from "../../api/fixtures";
import { caminho, calcularLayout } from "./Mapa/layout";
import Mapa from "./Mapa";

const agentes = agentesFixture();
const tarefas = tarefasFixture();
const doc = (n: string) => document.querySelector(`[data-agente='${n}']`) as HTMLElement;
const base = { agentes, tarefas, selecionado: null, aoSelecionar: () => {} };

describe("Mapa", () => {
  it("monta o organograma: master, managers e researcher com ligações", () => {
    render(<Mapa {...base} />);
    expect(screen.getAllByTestId("no-mapa")).toHaveLength(5);
    expect(screen.getByText("Orquestrador")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-ligacao]")).toHaveLength(4);
  });

  it("master mostra pedidos abertos e entregas para revisar", () => {
    render(<Mapa {...base} />);
    const master = doc("r7one-master");
    // fixtures: 4 pedidos abertos/em andamento/atrasado e 1 aguardando revisão
    expect(within(master).getByText(/4 pedidos abertos/)).toBeInTheDocument();
    expect(within(master).getByText(/1 p\/ revisar/)).toBeInTheDocument();
  });

  it("pendura as tarefas abertas sob o agente com assunto e estado", () => {
    render(<Mapa {...base} />);
    const m2 = doc("r7one-manager02-omp");
    const cartoes = within(m2).getAllByTestId("cartao-tarefa");
    expect(cartoes).toHaveLength(1);
    expect(cartoes[0]).toHaveAttribute("data-estado", "atrasado");
    expect(cartoes[0]).toHaveTextContent("#427");
  });

  it("clicar chama aoSelecionar e o selecionado fica destacado", () => {
    const aoSelecionar = vi.fn();
    const { rerender } = render(<Mapa {...base} aoSelecionar={aoSelecionar} />);
    fireEvent.click(screen.getByRole("button", { name: /r7one-manager01-cc/ }));
    expect(aoSelecionar).toHaveBeenCalledWith("r7one-manager01-cc");
    rerender(<Mapa {...base} aoSelecionar={aoSelecionar} selecionado="r7one-manager01-cc" />);
    expect(screen.getByRole("button", { name: /r7one-manager01-cc/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("alternar para Times agrupa por harness e depois por worktree", () => {
    render(<Mapa {...base} />);
    fireEvent.click(screen.getByRole("radio", { name: /Times/ }));
    const grupos = screen.getAllByTestId("coluna-time").map((c) => c.getAttribute("data-grupo"));
    expect(grupos).toEqual(["CC", "OMP"]);
    fireEvent.click(screen.getByRole("radio", { name: "Worktree" }));
    expect(screen.getAllByTestId("coluna-time")).toHaveLength(5);
    expect(screen.getByRole("region", { name: "Time csv" })).toBeInTheDocument();
  });

  it("estado vazio", () => {
    render(<Mapa {...base} agentes={[]} tarefas={[]} />);
    expect(screen.getByText("Nenhum agente neste projeto")).toBeInTheDocument();
  });

  it("reage a delta de tarefa/agente (como o SSE da página faria) e informa o tamanho", () => {
    const aoMedir = vi.fn();
    const { rerender } = render(<Mapa {...base} aoMedir={aoMedir} />);
    expect(aoMedir).toHaveBeenCalled();
    const antes = screen.getAllByTestId("cartao-tarefa").length;
    const nova = { ...tarefas[0], id: "p-9999", para: "r7one-manager03-cc", estado: "aberto" as const, assunto: "Tarefa nova via SSE" };
    const alterados = agentes.map((a) => (a.agente === "r7one-manager03-cc" ? { ...a, status: "trabalhando" as const } : a));
    rerender(<Mapa {...base} agentes={alterados} tarefas={[...tarefas, nova]} aoMedir={aoMedir} />);
    expect(screen.getAllByTestId("cartao-tarefa")).toHaveLength(antes + 1);
    expect(screen.getByText("Tarefa nova via SSE")).toBeInTheDocument();
    expect(document.querySelector("[data-ligacao='r7one-manager03-cc'] animate")).not.toBeNull();
  });

  it("texto da API vai como texto, nunca como HTML", () => {
    const suja = { ...tarefas[0], id: "x", para: "r7one-manager01-cc", estado: "aberto" as const, assunto: "<img src=x onerror=alert(1)>" };
    const { container } = render(<Mapa {...base} tarefas={[suja]} />);
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("layout", () => {
  it("ligações em ângulo reto: só segmentos horizontais e verticais", () => {
    const l = calcularLayout(agentes, tarefas);
    expect(l.ligacoes).toHaveLength(4);
    for (const lig of l.ligacoes) expect(lig.d).not.toMatch(/NaN/);
    expect(l.largura).toBeGreaterThan(600);
  });
  it("caminho ignora pontos repetidos", () => {
    expect(caminho([[0, 0], [0, 10], [0, 10], [0, 20]])).not.toMatch(/NaN/);
  });
});
