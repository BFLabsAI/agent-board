import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cliente } from "../../api/cliente";
import { agentesFixture, mensagensFixture, subagentesFixture, tarefasFixture } from "../../api/fixtures";
import type { Agente, SubAgente } from "../../api/tipos";
import { ProvedorPainel } from "../../context/ContextoPainel";
import { FonteFalsa, fabricaFalsa, mockarCliente, renderPainel } from "../../test/utils";
import Grade from "./Grade";
import Hub from "./Hub";
import Mapa from "./Mapa";
import { recortarSubs } from "./Mapa/layout";
import { formatarSegundos, mesclarSub, nomeSub, ordenarSubs, resumoTerminados, textoAtividade, textoDuracao } from "./subagentes";

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
  it("recorta em 3 com +N, e terminados viram resumo; formata duração", () => {
    const r = recortarSubs([1, 2, 3, 4, 5, 6].map((i) => sub(i)).concat([sub(7, { status: "concluido" })]));
    expect(r.mostradas).toHaveLength(3);
    expect(r.extra).toBe(3);
    expect(r.terminados).toHaveLength(1);
    expect(formatarSegundos(42)).toBe("42s");
    expect(formatarSegundos(312)).toBe("5m 12s");
    expect(formatarSegundos(3780)).toBe("1h 03m");
  });
});

describe("rótulos sem placeholder", () => {
  it("nome do sub-agent: campo nome, senão pelo harness do pai", () => {
    expect(nomeSub(sub(1, { nome: "subagent-omp" }))).toBe("subagent-omp");
    expect(nomeSub(sub(1, { agente: "r7one-manager02-omp" }))).toBe("subagent-omp");
    expect(nomeSub(sub(1, { agente: "r7one-manager02-cc" }))).toBe("subagent-cc");
    expect(nomeSub(sub(1, { agente: "r7one-master" }))).toBe("subagent-cc");
  });
  it("resumo de terminados conta concluídos e erros (perdido/rodando ficam fora)", () => {
    const l = [...Array.from({ length: 11 }, (_, i) => sub(i, { status: "concluido" })), sub(20, { status: "erro" }), sub(21), sub(22, { status: "perdido" })];
    expect(resumoTerminados(l)).toBe("✓ 11 concluídos · ✕ 1 erro");
    expect(resumoTerminados([sub(1)])).toBeNull();
    expect(resumoTerminados([sub(1, { status: "erro" })])).toBe("✕ 1 erro");
  });
  it("duração null não vira 0s; atividade ausente é null; início aproximado", () => {
    const fim = sub(1, { status: "concluido", duracao_s: null, fim: null, ultima_atividade: null });
    expect(textoDuracao(fim, Date.now())).toBeNull();
    expect(textoAtividade(fim)).toBeNull();
    const agora = Date.now();
    const ap = sub(2, { inicio_aproximado: true, inicio: new Date(agora - 12 * 60_000).toISOString() });
    expect(textoDuracao(ap, agora)).toBe("há ≥ 12 min");
    expect(textoDuracao(sub(3, { inicio_aproximado: true, inicio: new Date(agora - 3 * 3600_000).toISOString() }), agora)).toMatch(/^desde \d\d:\d\d$/);
  });
  it("card rodando sem descrição/atividade/duração não mostra placeholder; sem tipo mostra o nome", () => {
    const vazio = sub(1, { tipo: null, descricao: null, ultima_atividade: null, inicio_aproximado: true, inicio: new Date(Date.now() - 5 * 60_000).toISOString() });
    render(<Mapa {...base} agentes={comSubs([vazio, sub(2, { status: "concluido", tipo: null, descricao: null, ultima_atividade: null, duracao_s: null })])} />);
    const card = within(doc(M1)).getByTestId("sub-card");
    expect(card).toHaveTextContent("subagent-cc");
    expect(card).toHaveTextContent("há ≥ 5 min");
    expect(card.textContent).not.toMatch(/sem descrição|sem atividade|sem tipo|0s|desconhecido/);
    expect(within(card).queryByTestId("sub-atividade")).toBeNull();
    expect(within(card).queryByTestId("sub-tipo")).toBeNull();
    expect(doc(M1).textContent).not.toMatch(/sem descrição|sem atividade|0s/);
  });
  it("tipo aparece como detalhe secundário quando existe", () => {
    render(<Mapa {...base} agentes={comSubs([sub(1)])} />);
    expect(within(doc(M1)).getByTestId("sub-tipo")).toHaveTextContent("general-purpose");
  });
  it("terminados viram uma linha de resumo clicável que abre o pai", () => {
    const aoSelecionarSub = vi.fn();
    const l = [sub(1), sub(2, { status: "concluido", duracao_s: 3 }), sub(3, { status: "concluido", duracao_s: 3 }), sub(4, { status: "erro", duracao_s: 3 })];
    render(<Mapa {...base} agentes={comSubs(l)} aoSelecionarSub={aoSelecionarSub} />);
    expect(within(doc(M1)).getAllByTestId("sub-card")).toHaveLength(1);
    const r = within(doc(M1)).getByTestId("sub-resumo");
    expect(r).toHaveTextContent("✓ 2 concluídos · ✕ 1 erro");
    fireEvent.click(r);
    expect(aoSelecionarSub).toHaveBeenCalledWith(M1, expect.any(String));
  });
});

