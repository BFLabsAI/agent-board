import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cliente } from "../../api/cliente";
import { projetosFixture, workflowsFixture } from "../../api/fixtures";
import type { Workflows as TWorkflows } from "../../api/tipos";
import { ProvedorPainel } from "../../context/ContextoPainel";
import { FonteFalsa, fabricaFalsa } from "../../test/utils";
import { ALT_SUB, LARGURA, agentesDoSub, agruparIssues, caminhoDe, chipDoTipo, colunasDoGrafo, filtroFluxos, layoutGrafo, maxCharsRotulo, posicionarTooltip, subsPorAgente } from "./derivar";
import Workflows from ".";

function montar() {
  return render(
    <MemoryRouter initialEntries={["/workflows"]}>
      <ProvedorPainel fabricaStream={fabricaFalsa}>
        <Workflows />
      </ProvedorPainel>
    </MemoryRouter>,
  );
}

const vazio: TWorkflows = {
  nos: [],
  arestas: [],
  comunicacao: [],
  fluxos: [],
  kpis: { conversas: 0, taxa_aprovacao: null, tempo_ate_entrega_p50_min: null, fluxo_mais_comum: null, msgs_por_conversa: null, subagentes: 0 },
};

let espiao: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  FonteFalsa.todas = [];
  vi.spyOn(cliente, "projetos").mockImplementation(async () => projetosFixture());
  espiao = vi.spyOn(cliente, "workflows").mockImplementation(async () => workflowsFixture());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("tela Workflows", () => {
  it("renderiza cabeçalho, KPIs, grafos e fluxos com fixtures", async () => {
    montar();
    expect(await screen.findByRole("heading", { level: 1, name: "Workflows" })).toBeInTheDocument();
    expect(screen.getByText("Inteligência de orquestração do time")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId("kpi")).toHaveLength(7));
    const kpis = screen.getAllByTestId("kpi");
    expect(within(kpis[1]).getByText("82%")).toBeInTheDocument();
    expect(within(kpis[2]).getByText("58 min")).toBeInTheDocument();
    expect(within(kpis[4]).getByText(/pedido → andamento/)).toHaveAttribute("title", expect.stringContaining("→"));
    expect(within(kpis[5]).getByText("5")).toBeInTheDocument();
    expect(await screen.findByTestId("grafo-orquestracao")).toBeInTheDocument();
    expect(screen.getByTestId("grafo-comunicacao")).toBeInTheDocument();
    expect(screen.getAllByTestId("fluxo")).toHaveLength(3);
    expect(screen.getByTestId("atualizado")).toHaveTextContent(/Atualizado às \d{2}:\d{2}:\d{2}/);
    expect(screen.getByRole("radio", { name: "7 dias" })).toBeInTheDocument();
  });

  it("os grafos têm largura mínima e rolagem horizontal em vez de encolher", async () => {
    montar();
    for (const [id, min] of [["grafo-orquestracao", "min-w-[900px]"], ["grafo-comunicacao", "min-w-[760px]"]]) {
      const svg = await screen.findByTestId(id);
      expect(svg.getAttribute("class")).toContain(min);
      expect(svg.closest("[data-rolagem-x]")).not.toBeNull();
    }
  });

  it("estado vazio", async () => {
    espiao.mockImplementation(async () => vazio);
    montar();
    expect(await screen.findByText("Nenhuma conversa no período")).toBeInTheDocument();
    expect(screen.queryByTestId("grafo-orquestracao")).not.toBeInTheDocument();
  });

  it("erro da API", async () => {
    espiao.mockImplementation(async () => {
      throw new Error("falhou feio");
    });
    montar();
    expect(await screen.findByText("falhou feio")).toBeInTheDocument();
  });

  it("clicar num nó mostra o detalhe e filtra as outras seções", async () => {
    montar();
    const aprovado = await screen.findByRole("button", { name: "Aprovado: 2" });
    await userEvent.click(aprovado);
    expect(screen.getByTestId("detalhe-no")).toHaveTextContent("RESULTADO");
    expect(screen.getByTestId("filtro-ativo")).toHaveTextContent("Aprovado");
    expect(screen.getAllByTestId("fluxo")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Limpar filtro" }));
    expect(screen.queryByTestId("detalhe-no")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("fluxo")).toHaveLength(3);
  });

  it("clicar num agente destaca suas arestas na comunicação", async () => {
    montar();
    const gm = await screen.findByTestId("grafo-comunicacao");
    await userEvent.click(within(gm).getByRole("button", { name: /manager01-cc/ }));
    const arestas = gm.querySelectorAll("[data-aresta]");
    const apagadas = [...arestas].filter((a) => a.getAttribute("opacity") === "0.08");
    expect(arestas.length).toBe(6);
    expect(apagadas.length).toBe(4);
  });

  it("mensagem ao vivo refaz o REST com debounce de 3 s", async () => {
    montar();
    await screen.findByTestId("grafo-orquestracao");
    expect(espiao).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();
    const msg = { id: "x", ts: new Date().toISOString(), de: "a", para: "b", tipo: "andamento", assunto: "s" };
    act(() => {
      FonteFalsa.todas[0].emitir("mensagem", msg);
      FonteFalsa.todas[0].emitir("mensagem", msg);
    });
    act(() => void vi.advanceTimersByTime(2900));
    expect(espiao).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(200));
    expect(espiao).toHaveBeenCalledTimes(2);
  });
});

