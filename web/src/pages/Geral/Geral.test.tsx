import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cliente } from "../../api/cliente";
import { geralFixture, mensagensGeralFixture, projetosFixture, SQUAD_AB, SQUAD_MENT } from "../../api/fixtures";
import type { Geral as GeralT, Squad } from "../../api/tipos";
import { FonteFalsa, mockarCliente, renderPainel } from "../../test/utils";
import { aplicarAgente, motivosSaude, totaisVivos } from "./lib";

let geral: GeralT;

beforeEach(() => {
  FonteFalsa.todas = [];
  mockarCliente();
  geral = geralFixture();
  vi.spyOn(cliente, "geral").mockImplementation(async () => geral);
  vi.spyOn(cliente, "mensagensGeral").mockImplementation(async (f) => {
    const todas = mensagensGeralFixture();
    const lista = f?.antes ? todas.filter((m) => m.ts < f.antes!) : todas;
    const limite = f?.limite ?? 100;
    return { mensagens: lista.slice(0, limite), mais: lista.length > limite };
  });
});
afterEach(() => vi.restoreAllMocks());

const fonte = () => FonteFalsa.todas[FonteFalsa.todas.length - 1];
const card = (nome: string) => document.querySelector(`[data-testid="card-squad"][data-squad="${nome}"]`) as HTMLElement;

async function abrirGeral() {
  renderPainel("/geral");
  await screen.findAllByTestId("card-squad");
  await waitFor(() => expect(FonteFalsa.todas.length).toBeGreaterThan(0));
  act(() => fonte().abrir());
}

