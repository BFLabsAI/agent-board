import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cliente } from "../../api/cliente";
import { agentesFixture, mensagensFixture, subagentesFixture, tarefasFixture } from "../../api/fixtures";
import type { Agente, SubAgente } from "../../api/tipos";
import { FonteFalsa, mockarCliente, renderPainel } from "../../test/utils";
import Grade from "./Grade";
import Hub from "./Hub";
import Mapa from "./Mapa";
import { recortarSubs } from "./Mapa/layout";
import { formatarSegundos, mesclarSub, ordenarSubs } from "./subagentes";

const M1 = "r7one-manager01-cc";
const tarefas = tarefasFixture();
const base = { tarefas, selecionado: null, aoSelecionar: () => {} };
const doc = (n: string) => document.querySelector(`[data-agente='${n}']`) as HTMLElement;

function sub(i: number, p: Partial<SubAgente> = {}): SubAgente {
  return {
    id: `s${i}`, agente: M1, tipo: "general-purpose", descricao: `Tarefa ${i}`, status: "rodando", fundo: false,
    inicio: new Date(Date.now() - (60 - i) * 1000).toISOString(), fim: null, duracao_s: null,
    ultima_atividade: { ts: new Date().toISOString(), ferramenta: "Bash", resumo: `cmd ${i}` }, n_atividades: 2, tarefa: null, ...p,
  };
}
function comSubs(subs: SubAgente[] | undefined): Agente[] {
  return agentesFixture().map((a) => (a.agente === M1 ? ({ ...a, subagentes: subs } as Agente) : a));
}

describe("helpers de sub-agents", () => {
  it("ordena rodando primeiro e mescla por id", () => {
    const l = ordenarSubs([sub(1, { status: "concluido" }), sub(2), sub(3, { status: "erro" })]);
    expect(l[0].id).toBe("s2");
    const m = mesclarSub([sub(1), sub(2)], sub(1, { status: "concluido" }));
    expect(m).toHaveLength(2);
    expect(m.find((s) => s.id === "s1")?.status).toBe("concluido");
    expect(mesclarSub(m, sub(9))[0].id).toBe("s9");
  });
  it("recorta em 4 com +N e formata duração", () => {
    const r = recortarSubs([1, 2, 3, 4, 5, 6].map((i) => sub(i)));
    expect(r.mostradas).toHaveLength(4);
    expect(r.extra).toBe(2);
    expect(formatarSegundos(42)).toBe("42s");
    expect(formatarSegundos(312)).toBe("5m 12s");
    expect(formatarSegundos(3780)).toBe("1h 03m");
  });
});

describe("Mapa com sub-agents", () => {
  it("mostra sub-cards sob o pai com tipo, descrição, status e atividade", () => {
    render(<Mapa {...base} agentes={agentesFixture()} />);
    const cards = within(doc(M1)).getAllByTestId("sub-card");
    expect(cards).toHaveLength(3);
    expect(cards.filter((c) => c.getAttribute("data-status") === "rodando")).toHaveLength(2);
    expect(cards[0]).toHaveTextContent(/general-purpose/);
    expect(within(cards[0]).getByTestId("sub-atividade")).toHaveTextContent(/Bash|Edit/);
    // duas ligações em pulso (rodando) para esse pai
    expect(doc(M1).querySelectorAll("[data-pulso-sub]")).toHaveLength(2);
    // as ligações do organograma de agentes seguem 4
    expect(document.querySelectorAll("[data-ligacao]")).toHaveLength(4);
  });

  it("no máximo 4 por pai, mais o chip +N", () => {
    render(<Mapa {...base} agentes={comSubs([1, 2, 3, 4, 5, 6].map((i) => sub(i)))} />);
    expect(within(doc(M1)).getAllByTestId("sub-card")).toHaveLength(4);
    expect(within(doc(M1)).getByTestId("sub-mais")).toHaveTextContent("+2");
  });

  it("tolera subagentes ausente", () => {
    render(<Mapa {...base} agentes={comSubs(undefined)} />);
    expect(within(doc(M1)).queryAllByTestId("sub-card")).toHaveLength(0);
  });

  it("no modo Times os sub-agents ficam junto do pai", () => {
    render(<Mapa {...base} agentes={agentesFixture()} />);
    fireEvent.click(screen.getByRole("radio", { name: /Times/ }));
    expect(within(doc(M1)).getAllByTestId("sub-card")).toHaveLength(3);
  });

  it("clicar no sub-card chama aoSelecionarSub com pai e id", () => {
    const aoSelecionarSub = vi.fn();
    render(<Mapa {...base} agentes={comSubs([sub(1)])} aoSelecionarSub={aoSelecionarSub} />);
    fireEvent.click(within(doc(M1)).getByTestId("sub-card"));
    expect(aoSelecionarSub).toHaveBeenCalledWith(M1, "s1");
  });
});

