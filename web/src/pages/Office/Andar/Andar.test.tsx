import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cliente } from "../../../api/cliente";
import { geralFixture, mensagensFixture, SQUAD_AB, SQUAD_MENT } from "../../../api/fixtures";
import type { Geral } from "../../../api/tipos";
import { FonteFalsa, mockarCliente, renderPainel } from "../../../test/utils";
import { colunasPara, layoutAndar, layoutSala } from "./layout";

let geral: Geral;

beforeEach(() => {
  FonteFalsa.todas = [];
  mockarCliente();
  geral = geralFixture();
  vi.spyOn(cliente, "geral").mockImplementation(async () => geral);
  vi.spyOn(cliente, "mensagens").mockImplementation(async () => ({ mensagens: mensagensFixture().slice(0, 3), mais: false }));
  vi.spyOn(cliente, "subagentes").mockImplementation(async () => []);
});
afterEach(() => vi.restoreAllMocks());

const fonte = () => FonteFalsa.todas[FonteFalsa.todas.length - 1];
const sala = (p: string) => document.querySelector(`[data-testid="sala"][data-squad="${p}"]`) as HTMLElement;

async function abrirAndar(rota = "/office?modo=andar") {
  renderPainel(rota);
  await screen.findAllByTestId("sala");
  await waitFor(() => expect(FonteFalsa.todas.length).toBeGreaterThan(0));
  act(() => fonte().abrir());
}
const msg = (p: Record<string, unknown>) => ({ id: "m-andar-1", ts: new Date().toISOString(), de: `${SQUAD_AB}-manager01-cc`, para: `${SQUAD_AB}-master`, tipo: "andamento", assunto: "Pulso do andar", projeto: SQUAD_AB, ...p });

describe("layout do andar", () => {
  it("2 a 4 salas por linha conforme o número", () => {
    expect([1, 2, 3, 4, 5, 9, 10].map(colunasPara)).toEqual([1, 2, 2, 2, 3, 3, 4]);
    const l = layoutAndar([4, 3, 3]);
    expect(l.salas).toHaveLength(3);
    expect(l.salas[0].y).toBe(l.salas[1].y);
    expect(l.salas[2].y).toBeGreaterThan(l.salas[0].y);
  });
  it("sala com master e mesas dos demais", () => {
    const sq = geral.squads[0];
    const l = layoutSala(sq.agentes);
    expect(l.master?.papel).toBe("master");
    expect(l.mesas).toHaveLength(sq.agentes.length - 1);
  });
});

