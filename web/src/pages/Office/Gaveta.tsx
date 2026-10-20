import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Bot, ChevronRight, ClipboardList, ExternalLink, ListChecks, FolderGit2, GitBranch, Inbox, MessagesSquare, Radio, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Agente, Mensagem, SubAgente, Tarefa } from "../../api/tipos";
import { cliente } from "../../api/cliente";
import { useApi } from "../../api/useApi";
import { useEvento } from "../../api/useStream";
import { LinkPainel } from "../../components/LinkPainel";
import { AgentAvatar, Badge, Skeleton, StatusBadge, TempoRelativo, TipoMsgBadge } from "../../components/ui";
import { estiloPapel, ESTILO_ESTADO_TAREFA } from "../../lib/cores";
import { nomeCurto, truncar } from "../../lib/formato";
import { IssueChips } from "../../components/SubLinha";
import { agruparPorIssue, issuesSub } from "../../lib/subStatus";
import { DuracaoSub } from "./DuracaoSub";
import { descricaoSub, emDestaque, ESTILO_SUB, mesclarSub, ordenarSubs, resumoTerminados, nomeSub, subsDe, tipoDetalhe, textoAtividade } from "./subagentes";
import { useContextoPainel } from "../../context/ContextoPainel";
import { useReduzirMovimento } from "./useReduzirMovimento";

const ABERTAS = new Set(["aberto", "em_andamento", "atrasado", "aguardando_revisao"]);
const LINHAS_TELA = 40;
const SUBS_VISIVEIS = 5;

/** Texto do terminal sem escapes ANSI e só o final (a parte que importa). */
export function limparTela(tela: string | null | undefined): string {
  if (!tela) return "";
  // eslint-disable-next-line no-control-regex
  const limpa = tela.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  return limpa.split(/\r?\n/).map((l) => l.replace(/\s+$/, "")).slice(-LINHAS_TELA).join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
}

function Secao({ icone: Icone, titulo, extra, children }: { icone: typeof Inbox; titulo: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-border px-5 py-4">
      <h3 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-texto-fraco">
        <Icone className="h-3.5 w-3.5" aria-hidden="true" />
        {titulo}
        {extra && <span className="ml-auto normal-case tracking-normal">{extra}</span>}
      </h3>
      {children}
    </section>
  );
}

function Terminal({ agente }: { agente: Agente }) {
  const texto = useMemo(() => limparTela(agente.tela), [agente.tela]);
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [texto]);
  const vivo = agente.status === "trabalhando";
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-[#05050a]" data-testid="terminal">
      <div className="flex items-center gap-1.5 border-b border-border bg-surface-2 px-3 py-1.5">
        <span className="h-2 w-2 rounded-full bg-red-400/70" />
        <span className="h-2 w-2 rounded-full bg-amber-400/70" />
        <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
        <span className="ml-2 truncate font-mono text-[10px] text-texto-fraco">{agente.handle}</span>
        <span className={`ml-auto inline-flex items-center gap-1 text-[10px] ${vivo ? "text-status-trabalhando" : "text-texto-fraco"}`}>
          <Radio className={`h-3 w-3 ${vivo ? "animate-pulse-dot" : ""}`} aria-hidden="true" />
          ao vivo
        </span>
      </div>
      {texto ? (
        <pre ref={ref} className="max-h-64 min-h-[5rem] overflow-auto whitespace-pre-wrap break-words px-3 py-2.5 font-mono text-[11px] leading-[1.45] text-emerald-200/90" aria-label="Tela do terminal">
          {texto}
          {vivo && <span className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 animate-pulse bg-emerald-300/80" aria-hidden="true" />}
        </pre>
      ) : (
        <p className="px-3 py-6 text-center font-mono text-[11px] text-texto-fraco">sem saída de terminal</p>
      )}
      <div className="border-t border-border px-3 py-1 text-[10px] text-texto-fraco">
        última saída <TempoRelativo iso={agente.ultima_saida} />
      </div>
    </div>
  );
}