describe("derivar", () => {
  it("agrupa o excedente de issues em +N mais", () => {
    const nos = [
      { id: "m", coluna: "manager" as const, rotulo: "m", n: 12 },
      ...Array.from({ length: 11 }, (_, i) => ({ id: `#${i}`, coluna: "issue" as const, rotulo: `#${i}`, n: 20 - i })),
      { id: "revisao", coluna: "revisao" as const, rotulo: "Revisão", n: 11 },
    ];
    const arestas = [
      ...nos.filter((n) => n.coluna === "issue").flatMap((n) => [
        { de: "m", para: n.id, n: 1 },
        { de: n.id, para: "revisao", n: 1 },
      ]),
    ];
    const r = agruparIssues(nos, arestas);
    expect(r.nos.filter((n) => n.coluna === "issue")).toHaveLength(9);
    const mais = r.nos.find((n) => n.rotulo === "+3 mais")!;
    expect(mais.n).toBe(12 + 11 + 10);
    expect(r.arestas.find((a) => a.para === mais.id)?.n).toBe(3);
    expect(r.arestas.find((a) => a.de === mais.id)?.n).toBe(3);
  });

  it("caminho, filtro e chips", () => {
    const a = [{ de: "x", para: "y", n: 1 }, { de: "y", para: "z", n: 1 }, { de: "x", para: "w", n: 1 }];
    const c = caminhoDe("y", a);
    expect([...c.nos].sort()).toEqual(["x", "y", "z"]);
    expect(c.arestas.has("x>w")).toBe(false);
    expect(filtroFluxos({ id: "rejeitado", coluna: "resultado" })?.(["pedido", "resposta:rejeitado"])).toBe(true);
    expect(filtroFluxos({ id: "atrasado", coluna: "resultado" })).toBeNull();
    expect(chipDoTipo("resposta:rejeitado").chave).toBe("rejeicao");
  });
});

