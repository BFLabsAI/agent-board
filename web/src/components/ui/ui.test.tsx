import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ESTILO_ESTADO_TAREFA, ESTILO_STATUS_AGENTE, chaveTipoMsg } from "../../lib/cores";
import { AgentAvatar, Segmented, StatusBadge, TempoRelativo, TipoMsgBadge } from ".";

afterEach(() => vi.useRealTimers());

describe("StatusBadge", () => {
  it.each(Object.entries(ESTILO_STATUS_AGENTE))("agente %s", (status, e) => {
    render(<StatusBadge status={status as never} />);
    const b = screen.getByText(e.rotulo);
    expect(b.closest("[data-status]")).toHaveAttribute("data-status", status);
    expect(b.closest("span")).toHaveClass(e.texto);
  });

  it.each(Object.entries(ESTILO_ESTADO_TAREFA))("tarefa %s", (estado, e) => {
    render(<StatusBadge status={estado as never} />);
    expect(screen.getByText(e.rotulo).closest("span")).toHaveClass(e.texto, e.fundo, e.borda);
  });

  it("rótulos em português", () => {
    render(
      <>
        <StatusBadge status="esperando" />
        <StatusBadge status="aguardando_revisao" />
      </>,
    );
    expect(screen.getByText("Esperando você")).toBeInTheDocument();
    expect(screen.getByText("Aguardando revisão")).toBeInTheDocument();
  });
});

describe("TipoMsgBadge", () => {
  it("resposta rejeitada vira rejeição", () => {
    expect(chaveTipoMsg({ tipo: "resposta", veredito: "rejeitado" })).toBe("rejeicao");
    expect(chaveTipoMsg({ tipo: "resposta", veredito: "aprovado" })).toBe("resposta");
    expect(chaveTipoMsg({ tipo: "qualquer" })).toBe("nota");
    render(<TipoMsgBadge mensagem={{ tipo: "resposta", veredito: "rejeitado" }} />);
    expect(screen.getByText("Rejeição")).toBeInTheDocument();
  });
});

describe("AgentAvatar", () => {
  it("é determinístico por nome", () => {
    const { container: a } = render(<AgentAvatar nome="r7one-manager01-cc" />);
    const { container: b } = render(<AgentAvatar nome="r7one-manager01-cc" />);
    const forma = (c: HTMLElement) => c.querySelector("svg")!.innerHTML.replace(/id="[^"]*"|url\(#[^)]*\)/g, "");
    expect(forma(a)).toBe(forma(b));
  });
  it("usa a cor do papel", () => {
    const { container } = render(<AgentAvatar nome="r7one-master" />);
    expect(container.querySelector("svg")!.innerHTML).toContain("#f59e0b");
  });
});

describe("Segmented", () => {
  it("marca a opção ativa e avisa a troca", () => {
    const fn = vi.fn();
    render(<Segmented ariaLabel="Visão" opcoes={[{ valor: "a", rotulo: "Agentes" }, { valor: "t", rotulo: "Tarefas" }]} valor="a" onChange={fn} />);
    expect(screen.getByRole("radio", { name: "Agentes" })).toBeChecked();
    screen.getByRole("radio", { name: "Tarefas" }).click();
    expect(fn).toHaveBeenCalledWith("t");
  });
});

describe("TempoRelativo", () => {
  it("mostra 'há 4 min' e atualiza sozinho", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
    render(<TempoRelativo iso="2026-10-20T11:56:00Z" />);
    expect(screen.getByText("há 4 min")).toBeInTheDocument();
    act(() => {
      vi.setSystemTime(new Date("2026-10-20T12:06:00Z"));
      vi.advanceTimersByTime(15_000);
    });
    expect(screen.getByText("há 10 min")).toBeInTheDocument();
  });
});
