import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsFixture, resumoFixture } from "../../api/fixtures";
import { cliente } from "../../api/cliente";
import type { Analytics as Dados, Mensagem } from "../../api/tipos";
import { ProvedorPainel } from "../../context/ContextoPainel";
import { FonteFalsa, fabricaFalsa } from "../../test/utils";
import { aplicarMensagem, calcularKpis, montarHeatmap, nivelHeat } from "./calculos";
import Analytics, { DEBOUNCE_MS } from "./index";

const AGORA = Date.parse("2026-10-20T15:00:00Z");

function vazio(): Dados {
  return { heatmap: [], ultimos_30d: [], horas: Array(24).fill(0), por_agente: [], tipos: [], alertas: [] };
}

function montar() {
  return render(
    <MemoryRouter initialEntries={["/analytics"]}>
      <ProvedorPainel fabricaStream={fabricaFalsa}>
        <Analytics />
      </ProvedorPainel>
    </MemoryRouter>,
  );
}

function msg(over: Partial<Mensagem> = {}): Mensagem {
  const dia = new Date(AGORA).toISOString().slice(0, 10);
  return { id: "x1", ts: `${dia}T10:05:00+00:00`, de: "r7one-master-cc", para: "r7one-manager01-cc", tipo: "pedido", ...over };
}

beforeEach(() => {
  FonteFalsa.todas = [];
  vi.spyOn(cliente, "projetos").mockResolvedValue([]);
  vi.spyOn(cliente, "resumo").mockImplementation(async () => resumoFixture());
  vi.spyOn(cliente, "analytics").mockImplementation(async () => analyticsFixture(AGORA));
});
afterEach(() => vi.restoreAllMocks());

describe("Analytics: render", () => {
  it("mostra cabeçalho, KPIs, heatmap e card dos 30 dias", async () => {
    montar();
    expect(await screen.findByText("Atividade nas últimas 52 semanas")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Analytics" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Recarregar/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Exportar/ })).toBeEnabled();
    expect(screen.getByTestId("relogio")).toBeInTheDocument();
    const kpis = screen.getAllByTestId("kpi");
    expect(kpis).toHaveLength(5);
    expect(screen.getByText("Agentes ativos")).toBeInTheDocument();
    expect(screen.getAllByTestId("celula-heat").length).toBe(371);
    expect(screen.getAllByTestId("barra-dia")).toHaveLength(30);
    expect(screen.getByText("Dia de pico")).toBeInTheDocument();
    expect(screen.getByText("Menos")).toBeInTheDocument();
  });

  it("tooltip do heatmap mostra dia e quantidade", async () => {
    montar();
    const celulas = await screen.findAllByTestId("celula-heat");
    const c = celulas[celulas.length - 1];
    fireEvent.mouseEnter(c);
    const dica = screen.getByRole("tooltip");
    expect(dica).toHaveTextContent(/mensage/);
    expect(dica).toHaveTextContent(String(c.getAttribute("data-n")));
  });

  it("estado vazio quando não há atividade", async () => {
    vi.spyOn(cliente, "analytics").mockResolvedValue({ ...vazio(), heatmap: [{ dia: "2026-10-20", n: 0 }], ultimos_30d: [{ dia: "2026-10-20", mensagens: 0, entregas: 0, aprovadas: 0, rejeitadas: 0 }] });
    montar();
    expect(await screen.findByText("Ainda sem atividade")).toBeInTheDocument();
  });

  it("erro de carregamento", async () => {
    vi.spyOn(cliente, "analytics").mockRejectedValue(new Error("falhou feio"));
    montar();
    expect(await screen.findByText("falhou feio")).toBeInTheDocument();
  });
});

describe("Analytics: abas", () => {
  it("troca entre Atividade, Agentes e Qualidade", async () => {
    const u = userEvent.setup();
    montar();
    expect(await screen.findByText("Tipos de mensagem")).toBeInTheDocument();
    await u.click(screen.getByRole("radio", { name: "Agentes" }));
    expect(screen.getByText("Detalhe por agente")).toBeInTheDocument();
    expect(screen.getAllByTestId("rank-tempo").length).toBeGreaterThan(0);
    await u.click(screen.getByRole("radio", { name: "Qualidade" }));
    expect(screen.getByText("Alertas de ping-pong")).toBeInTheDocument();
    expect(screen.getAllByTestId("alerta-pingpong")).toHaveLength(1);
    expect(screen.getByText("14 mensagens")).toBeInTheDocument();
    expect(screen.getAllByTestId("taxa-rejeicao").length).toBeGreaterThan(0);
  });

  it("qualidade sem alertas mostra estado vazio", async () => {
    vi.spyOn(cliente, "analytics").mockImplementation(async () => ({ ...analyticsFixture(AGORA), alertas: [] }));
    const u = userEvent.setup();
    montar();
    await u.click(await screen.findByRole("radio", { name: "Qualidade" }));
    expect(screen.getByText("Nenhum ping-pong detectado")).toBeInTheDocument();
  });
});

describe("Analytics: exportar", () => {
  it("baixa o JSON via Blob, sem chamar o servidor", async () => {
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => (blobs.push(b as Blob), "blob:x"));
    URL.revokeObjectURL = vi.fn();
    const clique = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const u = userEvent.setup();
    montar();
    await u.click(await screen.findByRole("button", { name: /Exportar/ }));
    expect(clique).toHaveBeenCalled();
    expect(blobs).toHaveLength(1);
    const json = JSON.parse(await blobs[0].text());
    expect(json.heatmap).toHaveLength(371);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");
  });
});

