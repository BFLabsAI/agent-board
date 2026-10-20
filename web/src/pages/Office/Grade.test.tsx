import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { agentesFixture, tarefasFixture } from "../../api/fixtures";
import Grade from "./Grade";
import { ordenar, resumir, taxaAprovacao } from "./Grade/dados";

const agentes = agentesFixture();
const doc = (n: string) => document.querySelector(`[data-agente='${n}']`) as HTMLElement;
const base = { agentes, tarefas: tarefasFixture(), selecionado: null, aoSelecionar: () => {} };
const nomes = () => screen.getAllByTestId("card-grade").map((c) => c.getAttribute("data-agente"));

describe("Grade", () => {
  it("resumo: online/total, trabalhando e chips", () => {
    render(<Grade {...base} />);
    const r = screen.getByTestId("resumo-grade");
    expect(r).toHaveTextContent("5/5 agentes");
    expect(r).toHaveTextContent("2 trabalhando agora");
    expect(r).toHaveTextContent("mensagens hoje");
    expect(r.querySelector("[data-chip='verde']")).toHaveTextContent("2");
    expect(r.querySelector("[data-chip='amarelo']")).toHaveTextContent("2");
    expect(r.querySelector("[data-chip='vermelho']")).toHaveTextContent("0");
  });

  it("um card por agente com atividade, entregas, p50 e tarefa atual", () => {
    render(<Grade {...base} />);
    expect(screen.getAllByTestId("card-grade")).toHaveLength(5);
    const card = doc("r7one-manager02-omp");
    expect(within(card).getAllByText(/Atividade · 14d/)).toHaveLength(1);
    expect(card.querySelectorAll("[data-barra]")).toHaveLength(14);
    const soma = agentes[2].stats.atividade_14d.reduce((a, b) => a + b, 0);
    expect(within(card).getByTestId("total-atividade")).toHaveTextContent(String(soma));
    expect(within(card).getByText(/Importar contatos de CSV/)).toBeInTheDocument();
    expect(within(card).getByText("OMP")).toBeInTheDocument();
    expect(within(card).getByText("feat/import-csv")).toBeInTheDocument();
  });

  it("Detalhes chama aoSelecionar", () => {
    const aoSelecionar = vi.fn();
    render(<Grade {...base} aoSelecionar={aoSelecionar} />);
    fireEvent.click(screen.getByRole("button", { name: "Detalhes de r7one-manager03-cc" }));
    expect(aoSelecionar).toHaveBeenCalledWith("r7one-manager03-cc");
  });

  it("filtra por status e mostra vazio quando ninguém bate", () => {
    render(<Grade {...base} />);
    fireEvent.click(screen.getByRole("radio", { name: /Trabalhando/ }));
    expect(nomes()).toEqual(["r7one-manager01-cc", "r7one-master"]);
    fireEvent.click(screen.getByRole("radio", { name: /Offline/ }));
    expect(screen.getByText("Nenhum agente offline")).toBeInTheDocument();
  });

  it("ordena por nome e por atividade", () => {
    render(<Grade {...base} />);
    fireEvent.change(screen.getByLabelText(/Ordenar por/), { target: { value: "nome" } });
    expect(nomes()[0]).toBe("r7one-manager01-cc");
    fireEvent.change(screen.getByLabelText(/Ordenar por/), { target: { value: "atividade" } });
    const soma = (n: string | null) => agentes.find((a) => a.agente === n)!.stats.atividade_14d.reduce((a, b) => a + b, 0);
    const s = nomes().map(soma);
    expect(s).toEqual([...s].sort((a, b) => b - a));
  });

  it("estado vazio", () => {
    render(<Grade {...base} agentes={[]} tarefas={[]} />);
    expect(screen.getByText("Nenhum agente neste projeto")).toBeInTheDocument();
  });

  it("atualiza quando o agente muda (delta do SSE aplicado pela página)", () => {
    const { rerender } = render(<Grade {...base} />);
    expect(screen.getByTestId("resumo-grade")).toHaveTextContent("2 trabalhando agora");
    rerender(<Grade {...base} agentes={agentes.map((a) => (a.agente === "r7one-manager03-cc" ? { ...a, status: "trabalhando" as const } : a))} />);
    expect(screen.getByTestId("resumo-grade")).toHaveTextContent("3 trabalhando agora");
  });

  it("barra de aprovação muda de cor com a taxa e agente sem veredito avisa", () => {
    const a0 = agentes[0];
    const mk = (apr: number, rej: number) => ({ ...a0, stats: { ...a0.stats, aprovadas_7d: apr, rejeitadas_7d: rej, entregas_7d: apr + rej } });
    const { rerender } = render(<Grade {...base} agentes={[mk(9, 1)]} />);
    expect(screen.getByTestId("barra-aprovacao")).toHaveStyle({ background: "#34d399" });
    rerender(<Grade {...base} agentes={[mk(3, 3)]} />);
    expect(screen.getByTestId("barra-aprovacao")).toHaveStyle({ background: "#fbbf24" });
    rerender(<Grade {...base} agentes={[mk(1, 4)]} />);
    expect(screen.getByTestId("barra-aprovacao")).toHaveStyle({ background: "#f87171" });
    rerender(<Grade {...base} agentes={[mk(0, 0)]} />);
    expect(screen.getByText(/Sem veredito/)).toBeInTheDocument();
  });
});

describe("dados da grade", () => {
  it("resumir, taxa e ordenar", () => {
    expect(resumir(agentes).total).toBe(5);
    expect(taxaAprovacao({ ...agentes[0], stats: { ...agentes[0].stats, aprovadas_7d: 0, rejeitadas_7d: 0 } })).toBeNull();
    expect(ordenar(agentes, "status")[0].status).toBe("trabalhando");
  });
});
