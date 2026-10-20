import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cliente } from "../../../api/cliente";
import { mensagensFixture, responderFixture, squadsDoWorkspace, workspaceFixture, WORKSPACE_LOCAL } from "../../../api/fixtures";
import type { Geral } from "../../../api/tipos";
import { FonteFalsa, mockarCliente, mockarWorkspaces, renderPainel } from "../../../test/utils";
import { colunasPiso, layoutPredio } from "./layout";

const LENTO = 30000;

beforeEach(() => {
  FonteFalsa.todas = [];
  mockarCliente();
  mockarWorkspaces("varios");
  vi.spyOn(cliente, "geral").mockImplementation(
    async (c) => responderFixture(c?.workspace ? `/api/w/${c.workspace}/api/geral` : "/api/geral", { periodo: c?.periodo }) as Geral,
  );
  vi.spyOn(cliente, "mensagens").mockImplementation(async () => ({ mensagens: mensagensFixture().slice(0, 3), mais: false }));
  vi.spyOn(cliente, "subagentes").mockImplementation(async () => []);
});
afterEach(() => vi.restoreAllMocks());

const fonte = () => FonteFalsa.todas.filter((f) => f.url === "/api/stream?workspace=*").at(-1)!;
const piso = (ws: string) => document.querySelector(`[data-testid="piso"][data-workspace="${ws}"]`) as HTMLElement;
const sala = (ws: string, p: string) => document.querySelector(`[data-testid="sala"][data-workspace="${ws}"][data-squad="${p}"]`) as HTMLElement;

async function abrir(rota = "/office?modo=predio") {
  renderPainel(rota);
  await screen.findAllByTestId("sala");
  await waitFor(() => expect(FonteFalsa.todas.some((f) => f.url === "/api/stream?workspace=*")).toBe(true));
  act(() => fonte().abrir());
}
/** evento de mensagem de um squad de um Workspace (agentes reais do fixture) */
function msg(ws: string, i = 0, extra: Record<string, unknown> = {}) {
  const sq = squadsDoWorkspace(ws)[i];
  return { id: `m-${ws}-${i}-${Math.random()}`, ts: new Date().toISOString(), de: sq.agentes[1].agente, para: sq.agentes[0].agente, tipo: "andamento", assunto: "Pulso do prédio", projeto: sq.projeto, workspace: ws, ...extra };
}

describe("layout do prédio", () => {
  it("até 3 salas em fila, 4 em 2 colunas, andares empilhados", () => {
    expect([0, 1, 2, 3, 4, 5, 7].map(colunasPiso)).toEqual([1, 1, 2, 3, 2, 3, 3]);
    const l = layoutPredio([{ salas: 3, maxOutros: 4 }, { salas: 0, maxOutros: 0 }, { salas: 2, maxOutros: 3 }]);
    expect(l.pisos).toHaveLength(3);
    expect(l.pisos[1].y).toBeGreaterThan(l.pisos[0].y + l.pisos[0].h);
    expect(l.pisos[1].salas).toHaveLength(0);
    expect(l.pisos[0].salas).toHaveLength(3);
    expect(l.pisos[0].salas[0].y).toBe(l.pisos[0].salas[1].y);
    expect(l.h).toBeGreaterThan(l.pisos[2].y);
  });
});

describe("layout do prédio em grade", () => {
  it("2 colunas põe os andares lado a lado e reduz a altura", () => {
    const e = [{ salas: 3, maxOutros: 4 }, { salas: 3, maxOutros: 4 }, { salas: 0, maxOutros: 0 }, { salas: 2, maxOutros: 3 }];
    const torre = layoutPredio(e, 1);
    const grade = layoutPredio(e, 2);
    expect(grade.colunas).toBe(2);
    expect(grade.pisos[1].x).toBeGreaterThan(grade.pisos[0].x + grade.largura - 1);
    expect(grade.pisos[1].y).toBe(grade.pisos[0].y);
    expect(grade.pisos[2].y).toBeGreaterThan(grade.pisos[0].y);
    expect(grade.h).toBeLessThan(torre.h);
    expect(grade.w).toBeGreaterThan(torre.w);
  });
});