describe("Hub com sub-agents", () => {
  const props = { ...base, aoSelecionarSub: () => {} };
  const drones = () => within(doc(M1)).queryAllByTestId("drone");

  it("um drone por sub-agent rodando, na mesa do pai", () => {
    render(<Hub {...props} agentes={agentesFixture()} />);
    expect(drones()).toHaveLength(2);
    expect(drones().every((d) => d.getAttribute("data-status") === "rodando")).toBe(true);
  });

  it("até 6 drones mais o badge +N", () => {
    render(<Hub {...props} agentes={comSubs([1, 2, 3, 4, 5, 6, 7, 8].map((i) => sub(i)))} />);
    expect(drones()).toHaveLength(6);
    expect(within(doc(M1)).getByTestId("drones-mais")).toHaveTextContent("+2");
  });

  it("hover no drone mostra tooltip com tipo, descrição e atividade", () => {
    render(<Hub {...props} agentes={comSubs([sub(1, { tipo: "Explore", descricao: "Achar usos" })])} />);
    fireEvent.mouseEnter(drones()[0]);
    const tip = screen.getByTestId("tooltip-sub");
    expect(tip).toHaveTextContent("Explore");
    expect(tip).toHaveTextContent("Achar usos");
    expect(tip).toHaveTextContent("Bash cmd 1");
    fireEvent.mouseLeave(drones()[0]);
    expect(screen.queryByTestId("tooltip-sub")).toBeNull();
  });

  it("ao terminar o drone pousa e some depois da animação", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(<Hub {...props} agentes={comSubs([sub(1)])} />);
      expect(drones()).toHaveLength(1);
      rerender(<Hub {...props} agentes={comSubs([sub(1, { status: "concluido", fim: new Date().toISOString(), duracao_s: 30 })])} />);
      expect(drones()).toHaveLength(1);
      expect(drones()[0]).toHaveAttribute("data-saindo");
      act(() => void vi.advanceTimersByTime(1200));
      expect(drones()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("drone com erro sai com flash", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(<Hub {...props} agentes={comSubs([sub(1)])} />);
      rerender(<Hub {...props} agentes={comSubs([sub(1, { status: "erro" })])} />);
      expect(drones()[0]).toHaveAttribute("data-status", "erro");
      expect(drones()[0].querySelector(".hub-drone-flash")).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Grade com sub-agents", () => {
  it("linha de sub-agents com rodando, hoje, mini-avatares e subagentes_7d", () => {
    render(<MemoryRouter><Grade {...base} agentes={agentesFixture()} /></MemoryRouter>);
    const card = doc(M1);
    expect(within(card).getByTestId("subs-resumo")).toHaveTextContent(/2\s*rodando/);
    expect(within(card).getByTestId("subs-avatares").querySelectorAll("[data-sub]")).toHaveLength(2);
    expect(within(card).getByTestId("subs-7d")).toHaveTextContent(String(agentesFixture()[1].stats.subagentes_7d));
  });
  it("tolera subagentes ausente", () => {
    render(<MemoryRouter><Grade {...base} agentes={comSubs(undefined)} /></MemoryRouter>);
    expect(within(doc(M1)).getByTestId("subs-resumo")).toHaveTextContent(/0\s*rodando/);
  });
});

describe("Office: gaveta e tempo real", () => {
  beforeEach(() => {
    FonteFalsa.todas = [];
    mockarCliente();
    vi.spyOn(cliente, "mensagens").mockImplementation(async (f) => ({
      mensagens: mensagensFixture().filter((m) => !f?.agente || m.de === f.agente || m.para === f.agente).slice(0, f?.limite ?? 100),
      mais: false,
    }));
  });
  afterEach(() => vi.restoreAllMocks());
  const fonte = () => FonteFalsa.todas[FonteFalsa.todas.length - 1];

  it("clicar no sub-card abre a gaveta do pai com o sub-agent em foco", async () => {
    renderPainel("/office?modo=mapa");
    const card = await screen.findAllByTestId("sub-card");
    const alvo = card.find((c) => c.closest("[data-agente]")?.getAttribute("data-agente") === M1)!;
    const id = alvo.getAttribute("data-sub")!;
    fireEvent.click(alvo);
    const gaveta = await screen.findByTestId("gaveta");
    expect(gaveta).toHaveAttribute("aria-label", expect.stringContaining(M1));
    const item = within(gaveta).getAllByTestId("sub-item").find((i) => i.getAttribute("data-sub") === id)!;
    expect(item).toHaveAttribute("data-foco", "true");
    expect(within(gaveta).getAllByTestId("duracao-sub").length).toBeGreaterThan(0);
  });

  it("mostra tarefa ligada como link e marca de segundo plano", async () => {
    renderPainel("/office?modo=grade");
    fireEvent.click(await screen.findByRole("button", { name: `Detalhes de ${M1}` }));
    const gaveta = await screen.findByTestId("gaveta");
    expect(within(gaveta).getByTestId("sub-fundo")).toHaveTextContent(/segundo plano/);
    const link = within(gaveta).getAllByRole("link").find((l) => l.getAttribute("href")?.includes("/conversas/p-0145"));
    expect(link).toBeTruthy();
  });

  it("evento SSE subagente atualiza o array do pai (insere, substitui por id)", async () => {
    renderPainel("/office?modo=mapa");
    await screen.findAllByTestId("sub-card");
    act(() => fonte().abrir());
    const antes = within(doc(M1)).getAllByTestId("sub-card").length;
    act(() => fonte().emitir("subagente", sub(99, { descricao: "Novo vindo do SSE" })));
    await waitFor(() => expect(within(doc(M1)).getAllByTestId("sub-card")).toHaveLength(Math.min(4, antes + 1)));
    expect(within(doc(M1)).getByText("Novo vindo do SSE")).toBeInTheDocument();
    act(() => fonte().emitir("subagente", sub(99, { descricao: "Novo vindo do SSE", status: "concluido", duracao_s: 12 })));
    await waitFor(() => expect(doc(M1).querySelector("[data-sub='s99']")).toHaveAttribute("data-status", "concluido"));
    expect(doc(M1).querySelectorAll("[data-sub='s99']")).toHaveLength(1);
  });

  it("'ver todos' aparece com mais de 5 e carrega cliente.subagentes(24h)", async () => {
    const espiao = vi.spyOn(cliente, "subagentes").mockImplementation(async () => [...subagentesFixture().filter((x) => x.agente === M1), sub(50), sub(51), sub(52)]);
    vi.spyOn(cliente, "agentes").mockImplementation(async () => comSubs([1, 2, 3, 4, 5, 6, 7].map((i) => sub(i))));
    renderPainel("/office?modo=grade");
    fireEvent.click(await screen.findByRole("button", { name: `Detalhes de ${M1}` }));
    const gaveta = await screen.findByTestId("gaveta");
    expect(within(gaveta).getAllByTestId("sub-item")).toHaveLength(5);
    fireEvent.click(within(gaveta).getByRole("button", { name: /ver todos/ }));
    await waitFor(() => expect(espiao).toHaveBeenCalled());
    expect(espiao.mock.calls[0][0]).toMatchObject({ agente: M1, periodo: "24h" });
    await waitFor(() => expect(within(gaveta).getAllByTestId("sub-item").length).toBeGreaterThan(5));
  });
});