describe("tela Visão geral", () => {
  it("renderiza um card por squad, com saúde, KPIs, última mensagem e botões", async () => {
    await abrirGeral();
    expect(screen.getByRole("heading", { level: 1, name: "Visão geral" })).toBeInTheDocument();
    expect(screen.getAllByTestId("card-squad")).toHaveLength(3);
    // ordem do servidor: crítico, atenção, ok
    expect(screen.getAllByTestId("card-squad").map((c) => c.getAttribute("data-saude"))).toEqual(["critico", "atencao", "ok"]);
    const c = card("r7one");
    expect(within(c).getByTestId("selo-saude")).toHaveTextContent("Crítico");
    expect(within(c).getByTestId("motivo-saude")).toHaveTextContent(/atrasado/);
    expect(within(c).getAllByTestId("avatar-agente")).toHaveLength(5);
    expect(within(c).getByTestId("subs-rodando")).toBeInTheDocument();
    expect(within(c).getByTestId("ultima-mensagem")).toBeInTheDocument();
    expect(within(c).getByRole("link", { name: /Abrir squad/ })).toHaveAttribute("href", "/?projeto=r7one");
    expect(within(c).getByRole("link", { name: /Office/ })).toHaveAttribute("href", "/office?projeto=r7one");
    expect(within(card(SQUAD_AB)).getByTestId("selo-saude")).toHaveTextContent("Saudável");
  });

  it("a faixa de totais destaca atrasados, revisão e esperando quando maiores que 0", async () => {
    await abrirGeral();
    expect(screen.getByTestId("total-squads")).toHaveTextContent("3");
    expect(screen.getByTestId("total-atrasados")).toHaveAttribute("data-destaque", "true");
    expect(screen.getByTestId("total-revisao")).toHaveAttribute("data-destaque", "true");
    expect(screen.getByTestId("total-esperando")).toHaveAttribute("data-destaque", "true");
    expect(screen.getByTestId("total-trabalhando")).not.toHaveAttribute("data-destaque");
  });

  it("totais zerados não ficam destacados", async () => {
    geral = {
      ...geral,
      squads: geral.squads.map((s) => ({
        ...s,
        indicadores: { ...s.indicadores, atrasados: 0, revisao: 0 },
        agentes: s.agentes.map((a) => ({ ...a, status: "parado" as const })),
      })),
    };
    await abrirGeral();
    expect(screen.getByTestId("total-atrasados")).not.toHaveAttribute("data-destaque");
    expect(screen.getByTestId("total-revisao")).not.toHaveAttribute("data-destaque");
    expect(screen.getByTestId("total-esperando")).not.toHaveAttribute("data-destaque");
  });

  it("squad com erro mostra o erro como texto, sem interpretar HTML", async () => {
    const ruim: Squad = {
      ...geral.squads[0], projeto: "quebrado", agentes: [], ultima_mensagem: null, saude: "critico",
      erro: "config ilegível <img src=x onerror=alert(1)>",
    };
    geral = { ...geral, squads: [ruim, ...geral.squads.slice(1)] };
    await abrirGeral();
    const c = card("quebrado");
    const alerta = within(c).getByTestId("erro-squad");
    expect(alerta).toHaveTextContent("config ilegível <img src=x onerror=alert(1)>");
    expect(c.querySelector("img")).toBeNull();
    expect(within(c).queryByTestId("avatar-agente")).not.toBeInTheDocument();
    expect(within(c).getByRole("link", { name: /Abrir squad/ })).toBeInTheDocument();
  });

  it("mensagem do stream '*' pulsa o card certo, conta a mensagem e vira a última dele", async () => {
    await abrirGeral();
    expect(fonte().url).toBe("/api/stream?projeto=*");
    const alvo = card(SQUAD_MENT);
    const outro = card(SQUAD_AB);
    const antes = Number(within(alvo).getByTestId("kpi-mensagens").textContent!.replace(/\D/g, "").slice(-2));
    act(() =>
      fonte().emitir("mensagem", {
        id: "x1", ts: new Date().toISOString(), de: "r7-mentorias-manager01-omp", para: "r7-mentorias-master",
        tipo: "entrega", assunto: "Entrega nova do stream", projeto: SQUAD_MENT,
      }),
    );
    await waitFor(() => expect(alvo).toHaveAttribute("data-pulsando", "true"));
    expect(outro).not.toHaveAttribute("data-pulsando");
    expect(within(alvo).getByTestId("ultima-mensagem")).toHaveTextContent("Entrega nova do stream");
    expect(within(outro).getByTestId("ultima-mensagem")).not.toHaveTextContent("Entrega nova do stream");
    expect(Number(within(alvo).getByTestId("kpi-mensagens").textContent!.replace(/\D/g, "").slice(-2))).toBe(antes + 1);
  });

  it("evento 'agente' com projeto muda o status só do agente do squad certo, sem reload", async () => {
    await abrirGeral();
    const nome = "r7-mentorias-master";
    const av = () => within(card(SQUAD_MENT)).getAllByTestId("avatar-agente").find((e) => e.getAttribute("data-agente") === nome)!;
    expect(av()).toHaveAttribute("data-status", "esperando");
    const esperandoAntes = Number(screen.getByTestId("total-esperando").textContent!.replace(/\D/g, ""));
    const agente = geral.squads.find((s) => s.projeto === SQUAD_MENT)!.agentes.find((a) => a.agente === nome)!;
    act(() => fonte().emitir("agente", { ...agente, status: "trabalhando", projeto: SQUAD_MENT }));
    await waitFor(() => expect(av()).toHaveAttribute("data-status", "trabalhando"));
    expect(Number(screen.getByTestId("total-esperando").textContent!.replace(/\D/g, ""))).toBe(esperandoAntes - 1);
    expect(cliente.geral).toHaveBeenCalledTimes(1);
  });

  it("evento de projeto desconhecido é ignorado", async () => {
    await abrirGeral();
    act(() => fonte().emitir("mensagem", { id: "z", ts: new Date().toISOString(), de: "a", para: "b", tipo: "pedido", assunto: "fantasma", projeto: "nao-existe" }));
    expect(screen.getAllByTestId("card-squad")).toHaveLength(3);
  });
});

