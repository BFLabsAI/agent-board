import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConexaoStream, urlStream } from "./stream";
import { FonteFalsa, fabricaFalsa } from "../test/utils";

beforeEach(() => {
  vi.useFakeTimers();
  FonteFalsa.todas = [];
});
afterEach(() => vi.useRealTimers());

const ultima = () => FonteFalsa.todas[FonteFalsa.todas.length - 1];

describe("ConexaoStream", () => {
  it("abre /api/stream?projeto= e vira conectado", () => {
    const c = new ConexaoStream({ projeto: "r7 one", fabrica: fabricaFalsa });
    c.iniciar();
    expect(ultima().url).toBe("/api/stream?projeto=r7%20one");
    expect(c.status).toBe("conectando");
    ultima().abrir();
    expect(c.status).toBe("conectado");
    c.parar();
  });

  it("sem projeto usa a URL pura", () => {
    expect(urlStream(null)).toBe("/api/stream");
  });

  it("entrega mensagem, agente e tarefa aos assinantes e ignora JSON inválido", () => {
    const c = new ConexaoStream({ fabrica: fabricaFalsa });
    const msgs: unknown[] = [];
    const off = c.assinar("mensagem", (m) => msgs.push(m));
    c.iniciar();
    ultima().abrir();
    ultima().emitir("mensagem", { id: "m1", tipo: "pedido" });
    ultima().emitir("mensagem", null, "{quebrado");
    expect(msgs).toEqual([{ id: "m1", tipo: "pedido" }]);
    off();
    ultima().emitir("mensagem", { id: "m2" });
    expect(msgs).toHaveLength(1);
    c.parar();
  });

  it("reconecta com backoff exponencial e fica offline depois de falhas seguidas", () => {
    const c = new ConexaoStream({ fabrica: fabricaFalsa, baseMs: 1000, tetoMs: 4000, falhasParaOffline: 3 });
    const status: string[] = [];
    c.aoMudar((s) => status.push(s));
    c.iniciar();
    ultima().falhar();
    expect(c.status).toBe("reconectando");
    expect(FonteFalsa.todas).toHaveLength(1);
    vi.advanceTimersByTime(999);
    expect(FonteFalsa.todas).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FonteFalsa.todas).toHaveLength(2);
    ultima().falhar(); // espera 2 s
    vi.advanceTimersByTime(2000);
    expect(FonteFalsa.todas).toHaveLength(3);
    ultima().falhar(); // terceira falha: offline, espera 4 s (teto)
    expect(c.status).toBe("offline");
    vi.advanceTimersByTime(4000);
    expect(FonteFalsa.todas).toHaveLength(4);
    expect(FonteFalsa.todas[0].fechada).toBe(true);
    expect(status).toEqual(["reconectando", "offline"]);
    c.parar();
  });

  it("dispara 'recarregar' só quando reconecta depois de uma queda", () => {
    const c = new ConexaoStream({ fabrica: fabricaFalsa });
    const recarregar = vi.fn();
    c.aoVoltar(recarregar);
    c.iniciar();
    ultima().abrir();
    expect(recarregar).not.toHaveBeenCalled(); // primeira conexão não conta
    ultima().falhar();
    vi.advanceTimersByTime(1000);
    ultima().abrir();
    expect(c.status).toBe("conectado");
    expect(recarregar).toHaveBeenCalledTimes(1);
    c.parar();
  });

  it("reconecta quando passa tempo demais sem nem um ping", () => {
    const c = new ConexaoStream({ fabrica: fabricaFalsa, silencioMs: 40000 });
    c.iniciar();
    ultima().abrir();
    vi.advanceTimersByTime(30000);
    ultima().emitir("ping", { agora: "x" });
    vi.advanceTimersByTime(39999);
    expect(c.status).toBe("conectado");
    vi.advanceTimersByTime(1);
    expect(c.status).toBe("reconectando");
    c.parar();
  });

  it("parar() fecha a fonte e cancela a reconexão", () => {
    const c = new ConexaoStream({ fabrica: fabricaFalsa });
    c.iniciar();
    ultima().falhar();
    c.parar();
    vi.advanceTimersByTime(60000);
    expect(FonteFalsa.todas).toHaveLength(1);
  });
});
