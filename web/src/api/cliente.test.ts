import { afterEach, describe, expect, it, vi } from "vitest";
import { cliente, montarUrl } from "./cliente";
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
