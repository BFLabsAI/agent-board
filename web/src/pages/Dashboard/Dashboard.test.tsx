import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cliente } from "../../api/cliente";
import { agentesFixture, mensagensFixture, resumoFixture, MASTER } from "../../api/fixtures";
import type { Agente, Mensagem } from "../../api/tipos";
import { FonteFalsa, mockarCliente, renderPainel } from "../../test/utils";
import { linhasDaTela, mesclarMensagens } from "./dados";

const ESC = String.fromCharCode(27);

function preparar(opcoes: { agentes?: Agente[]; mensagens?: Mensagem[]; atrasados?: number; integra?: boolean; alertas?: unknown[] } = {}) {
  mockarCliente();
  vi.spyOn(cliente, "agentes").mockImplementation(async () => opcoes.agentes ?? agentesFixture());
  vi.spyOn(cliente, "mensagens").mockImplementation(async () => ({ mensagens: opcoes.mensagens ?? mensagensFixture().slice(0, 12), mais: false }));
  vi.spyOn(cliente, "analytics").mockImplementation(async () => ({ alertas: opcoes.alertas ?? [] }) as never);
  vi.spyOn(cliente, "resumo").mockImplementation(async () => {
    const r = resumoFixture();
    if (opcoes.atrasados !== undefined) r.indicadores.atrasados = opcoes.atrasados;
    if (opcoes.integra === false) r.cadeia = { linhas: 10, integra: false, problemas: ["linha 7: hash não confere"] };
    return r;
  });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ alertas: opcoes.alertas ?? [] }), { status: 200 })));
}

