import { describe, expect, it } from "vitest";
import type { SubAgente } from "../api/tipos";
import { agruparPorIssue, destinoIssue, resumoTerminadosSub, textoDuracaoSub } from "./subStatus";

const mk = (i: number, p: Partial<SubAgente> = {}): SubAgente => ({
  id: `s${i}`, agente: "x-cc", tipo: null, descricao: null, status: "concluido", fundo: false, inicio: new Date(Date.now() - 60_000).toISOString(),
  fim: null, duracao_s: null, ultima_atividade: null, n_atividades: 0, tarefa: null, ...p,
});

describe("subStatus: issues e resumo", () => {
  it("duração desconhecida some; rodando aproximado vira 'há ≥ X min'", () => {
    const agora = Date.now();
    expect(textoDuracaoSub(mk(1, { inicio_aproximado: true }), agora)).toBeNull();
    expect(textoDuracaoSub(mk(2, { status: "rodando", inicio_aproximado: true, inicio: new Date(agora - 7 * 60_000).toISOString() }), agora)).toBe("há ≥ 7 min");
  });
  it("resumo simples e agrupado por issue", () => {
    const l = [...Array.from({ length: 8 }, (_, i) => mk(i, { issues: [587] })), ...[20, 21, 22].map((i) => mk(i, { issues: [588] })), mk(30), mk(31), mk(40, { status: "erro" })];
    expect(resumoTerminadosSub(l, false)).toBe("✓ 13 concluídos · ✕ 1 erro");
    expect(resumoTerminadosSub(l)).toBe("✓ 8 concluídos em #587 · 3 em #588 · 2 sem issue · ✕ 1 erro");
    expect(agruparPorIssue(l).map((g) => g.issue)).toEqual([587, 588, null]);
    expect(resumoTerminadosSub([mk(1)])).toBe("✓ 1 concluído");
  });
  it("destino do chip", () => {
    expect(destinoIssue(588)).toBe("/conversas?q=%23588");
    expect(destinoIssue(588, "p-1")).toBe("/conversas/p-1");
  });
});