describe("Workflows: sub-agents", () => {
  it("faixa SUB-AGENTS, arestas tracejadas, legenda e KPI", async () => {
    montar();
    const g = await screen.findByTestId("grafo-orquestracao");
    expect(within(g).getByText("SUB-AGENTS")).toBeInTheDocument();
    expect(g.querySelector('[data-no="sub:Explore"]')).not.toBeNull();
    const tracejadas = g.querySelectorAll('[data-tipo-aresta="subagente"]');
    expect(tracejadas.length).toBe(7);
    tracejadas.forEach((p) => expect(p.getAttribute("stroke-dasharray")).toBe("5 4"));
    expect(g.querySelector('[data-aresta="r7one-master>r7one-manager01-cc"]')?.getAttribute("stroke-dasharray")).toBeNull();
    expect(within(screen.getByRole("list", { name: "Legenda" })).getByText("Sub-agent")).toBeInTheDocument();
    const kpi = screen.getByText("Sub-agents", { selector: "span" }).closest('[data-testid="kpi"]') as HTMLElement;
    expect(within(kpi).getByText("62")).toBeInTheDocument();
  });

  it("clicar num sub-agent destaca os agentes que o usam", async () => {
    montar();
    const g = await screen.findByTestId("grafo-orquestracao");
    await userEvent.click(g.querySelector('[data-no="sub:task"]') as Element);
    const detalhe = await screen.findByTestId("usado-por");
    expect(detalhe).toHaveTextContent("manager02-omp");
    const aresta = (k: string) => g.querySelector(`[data-aresta="${k}"]`)!;
    expect(aresta("r7one-manager02-omp>sub:task").getAttribute("opacity")).toBe("0.85");
    expect(aresta("r7one-manager01-cc>sub:general-purpose").getAttribute("opacity")).toBe("0.07");
  });

  it("tolera JSON sem nós de sub-agent nem kpis.subagentes", async () => {
    espiao.mockImplementation(async () => {
      const w = workflowsFixture();
      const k = { ...w.kpis } as Partial<TWorkflows["kpis"]>;
      delete k.subagentes;
      return { ...w, kpis: k as TWorkflows["kpis"], nos: w.nos.filter((n) => n.coluna !== "subagente"), arestas: w.arestas.filter((a) => !a.para.startsWith("sub:")) };
    });
    montar();
    const g = await screen.findByTestId("grafo-orquestracao");
    expect(within(g).queryByText("SUB-AGENTS")).toBeNull();
    expect(g.querySelector("[data-no]")).not.toBeNull();
  });

  it("derivar: colunas condicionais e agentes de um tipo", () => {
    expect(colunasDoGrafo()).toHaveLength(5);
    const r = agentesDoSub("sub:x", [{ de: "a", para: "sub:x", n: 1 }, { de: "b", para: "sub:y", n: 1 }, { de: "m", para: "a", n: 1 }]);
    expect([...r.nos].sort()).toEqual(["a", "sub:x"]);
    expect(caminhoDe("sub:x", [{ de: "m", para: "a", n: 1 }, { de: "a", para: "sub:x", n: 1 }]).nos.has("m")).toBe(true);
  });
});

