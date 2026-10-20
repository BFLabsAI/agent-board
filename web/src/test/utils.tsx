import { render } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { vi } from "vitest";
import { App } from "../App";
import { cliente } from "../api/cliente";
import {
  agentesFixture, conversasFixture, projetosFixture, resumoFixture, tarefasFixture,
} from "../api/fixtures";
import type { FabricaFonte, FonteEventos } from "../api/stream";
import { ProvedorPainel } from "../context/ContextoPainel";

/** EventSource controlável para os testes. */
export class FonteFalsa implements FonteEventos {
  static todas: FonteFalsa[] = [];
  onopen: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  fechada = false;
  private ouv = new Map<string, Array<(ev: MessageEvent) => void>>();
  constructor(public url: string) {
    FonteFalsa.todas.push(this);
  }
  addEventListener(tipo: string, fn: (ev: MessageEvent) => void) {
    this.ouv.set(tipo, [...(this.ouv.get(tipo) ?? []), fn]);
  }
  close() {
    this.fechada = true;
  }
  abrir() {
    this.onopen?.(new Event("open"));
  }
  falhar() {
    this.onerror?.(new Event("error"));
  }
  emitir(tipo: string, dado: unknown, bruto?: string) {
    this.ouv.get(tipo)?.forEach((f) => f({ data: bruto ?? JSON.stringify(dado) } as MessageEvent));
  }
}
export const fabricaFalsa: FabricaFonte = (url) => new FonteFalsa(url);

export function mockarCliente() {
  vi.spyOn(cliente, "projetos").mockImplementation(async () => projetosFixture());
  vi.spyOn(cliente, "resumo").mockImplementation(async () => resumoFixture());
  vi.spyOn(cliente, "agentes").mockImplementation(async () => agentesFixture());
  vi.spyOn(cliente, "tarefas").mockImplementation(async () => tarefasFixture());
  vi.spyOn(cliente, "conversas").mockImplementation(async () => conversasFixture());
}

export function LocalizacaoAtual() {
  const l = useLocation();
  return <div data-testid="local">{l.pathname + l.search}</div>;
}

export function renderPainel(rota = "/") {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <ProvedorPainel fabricaStream={fabricaFalsa}>
        <App />
        <LocalizacaoAtual />
      </ProvedorPainel>
    </MemoryRouter>,
  );
}
