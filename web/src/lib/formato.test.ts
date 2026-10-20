import { describe, expect, it } from "vitest";
import { formatarDuracaoMin, formatarPercentual, nomeCurto, papelDoNome, tempoRelativo } from "./formato";

const AGORA = Date.parse("2026-10-20T12:00:00Z");
const ha = (s: number) => new Date(AGORA - s * 1000).toISOString();

describe("tempoRelativo", () => {
  it.each([
    [10, "agora"],
    [4 * 60, "há 4 min"],
    [3 * 3600, "há 3 h"],
    [2 * 86400, "há 2 d"],
  ])("%is atrás", (s, esperado) => expect(tempoRelativo(ha(s), AGORA)).toBe(esperado));
  it("futuro e nulo", () => {
    expect(tempoRelativo(ha(-600), AGORA)).toBe("em 10 min");
    expect(tempoRelativo(null, AGORA)).toBe("—");
  });
});

describe("formatos", () => {
  it("duração", () => {
    expect(formatarDuracaoMin(null)).toBe("—");
    expect(formatarDuracaoMin(0.5)).toBe("30 s");
    expect(formatarDuracaoMin(4)).toBe("4 min");
    expect(formatarDuracaoMin(80)).toBe("1 h 20 min");
    expect(formatarDuracaoMin(26 * 60)).toBe("1 d 2 h");
  });
  it("percentual, nome e papel", () => {
    expect(formatarPercentual(0.82)).toBe("82%");
    expect(nomeCurto("r7one-manager01-cc")).toBe("manager01-cc");
    expect(papelDoNome("r7one-researcher01-cc")).toBe("researcher");
    expect(papelDoNome("r7one-master")).toBe("master");
  });
});
