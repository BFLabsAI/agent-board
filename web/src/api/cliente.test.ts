import { afterEach, describe, expect, it, vi } from "vitest";
import { cliente, definirWorkspaceAtivo, montarUrl } from "./cliente";
import { ErroApi } from "./erro";

function respostaJson(corpo: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } }));
}

afterEach(() => vi.restoreAllMocks());

describe("montarUrl", () => {
  it("omite parâmetros vazios e codifica os demais", () => {
    expect(montarUrl("/api/x", { a: "1 2", b: undefined, c: "", d: 0 })).toBe("/api/x?a=1+2&d=0");
    expect(montarUrl("/api/x")).toBe("/api/x");
  });
});

describe("cliente", () => {
  it("manda projeto e periodo nas rotas com período", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(() => respostaJson([]));
    await cliente.tarefas({ projeto: "r7one", periodo: "7d" });
    expect(f.mock.calls[0][0]).toBe("/api/tarefas?projeto=r7one&periodo=7d");
  });

  it("não manda periodo onde o contrato não tem", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(() => respostaJson([]));
    await cliente.agentes({ projeto: "r7one", periodo: "24h" });
    await cliente.analytics({ projeto: "r7one", periodo: "24h" });
    expect(f.mock.calls[0][0]).toBe("/api/agentes?projeto=r7one");
    expect(f.mock.calls[1][0]).toBe("/api/analytics?projeto=r7one");
  });

  it("filtros de conversas e mensagens viram query", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(() => respostaJson({ mensagens: [], mais: false }));
    await cliente.conversas({ projeto: "p", agente: "a", estado: "atrasado", q: "csv", limite: 20 });
    await cliente.mensagens({ projeto: "p", antes: "2026-10-20T00:00:00Z", tipo: "entrega" });
    expect(f.mock.calls[0][0]).toBe("/api/conversas?projeto=p&limite=20&agente=a&estado=atrasado&q=csv");
    expect(f.mock.calls[1][0]).toContain("/api/mensagens?projeto=p&antes=2026-10-20T00%3A00%3A00Z&tipo=entrega");
  });

  it("codifica o id da conversa", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(() => respostaJson({}));
    await cliente.conversa("a/b c");
    expect(f.mock.calls[0][0]).toBe("/api/conversas/a%2Fb%20c");
  });

  it("converte erro HTTP em ErroApi com a mensagem do servidor", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => respostaJson({ erro: "projeto desconhecido" }, 404));
    await expect(cliente.resumo({ projeto: "x" })).rejects.toMatchObject({ status: 404, message: "projeto desconhecido" });
    await expect(cliente.resumo({ projeto: "x" })).rejects.toBeInstanceOf(ErroApi);
  });
});

describe("cliente: Workspaces", () => {
  afterEach(() => definirWorkspaceAtivo(null));
  const chamar = async (fn: () => Promise<unknown>) => {
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(() => respostaJson([]));
    await fn();
    return f.mock.calls[f.mock.calls.length - 1][0];
  };

  it("workspace remoto ganha o prefixo /api/w/<id>; local ou ausente fica como antes", async () => {
    expect(await chamar(() => cliente.tarefas({ projeto: "p", workspace: "bf-labs" }))).toBe("/api/w/bf-labs/api/tarefas?projeto=p");
    expect(await chamar(() => cliente.tarefas({ projeto: "p", workspace: null }))).toBe("/api/tarefas?projeto=p");
    expect(await chamar(() => cliente.tarefas({ projeto: "p" }))).toBe("/api/tarefas?projeto=p");
  });

  it("todas as funções aceitam workspace", async () => {
    const w = { workspace: "bf labs" };
    const p = "/api/w/bf%20labs";
    expect(await chamar(() => cliente.projetos(undefined, "bf labs"))).toBe(`${p}/api/projetos`);
    expect(await chamar(() => cliente.resumo(w))).toBe(`${p}/api/resumo`);
    expect(await chamar(() => cliente.agentes(w))).toBe(`${p}/api/agentes`);
    expect(await chamar(() => cliente.conversas(w))).toBe(`${p}/api/conversas`);
    expect(await chamar(() => cliente.conversa("x", w))).toBe(`${p}/api/conversas/x`);
    expect(await chamar(() => cliente.mensagens(w))).toBe(`${p}/api/mensagens`);
    expect(await chamar(() => cliente.analytics(w))).toBe(`${p}/api/analytics`);
    expect(await chamar(() => cliente.workflows(w))).toBe(`${p}/api/workflows`);
    expect(await chamar(() => cliente.geral(w))).toBe(`${p}/api/geral`);
    expect(await chamar(() => cliente.mensagensGeral(w))).toBe(`${p}/api/geral/mensagens`);
    expect(await chamar(() => cliente.subagentes(w))).toBe(`${p}/api/subagentes`);
    expect(await chamar(() => cliente.versao(undefined, "bf labs"))).toBe(`${p}/api/versao`);
  });

  it("sem workspace explícito, usa o ativo do contexto (para as telas não precisarem repassar)", async () => {
    definirWorkspaceAtivo("itarget");
    expect(await chamar(() => cliente.mensagens({ projeto: "p", antes: "x" }))).toBe("/api/w/itarget/api/mensagens?projeto=p&antes=x");
    expect(await chamar(() => cliente.mensagens({ projeto: "p", workspace: null }))).toBe("/api/mensagens?projeto=p");
  });

  it("workspaces() e nunca passa pelo proxy; versao() do local é /api/versao", async () => {
    definirWorkspaceAtivo("itarget");
    expect(await chamar(() => cliente.workspaces({ periodo: "24h" }))).toBe("/api/workspaces?periodo=24h");
    definirWorkspaceAtivo(null);
    expect(await chamar(() => cliente.versao())).toBe("/api/versao");
  });
});
