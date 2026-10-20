import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cliente } from "../../api/cliente";
import { agentesFixture, mensagensFixture, tarefasFixture } from "../../api/fixtures";
import type { Mensagem } from "../../api/tipos";
import { FonteFalsa, mockarCliente, renderPainel } from "../../test/utils";
import { calcularLayout, ligacao, rotaEntre } from "./Hub/geometria";
import { ultimaLinha } from "./Hub/Mesa";

const MASTER = "r7one-master";
const M1 = "r7one-manager01-cc";
const M2 = "r7one-manager02-omp";

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
const msg = (p: Partial<Mensagem>): Mensagem => ({ id: "t-1", ts: new Date().toISOString(), de: M1, para: MASTER, tipo: "andamento", assunto: "Teste de pulso", ...p });

async function abrirOffice(rota = "/office") {
  renderPainel(rota);
  await screen.findAllByTestId("mesa");
  act(() => fonte().abrir());
}

describe("geometria do Hub", () => {
  it("master no centro, researcher na biblioteca e managers no anel", () => {
    const l = calcularLayout(agentesFixture());
    expect(l.master?.agente).toBe(MASTER);
    expect(l.mesas).toHaveLength(4);
    expect(l.mesas.filter((m) => m.ala === "biblioteca")).toHaveLength(1);
    expect(l.mesas.filter((m) => m.ala === "anel")).toHaveLength(3);
    expect(l.vb.w).toBeGreaterThan(0);
  });
  it("20 agentes cabem com escala reduzida", () => {
    const base = agentesFixture()[1];
    const muitos = Array.from({ length: 19 }, (_, i) => ({ ...base, agente: `p-manager${i}`, papel: i % 5 === 0 ? "researcher" : "manager" }));
    const l = calcularLayout([agentesFixture()[0], ...muitos]);
    expect(l.mesas).toHaveLength(19);
    expect(l.mesas[0].escala).toBeLessThan(1);
  });
  it("rota passa pelo master e some se o agente é desconhecido", () => {
    const l = calcularLayout(agentesFixture());
    const ligs = new Map(l.mesas.map((m, i) => [m.agente.agente, ligacao(m.agente.agente, m, i)]));
    const ida = rotaEntre(MASTER, M1, MASTER, ligs);
    expect(ida?.d.startsWith("M 0 -26")).toBe(true);
    const dupla = rotaEntre(M1, M2, MASTER, ligs);
    expect((dupla?.d.match(/Q/g) ?? []).length).toBe(2);
    expect(rotaEntre(M1, "fantasma", MASTER, ligs)).toBeNull();
  });
  it("ultimaLinha pega a última linha útil sem escapes", () => {
    expect(ultimaLinha("a\n\u001b[32mverde\u001b[0m  \n\n")).toBe("verde");
    expect(ultimaLinha(null)).toBe("");
  });
});