describe("feed unificado", () => {
  it("mostra mensagens de todos os squads com chip colorido e filtra por squad", async () => {
    await abrirGeral();
    const lista = await screen.findByTestId("feed-geral-lista");
    await waitFor(() => expect(within(lista).getAllByTestId("feed-geral-linha").length).toBeGreaterThan(5));
    const squads = new Set(within(lista).getAllByTestId("feed-geral-linha").map((l) => l.getAttribute("data-squad")));
    expect(squads.size).toBe(3);
    expect(within(lista).getAllByTestId("chip-squad").length).toBeGreaterThan(5);

    const grupo = screen.getByRole("group", { name: "Filtrar por squad" });
    await userEvent.click(within(grupo).getByRole("button", { name: SQUAD_AB }));
    const so = within(lista).getAllByTestId("feed-geral-linha").map((l) => l.getAttribute("data-squad"));
    expect(new Set(so)).toEqual(new Set([SQUAD_AB]));
    await userEvent.click(within(grupo).getByRole("button", { name: "Todos" }));
    expect(new Set(within(lista).getAllByTestId("feed-geral-linha").map((l) => l.getAttribute("data-squad"))).size).toBe(3);
  });

  it("pausa guarda as mensagens novas e retomar as despeja; a mensagem do stream aparece no topo", async () => {
    await abrirGeral();
    const lista = await screen.findByTestId("feed-geral-lista");
    await waitFor(() => expect(within(lista).getAllByTestId("feed-geral-linha").length).toBeGreaterThan(5));
    const msg = (id: string) => ({ id, ts: new Date().toISOString(), de: "r7one-master", para: "r7one-manager01-cc", tipo: "pedido", assunto: `Assunto ${id}`, projeto: "r7one" });

    act(() => fonte().emitir("mensagem", msg("vivo-1")));
    expect(within(lista).getAllByTestId("feed-geral-linha")[0]).toHaveTextContent("Assunto vivo-1");

    await userEvent.click(screen.getByRole("button", { name: "Pausar" }));
    act(() => fonte().emitir("mensagem", msg("vivo-2")));
    expect(within(lista).queryByText("Assunto vivo-2")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Retomar \(1 novas\)/ }));
    expect(within(lista).getByText("Assunto vivo-2")).toBeInTheDocument();
  });

  it("carregar mais busca a próxima página com 'antes' e não repete mensagens", async () => {
    await abrirGeral();
    const lista = await screen.findByTestId("feed-geral-lista");
    await waitFor(() => expect(within(lista).getAllByTestId("feed-geral-linha")).toHaveLength(30));
    await userEvent.click(screen.getByRole("button", { name: "Carregar mais" }));
    await waitFor(() => expect(within(lista).getAllByTestId("feed-geral-linha").length).toBeGreaterThan(30));
    expect(cliente.mensagensGeral).toHaveBeenLastCalledWith(expect.objectContaining({ antes: expect.any(String) }));
    const chaves = within(lista).getAllByTestId("feed-geral-linha").map((l) => `${l.getAttribute("data-squad")}/${l.getAttribute("data-id")}`);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("assunto com HTML aparece como texto", async () => {
    vi.spyOn(cliente, "mensagensGeral").mockResolvedValue({
      mais: false,
      mensagens: [{ id: "h1", ts: new Date().toISOString(), de: "a-x", para: "a-y", tipo: "pedido", assunto: "<b>negrito</b><img src=x onerror=alert(1)>", projeto: "r7one" }],
    });
    await abrirGeral();
    const lista = await screen.findByTestId("feed-geral-lista");
    await waitFor(() => expect(within(lista).getByTestId("feed-geral-linha")).toHaveTextContent("<b>negrito</b>"));
    expect(lista.querySelector("img, b")).toBeNull();
  });
});