describe("Analytics: ao vivo", () => {
  it("evento mensagem incrementa o dia na hora e refaz o REST em 5 s", async () => {
    montar();
    await screen.findByText("Atividade nas últimas 52 semanas");
    const antes = screen.getAllByTestId("celula-heat");
    const hoje = new Date(AGORA).toISOString().slice(0, 10);
    const nAntes = Number(antes.find((c) => c.getAttribute("data-dia") === hoje)?.getAttribute("data-n"));
    const chamadas = vi.mocked(cliente.analytics).mock.calls.length;

    vi.useFakeTimers({ shouldAdvanceTime: true });
    act(() => FonteFalsa.todas[0].emitir("mensagem", msg()));
    const depois = screen.getAllByTestId("celula-heat").find((c) => c.getAttribute("data-dia") === hoje);
    expect(Number(depois?.getAttribute("data-n"))).toBe(nAntes + 1);
    expect(vi.mocked(cliente.analytics).mock.calls.length).toBe(chamadas);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 50);
    });
    vi.useRealTimers();
    await waitFor(() => expect(vi.mocked(cliente.analytics).mock.calls.length).toBe(chamadas + 1));
  });
});

describe("calculos", () => {
  it("calcularKpis", () => {
    const a = analyticsFixture(AGORA);
    const k = calcularKpis(a);
    expect(k.mensagens).toBe(a.ultimos_30d.reduce((s, d) => s + d.mensagens, 0));
    expect(k.mediaDia).toBeCloseTo(k.mensagens / 30);
    expect(k.taxaAprovacao === null || (k.taxaAprovacao >= 0 && k.taxaAprovacao <= 1)).toBe(true);
    expect(calcularKpis(vazio()).taxaAprovacao).toBeNull();
  });

  it("nivelHeat e posicionamento da grade", () => {
    expect(nivelHeat(0, 10)).toBe(0);
    expect(nivelHeat(1, 10)).toBe(1);
    expect(nivelHeat(10, 10)).toBe(4);
    // 2026-10-18 é domingo: linha 0, coluna 0
    const dias = Array.from({ length: 8 }, (_, i) => ({ dia: `2026-10-${18 + i}`, n: i }));
    const g = montarHeatmap(dias);
    expect(g.celulas.map((c) => [c.col, c.linha])).toEqual([[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [1, 0]]);
    expect(g.colunas).toBe(2);
  });

  it("aplicarMensagem conta entrega, veredito e não muta", () => {
    const a = analyticsFixture(AGORA);
    const copia = JSON.stringify(a);
    const hoje = a.ultimos_30d[a.ultimos_30d.length - 1];
    const b = aplicarMensagem(a, msg({ tipo: "resposta", veredito: "rejeitado", para: a.por_agente[1].agente }));
    expect(JSON.stringify(a)).toBe(copia);
    const h2 = b.ultimos_30d[b.ultimos_30d.length - 1];
    expect(h2.mensagens).toBe(hoje.mensagens + 1);
    expect(h2.rejeitadas).toBe(hoje.rejeitadas + 1);
    expect(b.horas[10]).toBe(a.horas[10] + 1);
    expect(b.tipos.find((t) => t.tipo === "resposta")?.n).toBe((a.tipos.find((t) => t.tipo === "resposta")?.n ?? 0) + 1);
  });
});
