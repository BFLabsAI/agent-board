import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { nomeCurto, truncar } from "../lib/formato";
import { LimiteErro } from "./LimiteErro";

function Quebra(): never {
  throw new Error("dado torto");
}

describe("LimiteErro", () => {
  it("mostra o aviso no lugar da tela que quebrou", () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <LimiteErro>
        <Quebra />
      </LimiteErro>,
    );
    expect(screen.getByText("Esta tela falhou ao renderizar")).toBeInTheDocument();
    expect(screen.getByText(/dado torto/)).toBeInTheDocument();
    erro.mockRestore();
  });
});

describe("formato com dado ausente", () => {
  it("não quebra com null/undefined", () => {
    expect(nomeCurto(null)).toBe("");
    expect(truncar(undefined, 10)).toBe("");
  });
});
