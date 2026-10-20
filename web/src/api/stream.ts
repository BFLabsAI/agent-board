import type { EventosStream, NomeEvento } from "./tipos";

export type StatusStream = "conectando" | "conectado" | "reconectando" | "offline";

export interface FonteEventos {
  addEventListener(tipo: string, fn: (ev: MessageEvent) => void): void;
  close(): void;
  onopen: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
}
export type FabricaFonte = (url: string) => FonteEventos;

type Ouvinte<K extends NomeEvento> = (dado: EventosStream[K]) => void;

export interface OpcoesStream {
  projeto?: string | null;
  fabrica?: FabricaFonte;
  /** espera inicial e teto do backoff exponencial (ms) */
  baseMs?: number;
  tetoMs?: number;
  /** sem nenhum evento (nem ping) por este tempo, reconecta (ms). O servidor manda ping a cada 15 s. */
  silencioMs?: number;
  /** falhas seguidas até o status virar "offline" */
  falhasParaOffline?: number;
}

const NOMES: NomeEvento[] = ["ola", "mensagem", "agente", "tarefa", "subagente", "ping"];

export function urlStream(projeto?: string | null): string {
  return projeto ? `/api/stream?projeto=${encodeURIComponent(projeto)}` : "/api/stream";
}

/**
 * Conexão SSE com reconexão e backoff. Não tem replay no servidor: ao
 * reconectar (depois de já ter conectado uma vez), avisa os ouvintes de
 * "recarregar" para as telas refazerem o REST.
 */
export class ConexaoStream {
  status: StatusStream = "conectando";
  private fonte: FonteEventos | null = null;
  private ouvintes = new Map<NomeEvento, Set<(d: never) => void>>();
  private aoMudarStatus = new Set<(s: StatusStream) => void>();
  private aoRecarregar = new Set<() => void>();
  private tentativas = 0;
  private jaConectou = false;
  private fechado = false;
  private timerReconexao: ReturnType<typeof setTimeout> | null = null;
  private timerSilencio: ReturnType<typeof setTimeout> | null = null;
  private readonly o: Required<Omit<OpcoesStream, "projeto">> & { projeto?: string | null };

  constructor(opcoes: OpcoesStream = {}) {
    this.o = {
      fabrica: (url) => new EventSource(url) as unknown as FonteEventos,
      baseMs: 1000,
      tetoMs: 15000,
      silencioMs: 40000,
      falhasParaOffline: 3,
      ...opcoes,
    };
    // opcoes.fabrica pode vir como undefined explícito (ProvedorPainel fora do modo fixtures)
    this.o.fabrica = opcoes.fabrica ?? ((url) => new EventSource(url) as unknown as FonteEventos);
  }

  iniciar(): void {
    this.fechado = false;
    this.conectar();
  }

  parar(): void {
    this.fechado = true;
    if (this.timerReconexao) clearTimeout(this.timerReconexao);
    if (this.timerSilencio) clearTimeout(this.timerSilencio);
    this.fonte?.close();
    this.fonte = null;
  }

  assinar<K extends NomeEvento>(nome: K, fn: Ouvinte<K>): () => void {
    let set = this.ouvintes.get(nome);
    if (!set) this.ouvintes.set(nome, (set = new Set()));
    set.add(fn as (d: never) => void);
    return () => set.delete(fn as (d: never) => void);
  }

  aoMudar(fn: (s: StatusStream) => void): () => void {
    this.aoMudarStatus.add(fn);
    return () => this.aoMudarStatus.delete(fn);
  }

  /** Disparado quando a conexão volta depois de uma queda. */
  aoVoltar(fn: () => void): () => void {
    this.aoRecarregar.add(fn);
    return () => this.aoRecarregar.delete(fn);
  }

  private definir(s: StatusStream) {
    if (this.status === s) return;
    this.status = s;
    this.aoMudarStatus.forEach((f) => f(s));
  }

  private conectar() {
    if (this.fechado) return;
    const fonte = this.o.fabrica(urlStream(this.o.projeto));
    this.fonte = fonte;
    fonte.onopen = () => {
      if (this.fonte !== fonte) return;
      const voltou = this.jaConectou;
      this.jaConectou = true;
      this.tentativas = 0;
      this.definir("conectado");
      this.armarSilencio();
      if (voltou) this.aoRecarregar.forEach((f) => f());
    };
    fonte.onerror = () => {
      if (this.fonte !== fonte) return;
      this.falhar();
    };
    for (const nome of NOMES) {
      fonte.addEventListener(nome, (ev) => {
        if (this.fonte !== fonte) return;
        this.armarSilencio();
        if (!this.ouvintes.get(nome)?.size) return;
        let dado: unknown;
        try {
          dado = JSON.parse(ev.data as string);
        } catch {
          return; // evento malformado é ignorado
        }
        this.ouvintes.get(nome)?.forEach((f) => (f as (d: unknown) => void)(dado));
      });
    }
  }

  private armarSilencio() {
    if (this.timerSilencio) clearTimeout(this.timerSilencio);
    this.timerSilencio = setTimeout(() => this.falhar(), this.o.silencioMs);
  }

  private falhar() {
    if (this.fechado) return;
    this.fonte?.close();
    this.fonte = null;
    if (this.timerSilencio) clearTimeout(this.timerSilencio);
    this.tentativas += 1;
    this.definir(this.tentativas >= this.o.falhasParaOffline ? "offline" : "reconectando");
    const espera = Math.min(this.o.tetoMs, this.o.baseMs * 2 ** (this.tentativas - 1));
    this.timerReconexao = setTimeout(() => this.conectar(), espera);
  }
}