describe("lib", () => {
  it("motivosSaude explica a saúde e totaisVivos recalcula do que está em tela", () => {
    const [critico, atencao, ok] = geral.squads;
    expect(motivosSaude(critico).join(" ")).toMatch(/atrasado/);
    expect(motivosSaude(atencao).join(" ")).toMatch(/esperando|pendente/);
    expect(motivosSaude(ok)).toEqual(["Sem alertas"]);
    expect(totaisVivos(geral.squads).agentes).toBe(geral.totais.agentes);
    const a = atencao.agentes[0];
    const novos = aplicarAgente(geral.squads, atencao.projeto, { ...a, status: "offline" });
    expect(novos.find((s) => s.projeto === atencao.projeto)!.agentes[0].status).toBe("offline");
  });
});

describe("abertura e seletor", () => {
  it("sem ?projeto= e com mais de 1 projeto no cadastro cai em /geral", async () => {
    renderPainel("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Visão geral" })).toBeInTheDocument();
    expect(screen.getByTestId("local")).toHaveTextContent(/^\/geral$/);
  });

  it("mesmo com projeto salvo no localStorage, a abertura sem ?projeto= vai para /geral", async () => {
    window.localStorage.setItem("agent-board:projeto", "r7-mentorias");
    renderPainel("/?periodo=7d");
    expect(await screen.findByRole("heading", { level: 1, name: "Visão geral" })).toBeInTheDocument();
    expect(screen.getByTestId("local")).toHaveTextContent("/geral?periodo=7d");
  });

  it("com 1 projeto só cai no Dashboard", async () => {
    vi.spyOn(cliente, "projetos").mockResolvedValue(projetosFixture().slice(0, 1));
    renderPainel("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByTestId("local")).toHaveTextContent(/^\/$/);
  });

  it("com ?projeto= na URL não redireciona", async () => {
    renderPainel("/?projeto=agent-board");
    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByTestId("local")).toHaveTextContent("/?projeto=agent-board");
  });

  it("na Visão geral o seletor mostra 'Todos os squads'; escolher um squad abre o Dashboard dele e o seletor volta ao normal", async () => {
    renderPainel("/geral");
    const sel = await screen.findByLabelText("Projeto");
    await waitFor(() => expect(within(sel).getAllByRole("option")).toHaveLength(4));
    expect(sel).toHaveValue("*");
    expect(within(sel).getByRole("option", { name: "Todos os squads" })).toBeInTheDocument();
    await userEvent.selectOptions(sel, "agent-board");
    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByTestId("local")).toHaveTextContent("/?projeto=agent-board");
    const sel2 = screen.getByLabelText("Projeto");
    await waitFor(() => expect(within(sel2).getAllByRole("option")).toHaveLength(3));
    expect(sel2).toHaveValue("agent-board");
    expect(within(sel2).queryByRole("option", { name: "Todos os squads" })).not.toBeInTheDocument();
  });

  it("clicar em 'Abrir squad' leva ao Dashboard do squad", async () => {
    await abrirGeral();
    await userEvent.click(within(card(SQUAD_AB)).getByRole("link", { name: /Abrir squad/ }));
    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByTestId("local")).toHaveTextContent("/?projeto=agent-board");
  });

  it("'Visão geral' fica no topo da sidebar, antes das telas do squad, e o stream do projeto volta ao sair", async () => {
    renderPainel("/kanban?projeto=agent-board");
    const nav = await screen.findByRole("navigation", { name: "Navegação principal" });
    const links = within(nav).getAllByRole("link").map((l) => l.textContent);
    expect(links[0]).toBe("Workspaces");
    expect(links[1]).toBe("Visão geral");
    expect(links[2]).toBe("Dashboard");
    await waitFor(() => expect(FonteFalsa.todas.some((f) => f.url === "/api/stream?projeto=agent-board")).toBe(true));
    await userEvent.click(within(nav).getByRole("link", { name: "Visão geral" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Visão geral" })).toBeInTheDocument();
    expect(screen.getByTestId("local")).toHaveTextContent(/^\/geral$/);
    await waitFor(() => expect(FonteFalsa.todas.some((f) => f.url === "/api/stream?projeto=*" && !f.fechada)).toBe(true));
    expect(FonteFalsa.todas.filter((f) => !f.fechada)).toHaveLength(1);
  });
});