describe("Office, modo Prédio", () => {
  it("renderiza um andar por Workspace dos fixtures, com as salas dos squads e o stream workspace=*", async () => {
    await abrir();
    expect(screen.getAllByTestId("piso").map((p) => p.getAttribute("data-workspace"))).toEqual([WORKSPACE_LOCAL, "bf-labs", "aura-bios", "itarget"]);
    expect(within(piso(WORKSPACE_LOCAL)).getAllByTestId("sala")).toHaveLength(3);
    expect(within(piso("bf-labs")).getAllByTestId("sala").map((s) => s.getAttribute("data-squad"))).toEqual(["bf-marketing", "bf-ads", "bf-sites"]);
    expect(within(piso("itarget")).getAllByTestId("sala")).toHaveLength(2);
    expect(within(piso("bf-labs")).getByTestId("placa-andar")).toHaveTextContent("BF Labs");
    expect(within(piso("bf-labs")).getByTestId("selo-andar")).toHaveAttribute("data-saude", workspaceFixture("bf-labs").saude);
    expect(within(piso("bf-labs")).getByTestId("latencia-andar")).toHaveTextContent("38 ms");
    expect(within(piso(WORKSPACE_LOCAL)).getByTestId("placa-andar")).toHaveTextContent("este painel");
    expect(FonteFalsa.todas.filter((f) => !f.fechada && f.url.includes("workspace=*"))).toHaveLength(1);
    expect(screen.getByRole("radio", { name: /Prédio/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Workspace" })).toHaveTextContent("Todos os workspaces");
    expect(screen.getByTestId("resumo-predio")).toHaveTextContent("3 online");
    expect(screen.getByTestId("resumo-predio")).toHaveTextContent("1 offline");
  }, LENTO);

  it("Workspace offline: andar escuro, com 'offline' e sem salas nem agentes", async () => {
    await abrir();
    const aura = piso("aura-bios");
    expect(aura).toHaveAttribute("data-online", "false");
    expect(within(aura).getByTestId("piso-offline")).toHaveTextContent("offline");
    expect(within(aura).getByTestId("selo-andar")).toHaveTextContent("Offline");
    expect(within(aura).queryAllByTestId("sala")).toHaveLength(0);
    expect(within(aura).queryAllByTestId("mesa")).toHaveLength(0);
    expect(within(aura).getByTestId("placa-andar")).not.toHaveAttribute("role", "link");
  });

  it("Workspace desatualizado mostra 'atualize o agent-board' e a versão na placa", async () => {
    await abrir();
    const it_ = piso("itarget");
    expect(within(it_).getByTestId("aviso-desatualizado-andar")).toHaveTextContent("atualize o agent-board");
    expect(within(it_).getByTestId("versao-andar")).toHaveTextContent("v1.12.0");
    expect(within(piso("bf-labs")).queryByTestId("aviso-desatualizado-andar")).toBeNull();
  });

  it("mensagem com workspace e projeto gera pulso, balão e piscar só na sala do andar certo", async () => {
    await abrir();
    const sq = squadsDoWorkspace("bf-labs")[0];
    act(() => fonte().emitir("mensagem", msg("bf-labs", 0)));
    await waitFor(() => expect(within(sala("bf-labs", sq.projeto)).getAllByTestId("pulso")).toHaveLength(1));
    expect(within(sala("bf-labs", sq.projeto)).getByTestId("balao-fala")).toHaveTextContent("Pulso do prédio");
    expect(within(sala("bf-labs", sq.projeto)).getByTestId("sala-pisca")).toBeInTheDocument();
    // as outras salas, de todos os andares, ficam quietas
    expect(document.querySelectorAll('[data-testid="pulso"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-testid="sala-pisca"]')).toHaveLength(1);
    expect(within(piso("itarget")).queryAllByTestId("pulso")).toHaveLength(0);
  });

  it("mesmo nome de squad em outro Workspace não pulsa a sala errada", async () => {
    await abrir();
    // evento do iTarget com o nome de um squad do BF Labs: não existe no andar do iTarget, e o BF Labs não reage
    act(() => fonte().emitir("mensagem", { ...msg("bf-labs", 0), workspace: "itarget" }));
    await new Promise((r) => setTimeout(r, 150));
    expect(document.querySelectorAll('[data-testid="pulso"]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-testid="sala-pisca"]')).toHaveLength(0);
  });

  it("limita a 1 pulso por sala e a 6 no prédio todo", async () => {
    await abrir();
    act(() => {
      for (let k = 0; k < 3; k++) fonte().emitir("mensagem", msg("bf-labs", 0));
      for (const ws of [WORKSPACE_LOCAL, "bf-labs", "itarget"]) {
        const n = squadsDoWorkspace(ws).length;
        for (let i = 0; i < n; i++) fonte().emitir("mensagem", msg(ws, i));
      }
    });
    await waitFor(() => expect(document.querySelectorAll('[data-testid="pulso"]').length).toBeGreaterThanOrEqual(5));
    for (let t = 0; t < 6; t++) {
      expect(document.querySelectorAll('[data-testid="pulso"]').length).toBeLessThanOrEqual(6);
      for (const s of document.querySelectorAll('[data-testid="sala"]')) expect(s.querySelectorAll('[data-testid="pulso"]').length).toBeLessThanOrEqual(1);
      await new Promise((r) => setTimeout(r, 60));
    }
  });

  it("evento workspace atualiza a placa: o offline volta a ter salas e a saúde muda", async () => {
    await abrir();
    act(() => fonte().emitir("workspace", { ...workspaceFixture("bf-labs"), saude: "atencao", latencia_ms: 777 }));
    await waitFor(() => expect(within(piso("bf-labs")).getByTestId("selo-andar")).toHaveTextContent("Atenção"));
    expect(within(piso("bf-labs")).getByTestId("latencia-andar")).toHaveTextContent("777 ms");
    // cai
    act(() => fonte().emitir("workspace", { ...workspaceFixture("itarget"), online: false, saude: "offline", squads: [], totais: null, latencia_ms: null }));
    await waitFor(() => expect(piso("itarget")).toHaveAttribute("data-online", "false"));
    expect(within(piso("itarget")).queryAllByTestId("sala")).toHaveLength(0);
    expect(within(piso("itarget")).getByTestId("piso-offline")).toBeInTheDocument();
  });

  it("clicar na placa do andar abre o Office, modo Andar, daquele Workspace", async () => {
    await abrir();
    fireEvent.click(within(piso("bf-labs")).getByTestId("placa-andar"));
    await waitFor(() => expect(screen.getByTestId("local")).toHaveTextContent("/office?modo=andar&workspace=bf-labs"));
    await waitFor(() => expect(screen.getByRole("radio", { name: /Andar/ })).toBeChecked());
  });

  it("clicar na sala abre o Hub do squad naquele Workspace", async () => {
    await abrir();
    fireEvent.click(within(sala("bf-labs", "bf-ads")).getByTestId("placa-sala"));
    await waitFor(() => expect(screen.getByTestId("local")).toHaveTextContent("/office?workspace=bf-labs&projeto=bf-ads"));
    await screen.findAllByTestId("mesa");
    expect(screen.queryAllByTestId("sala")).toHaveLength(0);
  });

  it("clicar num agente abre a gaveta com o workspace e o projeto certos", async () => {
    await abrir();
    const sq = squadsDoWorkspace("bf-labs")[1];
    const alvo = sq.agentes[2].agente;
    const mesa = within(sala("bf-labs", sq.projeto)).getAllByTestId("mesa").find((m) => m.getAttribute("data-agente") === alvo)!;
    fireEvent.click(mesa);
    const gaveta = await screen.findByTestId("gaveta");
    expect(within(gaveta).getByRole("heading", { name: alvo })).toBeInTheDocument();
    expect(gaveta).toHaveAttribute("data-workspace", "bf-labs");
    expect(gaveta).toHaveAttribute("data-projeto", sq.projeto);
    expect(within(gaveta).getByRole("link", { name: /Ver conversas/ }).getAttribute("href")).toMatch(/workspace=bf-labs/);
    await waitFor(() => expect(cliente.mensagens).toHaveBeenCalledWith(expect.objectContaining({ projeto: sq.projeto, agente: alvo, workspace: "bf-labs" }), expect.anything()));
    await waitFor(() => expect(cliente.tarefas).toHaveBeenCalledWith(expect.objectContaining({ projeto: sq.projeto, workspace: "bf-labs" }), expect.anything()));
  });

  it("agente do Workspace local usa o cliente sem prefixo", async () => {
    await abrir();
    const sq = squadsDoWorkspace(WORKSPACE_LOCAL)[0];
    const mesa = within(sala(WORKSPACE_LOCAL, sq.projeto)).getAllByTestId("mesa")[1];
    fireEvent.click(mesa);
    const gaveta = await screen.findByTestId("gaveta");
    expect(gaveta).toHaveAttribute("data-workspace", WORKSPACE_LOCAL);
    await waitFor(() => expect(cliente.mensagens).toHaveBeenCalledWith(expect.objectContaining({ projeto: sq.projeto, workspace: null }), expect.anything()));
  });

  it("modo TV: ?tv=1 ocupa a tela toda, mantém o seletor e o resumo", async () => {
    await abrir("/office?modo=predio&tv=1");
    expect(screen.getByTestId("office").className).toMatch(/fixed inset-0/);
    expect(screen.getByRole("radio", { name: /Prédio/ })).toBeChecked();
    expect(screen.getAllByTestId("piso")).toHaveLength(4);
    expect(screen.getByTestId("resumo-predio")).toBeInTheDocument();
  });

  it("tela Workspaces tem o botão que leva ao Office do prédio", async () => {
    renderPainel("/workspaces");
    const link = await screen.findByRole("link", { name: /Office do prédio/ });
    expect(link).toHaveAttribute("href", "/office?modo=predio");
    fireEvent.click(link);
    await screen.findAllByTestId("piso");
  });
});

describe("Prédio com um Workspace só", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockarCliente();
    vi.spyOn(cliente, "geral").mockImplementation(async () => responderFixture("/api/geral", {}) as Geral);
  });

  it("o modo não aparece no seletor do Office", async () => {
    renderPainel("/office?modo=andar");
    await screen.findAllByTestId("sala");
    expect(screen.getByRole("radio", { name: /Andar/ })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Prédio/ })).toBeNull();
  });

  it("aberto por URL, explica que faltam Workspaces", async () => {
    renderPainel("/office?modo=predio");
    expect(await screen.findByTestId("predio-indisponivel")).toHaveTextContent("mais de um Workspace");
    expect(screen.queryAllByTestId("piso")).toHaveLength(0);
  });

  it("a tela Workspaces não oferece o botão", async () => {
    renderPainel("/workspaces");
    await screen.findByRole("heading", { level: 1, name: "Workspaces" });
    expect(screen.queryByRole("link", { name: /Office do prédio/ })).toBeNull();
  });
});