describe("Mapa com sub-agents", () => {
  it("mostra sub-cards sob o pai com tipo, descrição, status e atividade", () => {
    render(<Mapa {...base} agentes={agentesFixture()} />);
    const cards = within(doc(M1)).getAllByTestId("sub-card");
    expect(cards).toHaveLength(2);
    expect(cards.filter((c) => c.getAttribute("data-status") === "rodando")).toHaveLength(2);
    expect(cards[0]).toHaveTextContent(/subagent-cc/);
    expect(cards[0]).toHaveTextContent(/general-purpose/);
    expect(within(cards[0]).getByTestId("sub-atividade")).toHaveTextContent(/Bash|Edit/);
    // duas ligações em pulso (rodando) para esse pai
    expect(doc(M1).querySelectorAll("[data-pulso-sub]")).toHaveLength(2);
    // as ligações do organograma de agentes seguem 4
    expect(document.querySelectorAll("[data-ligacao]")).toHaveLength(4);
  });

  it("no máximo 3 por pai, mais o chip +N", () => {
    render(<Mapa {...base} agentes={comSubs([1, 2, 3, 4, 5, 6].map((i) => sub(i)))} />);
    expect(within(doc(M1)).getAllByTestId("sub-card")).toHaveLength(3);
    expect(within(doc(M1)).getByTestId("sub-mais")).toHaveTextContent("+3");
  });

  it("tolera subagentes ausente", () => {
    render(<Mapa {...base} agentes={comSubs(undefined)} />);
    expect(within(doc(M1)).queryAllByTestId("sub-card")).toHaveLength(0);
  });

  it("no modo Times os sub-agents ficam junto do pai", () => {
    render(<Mapa {...base} agentes={agentesFixture()} />);
    fireEvent.click(screen.getByRole("radio", { name: /Times/ }));
    expect(within(doc(M1)).getAllByTestId("sub-card")).toHaveLength(2);
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
    expect(tip).toHaveTextContent("subagent-cc");
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
    await waitFor(() => expect(within(doc(M1)).getAllByTestId("sub-card")).toHaveLength(Math.min(3, antes + 1)));
    expect(within(doc(M1)).getByText("Novo vindo do SSE")).toBeInTheDocument();
    act(() => fonte().emitir("subagente", sub(99, { descricao: "Novo vindo do SSE", status: "concluido", duracao_s: 12 })));
    // terminado sai dos cards e entra no resumo
    await waitFor(() => expect(doc(M1).querySelector("[data-sub='s99']")).toBeNull());
    expect(within(doc(M1)).getByTestId("sub-resumo")).toHaveTextContent(/✓ \d+ concluído/);
  });

  it("'ver todos' aparece com mais de 5 e carrega cliente.subagentes(24h)", async () => {
    const espiao = vi.spyOn(cliente, "subagentes").mockImplementation(async () => [...subagentesFixture().filter((x) => x.agente === M1), sub(50), sub(51), sub(52)]);
    vi.spyOn(cliente, "agentes").mockImplementation(async () => comSubs([1, 2, 3, 4, 5, 6, 7].map((i) => sub(i, { status: "concluido", duracao_s: 4 }))));
    renderPainel("/office?modo=grade");
    fireEvent.click(await screen.findByRole("button", { name: `Detalhes de ${M1}` }));
    const gaveta = await screen.findByTestId("gaveta");
    // terminados recolhidos por padrão
    expect(within(gaveta).queryAllByTestId("sub-item")).toHaveLength(0);
    fireEvent.click(within(gaveta).getByTestId("subs-terminados-toggle"));
    expect(within(gaveta).getAllByTestId("sub-item")).toHaveLength(5);
    fireEvent.click(within(gaveta).getByRole("button", { name: /ver todos/ }));
    await waitFor(() => expect(espiao).toHaveBeenCalled());
    expect(espiao.mock.calls[0][0]).toMatchObject({ agente: M1, periodo: "24h" });
    await waitFor(() => expect(within(gaveta).getAllByTestId("sub-item").length).toBeGreaterThan(5));
  });
});

describe("issues dos sub-agents no Office", () => {
  it("sub-card do Mapa mostra os chips de issue (sem link aninhado no botão)", () => {
    render(<Mapa {...base} agentes={comSubs([sub(1, { issues: [588, 587] })])} />);
    const card = within(doc(M1)).getByTestId("sub-card");
    expect(card).toHaveTextContent("#588");
    expect(card).toHaveTextContent("#587");
    expect(card.querySelector("a")).toBeNull();
  });
  it("tooltip do drone no Hub mostra as issues", () => {
    render(<Hub {...base} aoSelecionarSub={() => {}} agentes={comSubs([sub(1, { issues: [588] })])} />);
    fireEvent.mouseEnter(within(doc(M1)).getAllByTestId("drone")[0]);
    expect(screen.getByTestId("tooltip-sub")).toHaveTextContent("#588");
  });
  it("gaveta agrupa os terminados por issue e linka para a busca", async () => {
    const { Gaveta } = await import("./Gaveta");
    const agente = comSubs([
      sub(1, { issues: [587], status: "concluido", duracao_s: 5 }), sub(2, { issues: [587], status: "concluido", duracao_s: 5 }),
      sub(3, { issues: [588], status: "concluido", duracao_s: 5 }), sub(4, { issues: [], status: "concluido", duracao_s: 5 }),
    ]).find((a) => a.agente === M1)!;
    render(<MemoryRouter><ProvedorPainel fabricaStream={fabricaFalsa}><Gaveta agente={agente} tarefas={[]} aoFechar={() => {}} /></ProvedorPainel></MemoryRouter>);
    fireEvent.click(await screen.findByTestId("subs-terminados-toggle"));
    const grupos = Array.from(document.querySelectorAll("[data-grupo]")).map((g) => g.getAttribute("data-grupo"));
    expect(grupos).toEqual(["587", "588", "sem"]);
    const a = within(document.querySelector("[data-grupo='587']") as HTMLElement).getAllByText("#587")[0].closest("a");
    expect(a?.getAttribute("href")).toContain("/conversas?q=%23587");
  });
});