describe("Workflows: layout sem sobreposição", () => {
  const nos = [
    { id: "m", coluna: "master" as const, rotulo: "master", n: 5 },
    { id: "a", coluna: "manager" as const, rotulo: "manager01-omp31", n: 31 },
    { id: "b", coluna: "manager" as const, rotulo: "manager02-omp1", n: 1 },
    { id: "#1", coluna: "issue" as const, rotulo: "#1", n: 3 },
    { id: "revisao", coluna: "revisao" as const, rotulo: "Revisão", n: 3 },
    { id: "sub:subagent-cc", coluna: "subagente" as const, rotulo: "subagent-cc", n: 16 },
    { id: "sub:subagent-omp", coluna: "subagente" as const, rotulo: "subagent-omp", n: 4 },
  ];
  const cruza = (p: { x: number; y: number; w: number; h: number }, q: typeof p) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;

  it("sub-agents ficam numa faixa abaixo, fora das colunas principais, sem sobrepor nós", () => {
    const l = layoutGrafo(nos);
    expect(l.pos.some((p) => p.coluna === "subagente")).toBe(false);
    expect(l.subPos).toHaveLength(2);
    const fim = Math.max(...l.pos.map((p) => p.y + p.h));
    for (const s of l.subPos) {
      expect(s.y).toBeGreaterThan(fim);
      expect(s.h).toBe(ALT_SUB);
      expect(s.x + s.w).toBeLessThanOrEqual(LARGURA);
    }
    const todos = [...l.pos, ...l.subPos];
    for (let i = 0; i < todos.length; i++) for (let j = i + 1; j < todos.length; j++) expect(cruza(todos[i], todos[j])).toBe(false);
    expect(l.altura).toBeGreaterThan(l.alturaGrafo);
    expect(layoutGrafo(nos.filter((n) => n.coluna !== "subagente")).faixa).toBeNull();
  });

  it("contagem por agente (master incluído) e rótulo que não invade o badge", () => {
    const m = subsPorAgente([{ de: "m", para: "sub:subagent-cc", n: 2 }, { de: "m", para: "sub:subagent-omp", n: 1 }, { de: "a", para: "#1", n: 9 }]);
    expect(m.get("m")).toBe(3);
    expect(m.has("a")).toBe(false);
    const l = layoutGrafo(nos);
    for (const p of l.pos) {
      const n = formatarNumeroTeste(p.n);
      expect(maxCharsRotulo(p.w, n) * 7.2 + 12 + 4 + (Math.max(26, n.length * 7 + 12) + 8)).toBeLessThanOrEqual(p.w + 7.2);
    }
    expect(maxCharsRotulo(156, "31")).toBeGreaterThanOrEqual("manager01-omp".length);
  });

  it("posicionarTooltip nunca sai do card", () => {
    const caixa = { w: 800, h: 400 };
    const tip = { w: 220, h: 26 };
    for (const [x, y] of [[0, 0], [799, 399], [790, 5], [5, 395], [400, 200]]) {
      const r = posicionarTooltip({ x, y }, caixa, tip);
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.top).toBeGreaterThanOrEqual(0);
      expect(r.left + tip.w).toBeLessThanOrEqual(caixa.w);
      expect(r.top + tip.h).toBeLessThanOrEqual(caixa.h);
    }
    expect(posicionarTooltip({ x: 400, y: 200 }, caixa, tip)).toEqual({ left: 414, top: 214 });
  });

  it("tooltip da aresta aparece perto do ponteiro, não como title solto", async () => {
    montar();
    const g = await screen.findByTestId("grafo-orquestracao");
    const hit = g.querySelector("[data-hit]") as Element;
    expect(hit.querySelector("title")).toBeNull();
    await userEvent.hover(hit);
    expect(await screen.findByTestId("tooltip-aresta")).toHaveTextContent("→");
    await userEvent.unhover(hit);
    expect(screen.queryByTestId("tooltip-aresta")).toBeNull();
  });

  it("rótulos de sub-agent por harness (genérico) e selo no agente, sem 'desconhecido'", async () => {
    espiao.mockImplementation(async () => {
      const w = workflowsFixture();
      return {
        ...w,
        nos: [...w.nos.filter((n) => n.coluna !== "subagente"), { id: "sub:subagent-cc", coluna: "subagente", rotulo: "subagent-cc", n: 7 }, { id: "sub:subagent-omp", coluna: "subagente", rotulo: "subagent-omp", n: 2 }],
        arestas: [...w.arestas.filter((a) => !a.para.startsWith("sub:")), { de: "r7one-master", para: "sub:subagent-cc", n: 7 }, { de: "r7one-master", para: "sub:subagent-omp", n: 2 }],
      };
    });
    montar();
    const g = await screen.findByTestId("grafo-orquestracao");
    expect(g.querySelectorAll('[data-no^="sub:"]')).toHaveLength(2);
    expect(within(g).getByRole("button", { name: "subagent-omp: 2" })).toBeInTheDocument();
    expect(within(g).queryByText(/desconhecido/)).toBeNull();
    expect(g.querySelector('[data-satelite="r7one-master"]')).toHaveTextContent("9");
  });
});

function formatarNumeroTeste(n: number) {
  return String(n);
}
