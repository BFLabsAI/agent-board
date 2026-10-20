import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { cliente, definirWorkspaceAtivo } from "../api/cliente";
import { StreamProvider, useEvento, useRecarregar } from "../api/useStream";
import { PROJETO_TODOS, WORKSPACE_TODOS, type FabricaFonte } from "../api/stream";
import type { Periodo, Projeto, WorkspaceResumo } from "../api/tipos";
import { mesclarWorkspace, workspacesOnline } from "../api/workspaces";
import { gravarLocal, lerLocal } from "../lib/armazenamento";

export const CHAVE_PROJETO = "agent-board:projeto";
export const CHAVE_PERIODO = "agent-board:periodo";
export const PERIODOS: ReadonlyArray<{ valor: Periodo; rotulo: string }> = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "24h", rotulo: "24 h" },
  { valor: "7d", rotulo: "7 dias" },
];

interface Valor {
  /** projeto efetivo; null = deixa o servidor escolher o padrão */
  projeto: string | null;
  /** nome a exibir: o escolhido ou o marcado como "atual" pelo servidor */
  projetoExibido: string | null;
  projetos: Projeto[];
  projetosCarregando: boolean;
  setProjeto: (nome: string) => void;
  periodo: Periodo;
  setPeriodo: (p: Periodo) => void;
  /** modo TV (?tv=1): sem sidebar */
  tv: boolean;
  /** true na tela Visão geral (/geral): todos os squads, sem projeto único */
  geral: boolean;
  /** true no Office em modo Andar (/office?modo=andar): também usa o stream de todos os squads */
  andar: boolean;
  /** Workspace remoto efetivo (vai no prefixo do cliente); null = o local ou o padrão */
  workspace: string | null;
  /** Workspace escolhido para exibir: o da URL ou o local */
  workspaceSelecionado: string | null;
  workspaces: WorkspaceResumo[];
  workspacesCarregando: boolean;
  recarregarWorkspaces: () => void;
  /** abre a Visão geral do Workspace; "*" abre a tela Workspaces */
  setWorkspace: (id: string) => void;
  /** true na tela Workspaces (/workspaces): stream de todos os Workspaces */
  telaWorkspaces: boolean;
  /** true no Office em modo Prédio (/office?modo=predio): também usa o stream de todos os Workspaces */
  predio: boolean;
  /** true enquanto se decide se a abertura em "/" vai para /geral (esperando o cadastro) */
  inicioPendente: boolean;
}

export const CAMINHO_GERAL = "/geral";
export const CAMINHO_OFFICE = "/office";
export const CAMINHO_WORKSPACES = "/workspaces";
/** Parâmetros que acompanham a navegação entre telas */
const PARAMS_FIXOS = ["periodo", "tv"];

const Ctx = createContext<Valor | null>(null);

function periodoValido(v: string | null): Periodo | null {
  return v === "hoje" || v === "24h" || v === "7d" ? v : null;
}