/** Querystring `?projeto=` para links da gaveta quando o agente é de um projeto que não é o da URL (Office/Andar). */
const qsProjeto = (projeto?: string, workspace?: string) =>
  [projeto ? `projeto=${encodeURIComponent(projeto)}` : "", workspace ? `workspace=${encodeURIComponent(workspace)}` : ""].filter(Boolean).join("&");

/** Id do Workspace para as chamadas ao cliente: o local não leva prefixo (null); sem `workspace`, vale o ativo (undefined). */
function useWorkspaceApi(workspace?: string): string | null | undefined {
  const { workspaces } = useContextoPainel();
  if (!workspace) return undefined;
  return workspaces.find((w) => w.id === workspace)?.local ? null : workspace;
}

function UltimasMensagens({ agente, projeto, workspace }: { agente: string; projeto?: string; workspace?: string }) {
  const wsApi = useWorkspaceApi(workspace);
  const { dados, carregando, erro } = useApi((c, s) => cliente.mensagens({ projeto: projeto ?? c.projeto, agente, limite: 10, ...(workspace ? { workspace: wsApi } : {}) }, s), [agente, projeto, workspace]);
  const [novas, setNovas] = useState<Mensagem[]>([]);
  useEffect(() => setNovas([]), [agente, projeto, workspace]);
  useEvento("mensagem", (m) => {
    if (projeto && (m as { projeto?: string }).projeto !== projeto) return;
    if (workspace && (m as { workspace?: string }).workspace !== workspace) return;
    if (m.de === agente || m.para === agente) setNovas((n) => [m, ...n].slice(0, 10));
  });
  const lista = useMemo(() => {
    const vistos = new Set<string>();
    return [...novas, ...(dados?.mensagens ?? [])]
      .filter((m) => (vistos.has(m.id) ? false : (vistos.add(m.id), true)))
      .sort((a, b) => (a.ts < b.ts ? 1 : -1))
      .slice(0, 10);
  }, [dados, novas]);

  if (carregando && lista.length === 0) return <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (erro && lista.length === 0) return <p className="text-sm text-texto-fraco">Não foi possível carregar as mensagens.</p>;
  if (lista.length === 0) return <p className="text-sm text-texto-fraco">Nenhuma mensagem deste agente ainda.</p>;
  return (
    <ol className="space-y-1.5" data-testid="mensagens-agente">
      {lista.map((m) => (
        <li key={m.id} className="rounded-lg border border-border bg-surface-2 px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] text-texto-fraco">
            <TipoMsgBadge mensagem={m} className="!px-2 !py-0.5 !text-[10px]" />
            <span className="inline-flex min-w-0 items-center gap-1 truncate">
              {nomeCurto(m.de)} <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" /> {nomeCurto(m.para)}
            </span>
            <TempoRelativo iso={m.ts} className="ml-auto shrink-0" />
          </div>
          <p className="mt-1 truncate text-[13px] text-texto" title={m.assunto}>{m.assunto || "(sem assunto)"}</p>
        </li>
      ))}
    </ol>
  );
}