describe("Office, modo Hub", () => {
  it("renderiza uma mesa por agente, o quadro do master e a luz de status", async () => {
    await abrirOffice();
    expect(screen.getAllByTestId("mesa")).toHaveLength(5);
    expect(screen.getByTestId("quadro-abertos")).toHaveTextContent("4");
    expect(screen.getByTestId("quadro-revisao")).toHaveTextContent("1");
    expect(screen.getByTestId("sala-master")).toBeInTheDocument();
    const m2 = document.querySelector(`[data-agente="${M2}"]`)!;
    expect(m2.querySelector('[data-testid="postits"]')).toHaveAttribute("data-atrasado", "true");
    expect(document.querySelector(`[data-agente="${M1}"]`)).toHaveAttribute("data-status", "trabalhando");
    expect(document.querySelector('[data-agente="r7one-manager03-cc"] [data-testid="balao-espera"]')).toBeInTheDocument();
  });

  it("estado vazio quando não há agentes", async () => {
    vi.spyOn(cliente, "agentes").mockResolvedValue([]);
    renderPainel("/office");
    expect(await screen.findByText("Nenhum agente cadastrado")).toBeInTheDocument();
  });

  it("mensagem do SSE dispara pulso e balão de fala", async () => {
    await abrirOffice();
    expect(screen.queryByTestId("pulso")).not.toBeInTheDocument();
    act(() => fonte().emitir("mensagem", msg({ de: M1, para: MASTER, tipo: "entrega", assunto: "Entrega do stream" })));
    expect(await screen.findByTestId("pulso")).toHaveAttribute("data-tipo", "entrega");
    expect(screen.getByTestId("pasta")).toBeInTheDocument();
    expect(screen.getByTestId("balao-fala")).toHaveTextContent("Entrega do stream");
  });

  it("limita os pulsos simultâneos e enfileira o resto", async () => {
    await abrirOffice();
    act(() => {
      for (let i = 0; i < 8; i++) fonte().emitir("mensagem", msg({ id: `f-${i}`, de: MASTER, para: M2, tipo: "pedido" }));
    });
    await waitFor(() => expect(screen.getAllByTestId("pulso").length).toBeGreaterThan(0));
    expect(screen.getAllByTestId("pulso").length).toBeLessThanOrEqual(4);
  });

  it("resposta rejeitada pisca a mesa de destino", async () => {
    await abrirOffice();
    act(() => fonte().emitir("mensagem", msg({ de: MASTER, para: M2, tipo: "resposta", veredito: "rejeitado", assunto: "Refazer" })));
    await waitFor(
      () => expect(document.querySelector(`[data-agente="${M2}"] [data-testid="flash-rejeicao"]`)).toBeInTheDocument(),
      { timeout: 4000 },
    );
  });

  it("evento agente atualiza a linha do monitor", async () => {
    await abrirOffice();
    const novo = { ...agentesFixture().find((a) => a.agente === M1)!, tela: "linha antiga\nnpm test verde" };
    act(() => fonte().emitir("agente", novo));
    await waitFor(() => expect(document.querySelector(`[data-agente="${M1}"] [data-testid="monitor-linha"]`)).toHaveTextContent("npm test verde"));
  });

  it("clicar na mesa abre a gaveta com o trabalho do agente e Esc fecha", async () => {
    await abrirOffice();
    // d3-zoom escuta mousedown e o jsdom não preenche event.view; fireEvent.click basta para a mesa
    fireEvent.click(document.querySelector(`[data-agente="${M1}"]`)!);
    const gaveta = await screen.findByTestId("gaveta");
    expect(within(gaveta).getByText(M1)).toBeInTheDocument();
    expect(within(gaveta).getByText("Tela do terminal")).toBeInTheDocument();
    expect(within(gaveta).getByTestId("terminal")).toHaveTextContent(/Escrevendo testes|stream/);
    expect(within(gaveta).getByText("Tarefa atual")).toBeInTheDocument();
    expect(await within(gaveta).findByTestId("mensagens-agente")).toBeInTheDocument();
    expect(within(gaveta).getByRole("link", { name: /Ver conversas/ })).toHaveAttribute("href", expect.stringContaining("/conversas?agente="));
    // terminal ao vivo
    act(() => fonte().emitir("agente", { ...agentesFixture().find((a) => a.agente === M1)!, tela: "saida nova ao vivo" }));
    await waitFor(() => expect(within(gaveta).getByTestId("terminal")).toHaveTextContent("saida nova ao vivo"));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("gaveta")).not.toBeInTheDocument());
  });

  it("mensagem nova do agente entra na lista da gaveta", async () => {
    await abrirOffice();
    // d3-zoom escuta mousedown e o jsdom não preenche event.view; fireEvent.click basta para a mesa
    fireEvent.click(document.querySelector(`[data-agente="${M1}"]`)!);
    const gaveta = await screen.findByTestId("gaveta");
    await within(gaveta).findByTestId("mensagens-agente");
    act(() => fonte().emitir("mensagem", msg({ id: "novo-1", assunto: "Mensagem fresquinha" })));
    expect(await within(gaveta).findByText("Mensagem fresquinha")).toBeInTheDocument();
  });
});