export function ProvedorPainel({ children, fabricaStream }: { children: ReactNode; fabricaStream?: FabricaFonte }) {
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const andar = pathname === CAMINHO_OFFICE && (params.get("modo") === "andar" || params.get("projeto") === PROJETO_TODOS);
  // Visão geral e Office/Andar olham todos os squads: stream "*" e seletor em "Todos os squads"
  const geral = pathname === CAMINHO_GERAL || andar;
  // abriu em "/" sem ?projeto=: com mais de 1 projeto no cadastro, cai na Visão geral (uma vez só)
  const telaWorkspaces = pathname === CAMINHO_WORKSPACES;
  const predio = pathname === CAMINHO_OFFICE && params.get("modo") === "predio";
  // as duas telas olham todos os Workspaces: stream `workspace=*`
  const todosWorkspaces = telaWorkspaces || predio;
  const [inicioPendente, setInicioPendente] = useState(() => pathname === "/" && !params.get("projeto") && !params.get("workspace"));
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [projetosCarregando, setCarregando] = useState(true);
  const [workspaces, setWorkspaces] = useState<WorkspaceResumo[]>([]);
  const [workspacesCarregando, setWsCarregando] = useState(true);
  const [tiqueWs, setTiqueWs] = useState(0);
  const recarregarWorkspaces = useCallback(() => setTiqueWs((t) => t + 1), []);

  const periodo = periodoValido(params.get("periodo")) ?? periodoValido(lerLocal(CHAVE_PERIODO)) ?? "hoje";
  // Workspace da URL; o local não precisa de prefixo (assim que a lista chega e o identifica)
  const workspaceUrl = params.get("workspace") || null;
  const workspace = workspaceUrl && !workspaces.find((w) => w.id === workspaceUrl)?.local ? workspaceUrl : null;
  // as chamadas que não passam `workspace` (paginação, etc.) leem o ativo daqui, já no render
  definirWorkspaceAtivo(todosWorkspaces ? null : workspace);

  useEffect(() => {
    const ac = new AbortController();
    cliente
      .workspaces({ periodo }, ac.signal)
      .then((r) => setWorkspaces(r.workspaces))
      .catch(() => {
        if (!ac.signal.aborted) setWorkspaces([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setWsCarregando(false);
      });
    return () => ac.abort();
  }, [periodo, tiqueWs]);

  useEffect(() => {
    const ac = new AbortController();
    setCarregando(true);
    cliente
      .projetos(ac.signal, workspace)
      .then((p) => setProjetos(p))
      .catch(() => {
        if (!ac.signal.aborted) setProjetos([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setCarregando(false);
      });
    return () => ac.abort();
  }, [workspace]);

  useEffect(() => {
    if (!inicioPendente || projetosCarregando || workspacesCarregando) return;
    setInicioPendente(false);
    const n = new URLSearchParams();
    for (const k of PARAMS_FIXOS) {
      const v = params.get(k);
      if (v) n.set(k, v);
    }
    const qs = n.toString();
    if (workspacesOnline(workspaces).length > 1) {
      navigate({ pathname: CAMINHO_WORKSPACES, search: qs ? `?${qs}` : "" }, { replace: true });
    } else if (projetos.length > 1) {
      navigate({ pathname: CAMINHO_GERAL, search: qs ? `?${qs}` : "" }, { replace: true });
    }
  }, [inicioPendente, projetosCarregando, workspacesCarregando, workspaces, projetos, params, navigate]);

  const escolhido = params.get("projeto") || (workspace ? null : lerLocal(CHAVE_PROJETO)) || null;
  // se a lista já chegou e o projeto escolhido não existe mais, volta ao padrão do servidor
  const projeto = escolhido && (projetosCarregando || projetos.length === 0 || projetos.some((p) => p.projeto === escolhido)) ? escolhido : null;
  const tv = params.get("tv") === "1";

  const atualizar = useCallback(
    (chave: string, valor: string | null) => {
      setParams(
        (ant) => {
          const n = new URLSearchParams(ant);
          if (valor) n.set(chave, valor);
          else n.delete(chave);
          return n;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  /** Parâmetros que seguem junto na navegação: período, modo TV e o Workspace */
  const mantidos = useCallback(
    (extra: Record<string, string> = {}) => {
      const n = new URLSearchParams(extra);
      for (const k of [...PARAMS_FIXOS, "workspace"]) {
        const v = params.get(k);
        if (v && !n.has(k)) n.set(k, v);
      }
      return n.toString() ? `?${n.toString()}` : "";
    },
    [params],
  );

  const setProjeto = useCallback(
    (nome: string) => {
      if (geral) {
        // da Visão geral para um squad: vai ao Dashboard dele (do Andar, ao Office dele)
        if (nome === PROJETO_TODOS) return;
        if (!workspace) gravarLocal(CHAVE_PROJETO, nome);
        navigate({ pathname: andar ? CAMINHO_OFFICE : "/", search: mantidos({ projeto: nome }) });
        return;
      }
      if (nome === PROJETO_TODOS) {
        navigate({ pathname: CAMINHO_GERAL, search: mantidos() });
        return;
      }
      if (!workspace) gravarLocal(CHAVE_PROJETO, nome);
      atualizar("projeto", nome);
    },
    [atualizar, geral, andar, navigate, mantidos, workspace],
  );

  const setWorkspace = useCallback(
    (id: string) => {
      const n = new URLSearchParams();
      for (const k of PARAMS_FIXOS) {
        const v = params.get(k);
        if (v) n.set(k, v);
      }
      if (id === WORKSPACE_TODOS) {
        navigate({ pathname: CAMINHO_WORKSPACES, search: n.toString() ? `?${n.toString()}` : "" });
        return;
      }
      n.set("workspace", id);
      navigate({ pathname: CAMINHO_GERAL, search: `?${n.toString()}` });
    },
    [navigate, params],
  );
  const setPeriodo = useCallback(
    (p: Periodo) => {
      gravarLocal(CHAVE_PERIODO, p);
      atualizar("periodo", p);
    },
    [atualizar],
  );

  // deixa o projeto escolhido visível na URL (link compartilhável)
  useEffect(() => {
    if (!geral && !todosWorkspaces && !inicioPendente && projeto && params.get("projeto") !== projeto) atualizar("projeto", projeto);
  }, [geral, todosWorkspaces, inicioPendente, projeto, params, atualizar]);

  const valor = useMemo<Valor>(
    () => ({
      projeto,
      projetoExibido: projeto ?? projetos.find((p) => p.atual)?.projeto ?? projetos[0]?.projeto ?? null,
      projetos,
      projetosCarregando,
      setProjeto,
      periodo,
      setPeriodo,
      tv,
      geral,
      andar,
      workspace,
      workspaceSelecionado: workspaceUrl ?? workspaces.find((w) => w.local)?.id ?? null,
      workspaces,
      workspacesCarregando,
      recarregarWorkspaces,
      setWorkspace,
      telaWorkspaces,
      predio,
      inicioPendente,
    }),
    [projeto, projetos, projetosCarregando, setProjeto, periodo, setPeriodo, tv, geral, andar, workspace, workspaceUrl, workspaces, workspacesCarregando, recarregarWorkspaces, setWorkspace, telaWorkspaces, predio, inicioPendente],
  );

  return (
    <Ctx.Provider value={valor}>
      <StreamProvider
        projeto={todosWorkspaces ? null : geral ? PROJETO_TODOS : projeto}
        workspace={todosWorkspaces ? WORKSPACE_TODOS : workspace}
        fabrica={fabricaStream}
      >
        <ColetorWorkspaces aplicar={setWorkspaces} recarregar={recarregarWorkspaces} />
        {children}
      </StreamProvider>
    </Ctx.Provider>
  );
}

/** Mantém a lista de Workspaces viva: eventos `workspace` do stream `workspace=*` e refazer ao reconectar. */
function ColetorWorkspaces({ aplicar, recarregar }: { aplicar: (f: (l: WorkspaceResumo[]) => WorkspaceResumo[]) => void; recarregar: () => void }) {
  useEvento("workspace", (w) => aplicar((l) => mesclarWorkspace(l, w)));
  useRecarregar(recarregar);
  return null;
}

export function useContextoPainel(): Valor {
  const v = useContext(Ctx);
  if (!v) throw new Error("useContextoPainel fora do ProvedorPainel");
  return v;
}