function ItemSub({ sub, foco, projeto, workspace }: { sub: SubAgente; foco: boolean; projeto?: string; workspace?: string }) {
  const e = ESTILO_SUB[sub.status];
  const atividade = textoAtividade(sub);
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (foco) ref.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [foco]);
  return (
    <li
      ref={ref}
      data-testid="sub-item"
      data-sub={sub.id}
      data-status={sub.status}
      data-foco={foco || undefined}
      className={`rounded-lg border bg-surface-2 px-3 py-2 ${foco ? "border-accent ring-1 ring-accent/60" : sub.status === "erro" ? "border-red-400/40" : sub.status === "perdido" ? "border-dashed border-amber-400/40" : "border-border"}`}
    >
      <div className="flex items-center gap-2 text-[11px]">
        <span className={`h-2 w-2 shrink-0 rounded-full ${sub.status === "rodando" ? "animate-pulse-dot" : ""}`} style={{ background: e.hex }} aria-hidden="true" />
        <span className="min-w-0 truncate font-semibold text-texto">{nomeSub(sub)}</span>
        {tipoDetalhe(sub) ? <span className="min-w-0 flex-1 truncate text-[10px] text-texto-fraco" data-testid="sub-tipo">{tipoDetalhe(sub)}</span> : <span className="flex-1" />}
        {sub.fundo && (
          <span data-testid="sub-fundo" className="rounded border border-border-light px-1 py-px text-[9px] uppercase tracking-wider text-texto-fraco">em segundo plano</span>
        )}
        <IssueChips issues={issuesSub(sub)} tarefaId={sub.tarefa?.id} />
        <span className={e.texto}>{e.rotulo}</span>
        <DuracaoSub sub={sub} className="font-mono tabular-nums text-texto-suave" />
      </div>
      {descricaoSub(sub) && <p className="mt-1 text-[13px] leading-snug text-texto">{truncar(descricaoSub(sub), 140)}</p>}
      {atividade && <p className="mt-1 truncate font-mono text-[10.5px] text-texto-fraco" title={atividade}>{atividade}</p>}
      {sub.tarefa && (
        <LinkPainel to={`/conversas/${encodeURIComponent(sub.tarefa.id)}${projeto ? `?${qsProjeto(projeto, workspace)}` : ""}`} className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-[11px] text-accent-hover hover:underline" title={sub.tarefa.assunto}>
          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{sub.tarefa.id} · {truncar(sub.tarefa.assunto, 48)}</span>
        </LinkPainel>
      )}
    </li>
  );
}