describe("Office, modos, TV e Live Logs", () => {
  it("troca de modo e guarda em ?modo=", async () => {
    await abrirOffice();
    await userEvent.click(screen.getByRole("radio", { name: "Mapa" }));
    expect(screen.getByTestId("local")).toHaveTextContent("modo=mapa");
    expect(screen.queryByTestId("hub-svg")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Grade" }));
    expect(screen.getByTestId("local")).toHaveTextContent("modo=grade");
    expect(screen.queryByTestId("canvas-zoom")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Hub" }));
    expect(screen.getByTestId("local")).not.toHaveTextContent("modo=");
    expect(screen.getByTestId("canvas-zoom")).toBeInTheDocument();
  });

  it("?modo=grade abre direto na grade", async () => {
    renderPainel("/office?modo=grade");
    expect(await screen.findByRole("radio", { name: "Grade", checked: true })).toBeInTheDocument();
  });

  it("Modo TV liga ?tv=1 e pede tela cheia", async () => {
    const fs = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { value: fs, configurable: true });
    await abrirOffice();
    await userEvent.click(screen.getByRole("button", { name: "Modo TV" }));
    expect(fs).toHaveBeenCalled();
    expect(screen.getByTestId("local")).toHaveTextContent("tv=1");
    expect(screen.getByRole("button", { name: "Sair do modo TV" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sair do modo TV" }));
    expect(screen.getByTestId("local")).not.toHaveTextContent("tv=1");
  });

  it("controles do canvas: travar alterna o estado", async () => {
    await abrirOffice();
    const trava = screen.getByRole("button", { name: "Travar zoom e arraste" });
    await userEvent.click(trava);
    expect(screen.getByRole("button", { name: "Destravar zoom e arraste" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Ajustar à tela" })).toBeInTheDocument();
  });

  it("Live Logs mostra as mensagens do SSE", async () => {
    await abrirOffice();
    act(() => fonte().emitir("mensagem", msg({ id: "log-1", assunto: "Primeira do log" })));
    expect(await screen.findByTestId("live-logs-nao-lidas")).toHaveTextContent("1");
    await userEvent.click(screen.getByRole("button", { name: "Abrir Live Logs" }));
    const painel = await screen.findByTestId("live-logs");
    expect(await within(painel).findByText("Primeira do log")).toBeInTheDocument();
    act(() => fonte().emitir("mensagem", msg({ id: "log-2", assunto: "Segunda do log" })));
    expect(await within(painel).findByText("Segunda do log")).toBeInTheDocument();
  });

  it("Live Logs fecha com Esc e com clique fora", async () => {
    await abrirOffice();
    const abrir = () => userEvent.click(screen.getByRole("button", { name: "Abrir Live Logs" }));
    await abrir();
    await screen.findByTestId("live-logs");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("live-logs")).not.toBeInTheDocument());
    await abrir();
    await screen.findByTestId("live-logs");
    await userEvent.click(screen.getByTestId("office").querySelector("main, h1, header") ?? document.body);
    await waitFor(() => expect(screen.queryByTestId("live-logs")).not.toBeInTheDocument());
  });

  it("Live Logs e gaveta nunca ficam abertos juntos", async () => {
    await abrirOffice();
    await userEvent.click(screen.getByRole("button", { name: "Abrir Live Logs" }));
    await screen.findByTestId("live-logs");
    fireEvent.click(document.querySelector(`[data-agente="${M1}"]`)!);
    await screen.findByTestId("gaveta");
    await waitFor(() => expect(screen.queryByTestId("live-logs")).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Abrir Live Logs" }));
    await screen.findByTestId("live-logs");
    await waitFor(() => expect(screen.queryByTestId("gaveta")).not.toBeInTheDocument());
  });

  it("gaveta separa mensagens sem resposta de tarefas abertas e esconde worktree vazio", async () => {
    await abrirOffice();
    fireEvent.click(document.querySelector(`[data-agente="${M1}"]`)!);
    const gaveta = await screen.findByTestId("gaveta");
    const ag = agentesFixture().find((a) => a.agente === M1)!;
    expect(within(gaveta).getByText("Mensagens sem resposta")).toBeInTheDocument();
    expect(within(gaveta).getByTestId("sem-resposta")).toHaveTextContent(String(ag.pendentes));
    expect(within(gaveta).getByText("Tarefas abertas")).toBeInTheDocument();
    expect(within(gaveta).queryByText("Pendentes")).not.toBeInTheDocument();
    const n = within(gaveta).queryByTestId("pendentes-agente")?.children.length ?? 0;
    expect(within(gaveta).getByTestId("tarefas-abertas")).toHaveTextContent(String(n));
    expect(within(gaveta).queryByText("sem worktree")).not.toBeInTheDocument();
  });
});

void tarefasFixture;