describe("Office, modo Andar", () => {
  it("renderiza uma sala por squad com placa, selo de saúde e o stream de todos os squads", async () => {
    await abrirAndar();
    expect(screen.getAllByTestId("sala")).toHaveLength(3);
    expect(screen.getAllByTestId("placa-sala").map((p) => p.getAttribute("data-squad")).sort()).toEqual(["agent-board", "r7-mentorias", "r7one"]);
    expect(within(sala("r7one")).getByTestId("selo-sala")).toHaveTextContent("Crítico");
    expect(within(sala(SQUAD_AB)).getByTestId("selo-sala")).toHaveTextContent("Saudável");
    expect(within(sala(SQUAD_MENT)).getAllByTestId("mesa")).toHaveLength(4);
    expect(within(sala("r7one")).getAllByTestId("mesa")).toHaveLength(5);
    expect(FonteFalsa.todas.some((f) => f.url === "/api/stream?projeto=*")).toBe(true);
    expect(screen.getByRole("radio", { name: /Andar/ })).toBeChecked();
    expect(screen.getByLabelText("Projeto")).toHaveValue("*");
  });

  it("?projeto=* também abre o andar", async () => {
    await abrirAndar("/office?projeto=*");
    expect(screen.getAllByTestId("sala")).toHaveLength(3);
  });

  it("mensagem com projeto gera pulso e balão só na sala certa, e a sala pisca", async () => {
    await abrirAndar();
    act(() => fonte().emitir("mensagem", msg({})));
    await waitFor(() => expect(within(sala(SQUAD_AB)).getAllByTestId("pulso")).toHaveLength(1));
    expect(within(sala(SQUAD_AB)).getByTestId("balao-fala")).toHaveTextContent("Pulso do andar");
    expect(within(sala("r7one")).queryAllByTestId("pulso")).toHaveLength(0);
    expect(within(sala(SQUAD_MENT)).queryAllByTestId("pulso")).toHaveLength(0);
    expect(within(sala(SQUAD_AB)).getByTestId("sala-pisca")).toBeInTheDocument();
    expect(sala("r7one").querySelector('[data-testid="sala-pisca"]')).toBeNull();
  });

  it("evento agente e subagente com projeto atualiza a sala certa", async () => {
    await abrirAndar();
    const ag = geral.squads.find((s) => s.projeto === SQUAD_MENT)!.agentes[2];
    act(() => fonte().emitir("agente", { ...ag, status: "offline", projeto: SQUAD_MENT }));
    await waitFor(() => expect(within(sala(SQUAD_MENT)).getByRole("button", { name: /manager02-cc|manager02/ })).toHaveAttribute("aria-label", expect.stringMatching(/offline|Offline/i)));
  });

  it("clicar na placa entra no squad (Office, modo Hub)", async () => {
    await abrirAndar();
    fireEvent.click(within(sala(SQUAD_MENT)).getByTestId("placa-sala"));
    await waitFor(() => expect(screen.getByTestId("local")).toHaveTextContent("/office?projeto=r7-mentorias"));
    expect(screen.getByTestId("local")).not.toHaveTextContent("modo=");
    await screen.findAllByTestId("mesa");
    expect(screen.queryAllByTestId("sala")).toHaveLength(0);
  });

  it("clicar num agente abre a gaveta com o agente certo e o projeto dele", async () => {
    await abrirAndar();
    const mesa = within(sala(SQUAD_MENT)).getAllByTestId("mesa").find((m) => m.getAttribute("data-agente") === "r7-mentorias-manager02-cc")!;
    fireEvent.click(mesa);
    const gaveta = await screen.findByTestId("gaveta");
    expect(within(gaveta).getByRole("heading", { name: "r7-mentorias-manager02-cc" })).toBeInTheDocument();
    expect(gaveta).toHaveAttribute("data-projeto", SQUAD_MENT);
    expect(within(gaveta).getByRole("link", { name: /Ver conversas/ })).toHaveAttribute("href", expect.stringContaining("projeto=r7-mentorias"));
    await waitFor(() => expect(cliente.mensagens).toHaveBeenCalledWith(expect.objectContaining({ projeto: SQUAD_MENT, agente: "r7-mentorias-manager02-cc" }), expect.anything()));
    await waitFor(() => expect(cliente.tarefas).toHaveBeenCalledWith(expect.objectContaining({ projeto: SQUAD_MENT }), expect.anything()));
  });

  it("squad com erro mostra o texto do erro na sala, sem agentes", async () => {
    geral = geralFixture();
    const s = geral.squads[1];
    geral.squads[1] = { ...s, agentes: [], saude: "critico", erro: "config ilegível: <b>x</b> /root/sumiu" };
    await abrirAndar();
    const alvo = within(sala(s.projeto));
    expect(alvo.getByTestId("erro-sala")).toHaveTextContent("Não foi possível ler este squad");
    expect(alvo.getByTestId("erro-sala")).toHaveTextContent("config ilegível: <b>x</b> /root/sumiu");
    expect(alvo.queryAllByTestId("mesa")).toHaveLength(0);
    expect(alvo.getByTestId("selo-sala")).toHaveTextContent("Crítico");
  });

  it("modo TV: ?tv=1 ocupa a tela toda e mantém o seletor", async () => {
    await abrirAndar("/office?modo=andar&tv=1");
    expect(screen.getByTestId("office").className).toMatch(/fixed inset-0/);
    expect(screen.getByRole("radio", { name: /Andar/ })).toBeChecked();
  });

  it("Visão geral tem o botão que leva ao Office do andar", async () => {
    vi.spyOn(cliente, "mensagensGeral").mockResolvedValue({ mensagens: [], mais: false });
    renderPainel("/geral");
    const link = await screen.findByRole("link", { name: /Office do andar/ });
    expect(link).toHaveAttribute("href", "/office?modo=andar");
    fireEvent.click(link);
    await screen.findAllByTestId("sala");
  });
});