beforeEach(() => {
  FonteFalsa.todas = [];
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Dashboard", () => {
  it("renderiza KPIs, cards dos agentes e atividade recente", async () => {
    preparar();
    renderPainel("/");
    expect(await screen.findByText("Pedidos abertos")).toBeInTheDocument();
    for (const a of agentesFixture()) expect(await screen.findByLabelText(`Agente ${a.agente}`)).toBeInTheDocument();
    const lista = await screen.findByRole("list", { name: "Atividade recente" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(12);
    expect(screen.getByRole("link", { name: /Ver Kanban/ })).toHaveAttribute("href", expect.stringContaining("/kanban"));
    expect(screen.getByRole("link", { name: /Ver tudo/ })).toHaveAttribute("href", expect.stringContaining("/feed"));
  });

  it("mostra a última linha da tela e os pendentes no card", async () => {
    const ag = agentesFixture();
    ag[1] = { ...ag[1], tela: `linha antiga\n${ESC}[32mrodando testes${ESC}[0m`, pendentes: 2 };
    preparar({ agentes: ag });
    renderPainel("/");
    const card = await screen.findByLabelText(`Agente ${ag[1].agente}`);
    expect(within(card).getByText("rodando testes")).toBeInTheDocument();
    expect(within(card).getByText("2 pendentes")).toBeInTheDocument();
  });

  it("estado vazio: sem agentes e sem mensagens", async () => {
    preparar({ agentes: [], mensagens: [], atrasados: 0 });
    renderPainel("/");
    expect(await screen.findByText("Nenhum agente cadastrado")).toBeInTheDocument();
    expect(await screen.findByText("Nenhuma atividade ainda")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Alertas" })).not.toBeInTheDocument();
  });

  it("faixa de alerta: cadeia quebrada, ping-pong e atrasados", async () => {
    const alerta = { de: MASTER, para: "r7one-manager01-cc", n: 15, janela_min: 10, ate: new Date().toISOString() };
    preparar({ atrasados: 2, integra: false, alertas: [alerta] });
    renderPainel("/");
    const faixa = await screen.findByRole("region", { name: "Alertas" });
    expect(await within(faixa).findByText(/Cadeia de hash não íntegra/)).toBeInTheDocument();
    expect(await within(faixa).findByText(/Ping-pong/)).toBeInTheDocument();
    expect(within(faixa).getByText(/2 tarefas atrasadas/)).toBeInTheDocument();
  });

  it("SSE: mensagem nova entra no topo e agente troca o card", async () => {
    preparar();
    renderPainel("/");
    const lista = await screen.findByRole("list", { name: "Atividade recente" });
    await waitFor(() => expect(FonteFalsa.todas.length).toBeGreaterThan(0));
    const fonte = FonteFalsa.todas[FonteFalsa.todas.length - 1];
    act(() => {
      fonte.emitir("mensagem", { id: "sse-1", ts: new Date(Date.now() + 1000).toISOString(), de: MASTER, para: "r7one-manager01-cc", tipo: "pedido", assunto: "Pedido ao vivo" });
    });
    await waitFor(() => expect(within(lista).getAllByRole("listitem")[0]).toHaveTextContent("Pedido ao vivo"));
    expect(within(lista).getAllByRole("listitem")).toHaveLength(12);

    const alvo = agentesFixture()[2];
    act(() => {
      fonte.emitir("agente", { ...alvo, status: "trabalhando", tarefa_atual: { id: "p-9", assunto: "Tarefa trocada", estado: "em_andamento" } });
    });
    const card = await screen.findByLabelText(`Agente ${alvo.agente}`);
    expect(within(card).getByText("Tarefa trocada")).toBeInTheDocument();
    expect(card.querySelector('[data-status="trabalhando"]')).not.toBeNull();
  });

  it("SSE: evento tarefa refaz o resumo", async () => {
    preparar();
    renderPainel("/");
    await screen.findByText("Pedidos abertos");
    await waitFor(() => expect(FonteFalsa.todas.length).toBeGreaterThan(0));
    const antes = vi.mocked(cliente.resumo).mock.calls.length;
    act(() => FonteFalsa.todas[FonteFalsa.todas.length - 1].emitir("tarefa", { id: "p-1", estado: "atrasado" }));
    await waitFor(() => expect(vi.mocked(cliente.resumo).mock.calls.length).toBeGreaterThan(antes));
  });
});

describe("Dashboard: sub-agents", () => {
  it("KPI de sub-agents rodando e chips aninhados no card do pai", async () => {
    preparar();
    renderPainel("/");
    const kpi = (await screen.findByText("Sub-agents rodando")).closest("div")!.parentElement as HTMLElement;
    const rodando = agentesFixture().flatMap((a) => a.subagentes).filter((x) => x.status === "rodando").length;
    expect(await within(kpi).findByText(String(rodando))).toBeInTheDocument();
    expect(within(kpi).getByText(/em 3 agentes/)).toBeInTheDocument();
    const card = await screen.findByLabelText("Agente r7one-manager01-cc");
    const chips = within(card).getByRole("list", { name: "Sub-agents rodando" });
    expect(within(chips).getAllByRole("listitem")).toHaveLength(2);
    expect(within(chips).getByText(/Backoff exponencial/)).toBeInTheDocument();
    // concluídos e com erro não viram chip
    const card2 = await screen.findByLabelText("Agente r7one-manager02-omp");
    expect(within(card2).getAllByRole("listitem")).toHaveLength(1);
  });

  it("SSE subagente atualiza chips e KPI", async () => {
    preparar();
    renderPainel("/");
    await screen.findByText("Sub-agents rodando");
    await waitFor(() => expect(FonteFalsa.todas.length).toBeGreaterThan(0));
    const base = agentesFixture().find((a) => a.agente === MASTER)!.subagentes[0];
    act(() => FonteFalsa.todas[FonteFalsa.todas.length - 1].emitir("subagente", { ...base, id: "live9", descricao: "Chip ao vivo", status: "rodando", fim: null, duracao_s: null }));
    expect(await screen.findByText(/Chip ao vivo/)).toBeInTheDocument();
    act(() => FonteFalsa.todas[FonteFalsa.todas.length - 1].emitir("subagente", { ...base, id: "live9", descricao: "Chip ao vivo", status: "concluido", duracao_s: 12 }));
    await waitFor(() => expect(screen.queryByText(/Chip ao vivo/)).not.toBeInTheDocument());
  });

  it("tolera agentes sem o campo subagentes", async () => {
    const sem = agentesFixture().map((a) => { const x = { ...a } as Partial<typeof a>; delete x.subagentes; return x as typeof a; });
    preparar({ agentes: sem });
    renderPainel("/");
    const kpi = (await screen.findByText("Sub-agents rodando")).closest("div")!.parentElement as HTMLElement;
    expect(await within(kpi).findByText("0")).toBeInTheDocument();
    expect(await screen.findByLabelText("Agente r7one-manager01-cc")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Sub-agents rodando" })).not.toBeInTheDocument();
  });
});

describe("helpers", () => {
  it("linhasDaTela tira ANSI e linhas vazias das pontas", () => {
    expect(linhasDaTela(`\n${ESC}[1mA${ESC}[0m\n\nB\n\n`)).toEqual(["A", "", "B"]);
    expect(linhasDaTela(null)).toEqual([]);
  });
  it("mesclarMensagens ordena, deduplica e limita", () => {
    const m = (id: string, ts: string): Mensagem => ({ id, ts, de: "a", para: "b", tipo: "nota" });
    const r = mesclarMensagens([m("1", "2026-01-01T00:00:01Z"), m("2", "2026-01-01T00:00:02Z")], [m("3", "2026-01-01T00:00:03Z"), m("1", "2026-01-01T00:00:01Z")], 2);
    expect(r.map((x) => x.id)).toEqual(["3", "2"]);
  });
});