function SecaoSubs({ agente, foco, projeto, workspace }: { agente: Agente; foco: string | null; projeto?: string; workspace?: string }) {
  const wsApi = useWorkspaceApi(workspace);
  const locais = useMemo(() => ordenarSubs(subsDe(agente)), [agente]);
  const [todos, setTodos] = useState(false);
  useEffect(() => {
    setTodos(false);
  }, [agente.agente]);
  const api = useApi((c, s) => (todos ? cliente.subagentes({ projeto: projeto ?? c.projeto, agente: agente.agente, periodo: "24h", ...(workspace ? { workspace: wsApi } : {}) }, s) : Promise.resolve<SubAgente[]>([])), [todos, agente.agente, projeto, workspace]);
  const lista = useMemo(() => {
    if (!todos) return locais;
    // eventos ao vivo (locais) prevalecem sobre a listagem carregada
    let m = api.dados ?? [];
    for (const l of locais) m = mesclarSub(m, l);
    return ordenarSubs(m);
  }, [todos, api.dados, locais]);
  const destaque = lista.filter(emDestaque);
  const terminados = lista.filter((s) => !emDestaque(s));
  const focoNosTerminados = foco !== null && terminados.some((s) => s.id === foco);
  const [abertos, setAbertos] = useState(false);
  useEffect(() => {
    setAbertos(false);
  }, [agente.agente]);
  const mostrarTerminados = abertos || focoNosTerminados;
  const visiveisTerm = todos ? terminados : terminados.slice(0, SUBS_VISIVEIS);
  const rodando = locais.filter((s) => s.status === "rodando").length;
  const resumo = resumoTerminados(terminados);
  const gruposComIssue = terminados.some((s) => issuesSub(s).length > 0);
  return (
    <Secao icone={Bot} titulo="Sub-agents" extra={<span className="font-semibold text-texto" data-testid="subs-rodando">{rodando} rodando</span>}>
      {lista.length === 0 ? (
        <p className="text-sm text-texto-fraco">Nenhum sub-agent nas últimas 24 h.</p>
      ) : (
        <div className="space-y-3" data-testid="subs-gaveta">
          {destaque.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-texto-fraco">Rodando</h4>
              <ul className="space-y-1.5" data-testid="subs-rodando-lista">
                {destaque.map((s) => (
                  <ItemSub key={s.id} sub={s} foco={foco === s.id} projeto={projeto} workspace={workspace} />
                ))}
              </ul>
            </div>
          )}
          {terminados.length > 0 && (
            <div>
              <button
                type="button"
                data-testid="subs-terminados-toggle"
                aria-expanded={mostrarTerminados}
                onClick={() => setAbertos((v) => !v)}
                className="flex w-full items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-texto-fraco hover:text-texto-suave"
              >
                <ChevronRight className={`h-3 w-3 transition-transform ${mostrarTerminados ? "rotate-90" : ""}`} aria-hidden="true" />
                Terminados
                {resumo && <span className="font-normal normal-case tracking-normal">{resumo}</span>}
              </button>
              {mostrarTerminados && (
                <div className="mt-1.5 space-y-2" data-testid="subs-terminados-lista">
                  {agruparPorIssue(visiveisTerm).map((g) => (
                    <div key={g.issue ?? "sem"} data-grupo={g.issue ?? "sem"}>
                      {gruposComIssue && (
                        <h5 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-texto-fraco">{g.issue === null ? "Sem issue" : `#${g.issue}`} ({g.subs.length})</h5>
                      )}
                      <ul className="space-y-1.5">
                        {g.subs.map((s) => (
                          <ItemSub key={s.id} sub={s} foco={foco === s.id} projeto={projeto} workspace={workspace} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {todos && api.carregando && <Skeleton className="mt-2 h-10 w-full" />}
      {!todos && mostrarTerminados && terminados.length > SUBS_VISIVEIS && (
        <button type="button" onClick={() => setTodos(true)} className="mt-2 text-[12px] text-accent-hover hover:underline">
          ver todos ({terminados.length}+)
        </button>
      )}
    </Secao>
  );
}

/** Gaveta lateral com o trabalho do agente selecionado. */
/** `projeto`: squad do agente quando ele não é o da URL (Office/Andar, stream de todos os squads). */
/** `workspace`: Workspace do agente no Prédio (stream `workspace=*`); os dados vêm dele. */
export function Gaveta({ agente, tarefas, aoFechar, subFoco = null, projeto, workspace }: { agente: Agente | null; tarefas: Tarefa[]; aoFechar: () => void; subFoco?: string | null; projeto?: string; workspace?: string }) {
  const reduzido = useReduzirMovimento();
  useEffect(() => {
    if (!agente) return;
    const fn = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [agente, aoFechar]);

  const tarefasAbertas = useMemo(
    () => (agente ? tarefas.filter((t) => t.para === agente.agente && ABERTAS.has(t.estado)) : []),
    [agente, tarefas],
  );

  return (
    <AnimatePresence>
      {agente && (
        <motion.aside
          key="gaveta"
          role="complementary"
          aria-label={`Trabalho de ${agente.agente}`}
          data-testid="gaveta"
          data-projeto={projeto}
          data-workspace={workspace}
          initial={reduzido ? { opacity: 0 } : { x: 420, opacity: 0.4 }}
          animate={reduzido ? { opacity: 1 } : { x: 0, opacity: 1 }}
          exit={reduzido ? { opacity: 0 } : { x: 420, opacity: 0 }}
          transition={reduzido ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 38 }}
          className="absolute inset-y-0 right-0 z-20 flex w-[400px] max-w-full flex-col overflow-y-auto border-l border-border-light bg-surface-1/95 shadow-[-20px_0_40px_-20px_rgba(0,0,0,0.8)] backdrop-blur-md"
        >
          <header className="flex items-start gap-3 px-5 py-4">
            <AgentAvatar nome={agente.agente} papel={agente.papel} tamanho={52} status={agente.status} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-semibold text-texto" title={agente.agente}>{agente.agente}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge className={`${estiloPapel(agente.papel).texto} ${estiloPapel(agente.papel).fundo} ${estiloPapel(agente.papel).borda} !py-0.5`}>{estiloPapel(agente.papel).rotulo}</Badge>
                {agente.harness && <Badge tom="neutro" className="!py-0.5 uppercase">{agente.harness}</Badge>}
                <StatusBadge status={agente.status} className="!py-0.5" />
              </div>
            </div>
            <button
              type="button"
              onClick={aoFechar}
              aria-label="Fechar gaveta"
              className="rounded-md p-1.5 text-texto-fraco transition-colors hover:bg-surface-4 hover:text-texto"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>

          <div className="space-y-1 px-5 pb-4 font-mono text-[11px] text-texto-suave">
            {agente.worktree && (
              <p className="flex items-center gap-2 truncate" title={agente.worktree}>
                <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-texto-fraco" aria-hidden="true" />
                {agente.worktree}
              </p>
            )}
            <p className="flex items-center gap-2 truncate" title={agente.branch ?? ""}>
              <GitBranch className="h-3.5 w-3.5 shrink-0 text-texto-fraco" aria-hidden="true" />
              {agente.branch ?? "sem branch"}
            </p>
          </div>

          <Secao icone={Radio} titulo="Tela do terminal">
            <Terminal agente={agente} />
          </Secao>

          <Secao icone={ClipboardList} titulo="Tarefa atual">
            {agente.tarefa_atual ? (
              <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <StatusBadge status={agente.tarefa_atual.estado} rotulo={ESTILO_ESTADO_TAREFA[agente.tarefa_atual.estado]?.rotulo} className="!py-0.5 !text-[10px]" />
                  <span className="ml-auto font-mono text-[10px] text-texto-fraco">{agente.tarefa_atual.id}</span>
                </div>
                <p className="mt-1.5 text-sm text-texto">{agente.tarefa_atual.assunto}</p>
              </div>
            ) : (
              <p className="text-sm text-texto-fraco">Sem tarefa em andamento.</p>
            )}
          </Secao>

          <SecaoSubs agente={agente} foco={subFoco} projeto={projeto} workspace={workspace} />

          <Secao icone={Inbox} titulo="Mensagens sem resposta" extra={<span className="font-semibold text-texto" data-testid="sem-resposta">{agente.pendentes}</span>}>
            <p className="text-sm text-texto-fraco">
              {agente.pendentes > 0
                ? `${agente.pendentes} ${agente.pendentes === 1 ? "mensagem recebida ainda sem resposta" : "mensagens recebidas ainda sem resposta"}.`
                : "Nenhuma mensagem aguardando resposta."}
            </p>
          </Secao>

          <Secao icone={ListChecks} titulo="Tarefas abertas" extra={<span className="font-semibold text-texto" data-testid="tarefas-abertas">{tarefasAbertas.length}</span>}>
            {tarefasAbertas.length > 0 ? (
              <ul className="space-y-1.5" data-testid="pendentes-agente">
                {tarefasAbertas.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${ESTILO_ESTADO_TAREFA[t.estado].ponto}`} />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-texto" title={t.assunto}>{truncar(t.assunto, 60)}</span>
                    <span className="shrink-0 text-[10px] text-texto-fraco">{ESTILO_ESTADO_TAREFA[t.estado].rotulo}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-texto-fraco">Nenhuma tarefa aberta para este agente.</p>
            )}
          </Secao>

          <Secao icone={MessagesSquare} titulo="Últimas mensagens">
            <UltimasMensagens agente={agente.agente} projeto={projeto} workspace={workspace} />
          </Secao>

          <div className="mt-auto border-t border-border px-5 py-3">
            <LinkPainel
              to={`/conversas?agente=${encodeURIComponent(agente.agente)}${projeto ? `&${qsProjeto(projeto, workspace)}` : ""}`}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-accent-hover transition-colors hover:bg-accent-muted"
            >
              Ver conversas de {nomeCurto(agente.agente)} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </LinkPainel>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
