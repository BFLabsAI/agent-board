#!/usr/bin/env python3
"""
agent-board: hook que padroniza a comunicação entre agentes via Orca.

Baseado no template da skill agent-hook-development (decide() + dialetos).
Parte da skill agent-board. O install.sh liga este arquivo ao Claude Code
(~/.claude/settings.json: PreToolUse, PostToolUse, Stop) e ao OMP
(~/.omp/agent/hooks/pre/agent-board.ts). Estado em ~/.agent-hooks/agent-board.

Identidade: o remetente é o painel em $ORCA_TERMINAL_HANDLE, procurado em
paineis.json (cadastro feito pelo master com painel.py). O nome da sessão
não conta.

Só age em comandos `orca` que envolvem o time:
  - orchestration send --to <nome do time | term_ cadastrado>
  - terminal send --terminal <nome do time | term_ cadastrado>
Todo o resto passa sem opinião.

Sempre sai com código 0. Stdout leva só a decisão JSON; logs vão para stderr.
"""
import hashlib
import json
import os
import re
import secrets
import shlex
import sys
import time

import notificar
from avisos import avisar, disparar, uma_vez
from base import (CONFIG_REL, HOME, LOG_REL, NOME_RE, PAINEIS, VERSAO, Barrado, achar_orca, agora,  # noqa: F401
                  carregar_config, carregar_paineis, eh_maestri, ler_json, master_do_projeto, meu_handle, papel_do_nome,
                  registrar_aviso)
from politica import MODOS, TIPOS, escolher_por_papel, pendentes_de, validar_envio  # noqa: F401
from protecao import PROTEGIDOS, escreve_em_protegido
from registro import gravar_log, ler_log


# Gate: se a política quebrar num comando orca do time, o envio é barrado.
FAIL_CLOSED = True

# Os tipos do time viram um --type aceito pelo Orca.
TIPO_ORCA = {"pedido": "handoff", "resposta": "status", "aviso": "status",
             "escalacao": "status", "entrega": "status", "andamento": "status"}
# Flags nossas: o hook lê e remove antes de entregar ao Orca.
FLAGS_TIME = {"--modo": "modo", "--issues": "issues", "--responde-a": "responde_a",
              "--veredito": "veredito", "--prazo": "prazo"}
COM_VALOR = {"--to", "--from", "--type", "--subject", "--body", "--terminal", "--text"} | set(FLAGS_TIME)

BOARD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "board.py")
MAESTRI_RE = re.compile(r"""(?:^|[\s;&|(`/"'])(?:maestri|\$\{?MAESTRI_CLI\}?)["']?\s+ask\b""")
ORCA_RE = re.compile(r"(?:^|[\s;&|(`/])orca\s+(?:orchestration\s+(?:send|reply|ask)|terminal\s+send)\b")










# ---------------------------------------------------------------------------
# Leitura do comando
# ---------------------------------------------------------------------------
def separar(cmd, do_envio=False):
    """Devolve argv do comando orca, exigindo que ele esteja sozinho.

    Operadores de shell (; && | > etc.) fora de aspas indicam mais de um comando.
    Texto entre aspas pode ter qualquer coisa, inclusive quebras de linha.
    `do_envio`: comando montado pelo envio.py (MCP, board.py), que nunca passa por
    um shell; aí crase e $( ) no texto são só texto.
    """
    if not do_envio and re.search(r"`|\$\(", cmd):
        raise Barrado("não use ` nem $( ) no comando orca; escreva o texto direto")
    try:
        lex = shlex.shlex(cmd, posix=True, punctuation_chars=True)
        lex.whitespace_split = True
        tokens = list(lex)
        argv = shlex.split(cmd)
    except ValueError as exc:
        raise Barrado(f"não consegui ler o comando ({exc}); confira as aspas")
    if any(t and set(t) <= set(";&|<>()") for t in tokens):
        raise Barrado("rode o comando orca sozinho, sem ;, &&, | ou redirecionamento junto")
    while argv and re.match(r"^[A-Z_][A-Z0-9_]*=", argv[0]):
        argv.pop(0)  # VAR=valor na frente
    if not argv or os.path.basename(argv[0]) != "orca":
        raise Barrado("o comando precisa começar com orca")
    return argv


def opcoes(argv, inicio):
    """--flag valor -> dict; flags sem valor viram True. Mantém a ordem.

    Flags de COM_VALOR sempre levam o próximo token, mesmo que comece com --
    (ex.: --body "--- resumo").
    """
    out, i = [], inicio
    while i < len(argv):
        a = argv[i]
        if not a.startswith("--"):
            raise Barrado(f"argumento solto não reconhecido: {a}")
        if "=" in a:
            k, v = a.split("=", 1)
            out.append((k, v))
            i += 1
        elif i + 1 < len(argv) and (a in COM_VALOR or not argv[i + 1].startswith("--")):
            out.append((a, argv[i + 1]))
            i += 2
        else:
            out.append((a, True))
            i += 1
    return out


def achar_destino(alvo, paineis, projeto):
    """Nome do time ou term_ cadastrado -> (handle, dados). None se não for do time."""
    if alvo in paineis:
        return alvo, paineis[alvo]
    achados = [(h, p) for h, p in paineis.items() if p.get("agente") == alvo]
    if not achados:
        return None
    if projeto:
        achados = [x for x in achados if x[1].get("projeto") == projeto] or achados
    if len(achados) > 1:
        raise Barrado(f"o nome {alvo} está cadastrado em mais de um painel; peça ao master para recadastrar")
    return achados[0]


def prefixo_de(eu):
    try:
        return carregar_config(eu["raiz"]).get("prefixo", "")
    except Barrado:
        return ""


def nomes_do_projeto(paineis, eu):
    return sorted(p["agente"] for h, p in paineis.items()
                  if p.get("projeto") == eu.get("projeto") and p.get("agente") != eu.get("agente"))


def parece_do_time(alvo):
    return bool(papel_do_nome(alvo))


def cmd_envio(handle):
    """Como o agente desse painel manda mensagem ao time: Orca no shell, Maestri pelo board.py (ou board_send).

    Com $AGENT_BOARD_HOME fora do padrão, o comando leva a variável: quem o copia
    precisa enxergar o mesmo cadastro.
    """
    if not eh_maestri(handle):
        return "orca orchestration send"
    padrao = os.path.expanduser("~/.agent-hooks/agent-board")
    env = "" if os.path.abspath(HOME) == os.path.abspath(padrao) else f"AGENT_BOARD_HOME={shlex.quote(HOME)} "
    return f"{env}python3 {BOARD} send"


def novo_id():
    return f"c-{agora():%Y%m%d-%H%M%S}-{secrets.token_hex(2)}"


def pre_send(ev, argv, sub_inicio, paineis, eu_handle, eu):
    ops = opcoes(argv, sub_inicio)
    d = dict(ops)
    alvo = d.get("--to")
    if not isinstance(alvo, str):
        return None  # sem destino explícito: fluxo interno do Orca (run:)
    if alvo.startswith(("run:", "dispatch:")):
        return None  # orquestração própria do agente (workers, runs)
    if alvo.startswith("papel:") and eu is not None:
        alvo = rotear_por_papel(alvo[len("papel:"):], paineis, eu)
    destino = achar_destino(alvo, paineis, eu.get("projeto") if eu else None)
    if destino is None and eu is not None:
        destino = achar_destino(f"{prefixo_de(eu)}-{alvo}", paineis, eu.get("projeto"))
    if destino is None:
        if eu is not None:
            raise Barrado(f"{alvo} não é um agente cadastrado do projeto {eu['projeto']}. "
                          f"Agentes válidos: {', '.join(nomes_do_projeto(paineis, eu))}. "
                          "Agente do time só fala com agentes do mesmo projeto; se falta alguém, peça ao master")
        return None  # painel sem cadastro falando com quem não é do time
    if eu is None:
        raise Barrado(f"este painel ({eu_handle or 'sem handle'}) não está cadastrado no agent-board. "
                      "Peça ao master para recadastrar os painéis")
    if ev["raw"].get("agent_id"):
        raise Barrado("subagent não fala com outros agentes; devolva para a sessão principal enviar")
    para_handle, para = destino
    if para_handle == eu_handle:
        raise Barrado("não dá para enviar mensagem para si mesmo")
    if para.get("projeto") != eu.get("projeto"):
        raise Barrado(f"{para['agente']} é de outro projeto ({para.get('projeto')}); mensagem entre projetos é barrada")
    if eh_maestri(para_handle) and not ev["raw"].get("agent_board_envio"):
        raise Barrado(f"{para['agente']} está no Maestri: o orca não entrega lá. Envie com "
                      f"{cmd_envio(para_handle)} (mesmas flags) ou com a ferramenta MCP board_send")

    tipo = d.get("--type")
    if tipo not in TIPOS:
        raise Barrado(f"use --type com um tipo do time: {', '.join(TIPOS)}")
    assunto = d.get("--subject")
    if not isinstance(assunto, str) or not assunto.strip():
        raise Barrado("--subject é obrigatório")
    modo = d.get("--modo") if isinstance(d.get("--modo"), str) else None
    cfg = carregar_config(eu["raiz"])
    r = validar_envio(cfg, eu, para, tipo, modo, d.get("--responde-a"), d.get("--veredito"), d.get("--prazo"),
                      ler_log(eu["raiz"]))
    issues = []
    if isinstance(d.get("--issues"), str):
        issues = [int(x) for x in re.findall(r"\d+", d["--issues"])]

    cid = novo_id()
    extra = notificar.extras_entrega(tipo, eu, ev.get("cwd"))
    rotulo = tipo + (f"·{modo}" if modo else "")
    corpo = d.get("--body") if isinstance(d.get("--body"), str) else ""
    corpo += f"\n\n---\n[agent-board {cid}] de {eu['agente']} para {para['agente']}. "
    if tipo in ("resposta", "andamento"):  # resposta e andamento não se respondem (o hook barraria)
        corpo += ("Não responda a esta mensagem: " + ("ela fecha a conversa; para algo novo, mande um pedido ou aviso."
                  if tipo == "resposta" else "é o progresso de um pedido seu; a resposta final ainda vem."))
    else:
        corpo += (f"Para responder: {cmd_envio(para_handle)} --to {eu['agente']} --type resposta "
                  f"--responde-a {cid}" + (" --veredito aprovado|rejeitado" if tipo == "entrega" else "")
                  + " --subject \"...\" --body \"...\"")
    if tipo == "pedido":
        corpo += (f"\nPedido longo: mande antes --type andamento --responde-a {cid} com o progresso"
                  + (f". Prazo: {r['prazo']}" if r["prazo"] else ""))

    novo = [argv[0]] + argv[1:sub_inicio]
    ignorar = {"--to", "--from", "--type", "--subject", "--body"} | set(FLAGS_TIME)
    for k, v in ops:
        if k in ignorar:
            continue
        novo += [k] if v is True else [k, v]
    novo += ["--to", para_handle, "--from", eu_handle, "--type", TIPO_ORCA[tipo],
             "--subject", f"[{cid} {rotulo}] {assunto.strip()}", "--body", corpo]

    gravar_log(eu["raiz"], {
        "id": cid, "ts": agora().isoformat(timespec="seconds"),
        "de": eu["agente"], "para": para["agente"], "tipo": tipo, "modo": modo,
        "assunto": assunto.strip(), "issues": issues,
        "responde_a": d.get("--responde-a") if isinstance(d.get("--responde-a"), str) else None,
        **extra,  # entrega de quem tem worktree: a branch dele
        **{k: r[k] for k in ("prazo", "veredito") if r[k] is not None},  # só aparecem quando usados
    })
    if r["ping_pong"]:
        alertar_ping_pong(eu, paineis, r["ping_pong"], cid)
    novo_input = dict(ev["tool_input"])
    novo_input["command"] = shlex.join(novo)
    guardar_envio(cid, novo)
    guardar_pendente(ev, novo_input["command"], {"id": cid, "tipo": rotulo, "de": eu["agente"],
                                                 "para_handle": para_handle, "raiz": eu["raiz"],
                                                 "tipo_time": tipo, "para": para["agente"],
                                                 "assunto": assunto.strip(), "issues": issues, **extra})
    return {"action": "allow", "updated_input": novo_input}


def rotear_por_papel(papel, paineis, eu):
    """--to papel:<papel> -> nome do agente desse papel com menos pedidos abertos no projeto."""
    candidatos = [p["agente"] for p in paineis.values() if p.get("projeto") == eu.get("projeto")
                  and p.get("papel") == papel and p.get("agente") != eu.get("agente")]
    escolhido = escolher_por_papel(candidatos, ler_log(eu["raiz"]))
    if escolhido is None:
        raise Barrado(f"nenhum agente com papel {papel} cadastrado no projeto {eu['projeto']} além de você. "
                      f"Agentes válidos: {', '.join(nomes_do_projeto(paineis, eu)) or 'nenhum'}. "
                      "Mande --to <nome> ou peça ao master para cadastrar")
    return escolhido


def alertar_ping_pong(eu, paineis, pp, cid):
    """Conversa demais entre o mesmo par: registra e avisa o master, uma vez por par por janela."""
    a, b = pp["par"]
    if not uma_vez(f"{eu['raiz']}|{a}|{b}", pp["janela_min"] * 60):
        return
    texto = (f"[agent-board] Ping-pong: {pp['n']} mensagens entre {a} e {b} em {pp['janela_min']} min, "
             f"sem entrega. Veja: painel.py historico --raiz {eu['raiz']} --agente {a}")
    registrar_aviso(f"{cid} {texto}")
    master = master_do_projeto(paineis, eu.get("projeto"))
    if master:
        disparar(master, cid, texto)


def pre_terminal_send(ev, argv, sub_inicio, paineis, eu_handle, eu):
    d = dict(opcoes(argv, sub_inicio))
    alvo = d.get("--terminal")
    if not isinstance(alvo, str):
        return None
    destino = achar_destino(alvo, paineis, eu.get("projeto") if eu else None)
    if destino is None and eu is None:
        return None  # painel sem cadastro digitando em painel sem cadastro: fora do time
    if (eu and eu.get("papel") == "master" and not ev["raw"].get("agent_id")
            and destino is not None and destino[1].get("projeto") == eu.get("projeto")):
        return None  # o master pode digitar nos painéis do próprio time (ex.: /clear)
    raise Barrado("não digite no painel de outro agente. Use orca orchestration send; "
                  "o aviso na tela do destino é automático. Só o master digita, e só nos painéis do próprio time")


def chaves(ev, cmd):
    tid = ev["raw"].get("tool_use_id") or ev["raw"].get("toolCallId")
    out = [hashlib.sha1(cmd.encode()).hexdigest()]
    if tid:
        out.insert(0, re.sub(r"[^A-Za-z0-9_-]", "", str(tid)))
    return out


def guardar_pendente(ev, cmd_novo, dados):
    """Pre e post podem ver o comando original ou o traduzido: guarda pelas duas formas."""
    pasta = os.path.join(HOME, "pendentes")
    os.makedirs(pasta, exist_ok=True)
    for k in set(chaves(ev, ev["command"]) + chaves(ev, cmd_novo)):
        with open(os.path.join(pasta, k + ".json"), "w") as f:
            json.dump(dados, f)


ENVIOS_DIAS = 7  # quanto tempo o comando de cada envio fica guardado para o painel.py reenviar


def guardar_envio(cid, argv):
    """Guarda o comando traduzido (com o corpo) fora do git, para o painel.py reenviar."""
    pasta = os.path.join(HOME, "envios")
    os.makedirs(pasta, exist_ok=True)
    with open(os.path.join(pasta, cid + ".json"), "w") as f:
        json.dump({"argv": argv}, f, ensure_ascii=False)


def limpar_velhos(pasta, segundos):
    try:
        for nome in os.listdir(pasta):
            c = os.path.join(pasta, nome)
            if time.time() - os.path.getmtime(c) > segundos:
                os.remove(c)
    except OSError:
        pass


def tirar_pendente(ev):
    pasta = os.path.join(HOME, "pendentes")
    achado = None
    for k in chaves(ev, ev["command"] or ""):
        caminho = os.path.join(pasta, k + ".json")
        if os.path.exists(caminho):
            if achado is None:
                with open(caminho) as f:
                    achado = json.load(f)
            os.remove(caminho)
    limpar_velhos(pasta, 3600)  # envio que falhou e nunca teve post
    limpar_velhos(os.path.join(HOME, "envios"), ENVIOS_DIAS * 86400)
    return achado



def post_send(ev, paineis):
    """Depois do envio: digita um aviso curto na tela do destino (em segundo plano)."""
    p = tirar_pendente(ev)
    if p is None:
        return None
    resposta = str(ev["raw"].get("tool_response") or "")
    if re.search(r"\berror\b|\"ok\": false", resposta, re.I) and "Sent msg_" not in resposta:
        registrar_aviso(f"{p['id']} envio falhou, aviso não digitado")
        if p.get("raiz"):  # a linha do pre_send fica, mas sai da cobrança e do --responde-a
            gravar_log(p["raiz"], {"id": p["id"], "ts": agora().isoformat(timespec="seconds"), "status": "falhou"})
        return None
    para_handle = p["para_handle"]
    if eh_maestri(para_handle):  # no Maestri o próprio `maestri ask` já digitou a mensagem no destino
        notificar.disparar(p)
        return None
    disparar(para_handle, p["id"], f"[agent-board] Nova mensagem {p['id']} ({p['tipo']}) de {p['de']}. "
             f"Leia com: orca orchestration check --terminal {para_handle} --format")
    notificar.disparar(p)  # webhook e GitHub, em outro processo
    return None


# ---------------------------------------------------------------------------
# Política
# ---------------------------------------------------------------------------
def envolve_orca(ev):
    return ev["tool"] == "shell" and bool(ORCA_RE.search(ev["command"] or ""))


def envolve_time(cmd, paineis, eu):
    """Painel sem cadastro só é afetado quando o comando cita um painel ou agente cadastrado."""
    if eu is not None:
        return True
    if any(h in cmd for h in paineis):
        return True
    nomes = {p.get("agente") for p in paineis.values()}
    return any(t.strip("'\"") in nomes for t in re.split(r"[\s=]+", cmd))


MAX_COBRANCAS = 3  # quantas vezes o Stop segura o agente pelas mesmas pendências


def decide_stop(ev):
    if ev["raw"].get("agent_id"):
        return None  # subagent não responde mensagens do time
    eu_handle = meu_handle()
    eu = carregar_paineis().get(eu_handle)
    if eu is None:
        return None
    pend = pendentes_de(eu)
    if not pend:
        return None
    ids = sorted(l["id"] for l in pend)
    pasta = os.path.join(HOME, "cobrancas")
    os.makedirs(pasta, exist_ok=True)
    arq = os.path.join(pasta, eu_handle + ".json")
    conta = ler_json(arq, {})
    vezes = conta.get("vezes", 0) + 1 if conta.get("ids") == ids else 1
    if vezes > MAX_COBRANCAS:
        registrar_aviso(f"{eu['agente']} encerrou com {len(ids)} mensagem(ns) sem resposta: {','.join(ids)}")
        return None
    with open(arq, "w") as f:
        json.dump({"ids": ids, "vezes": vezes}, f)
    por_remetente = {}
    for l in pend:
        por_remetente.setdefault(l["de"], []).append(l)
    cmds = []
    for de, ls in por_remetente.items():
        lista = ",".join(x["id"] for x in ls)
        assuntos = "; ".join(f"{x['id']} ({x['tipo']}): {x['assunto']}" for x in ls)
        cmds.append(f"- De {de}: {assuntos}\n  Responda: {cmd_envio(eu_handle)} --to {de} --type resposta "
                    f"--responde-a {lista} --subject \"...\" --body \"...\"")
    return {"action": "continue", "reason": (
        "agent-board: regra do time - toda mensagem recebida precisa de resposta antes de encerrar: "
        "pedido se responde com o resultado ou o bloqueio (sem 'Recebido'); aviso, com uma resposta curta. "
        "Pedido longo ainda em curso: mande --type andamento --responde-a <id> com o progresso (para a cobrança; "
        "o pedido segue aberto até a resposta). "
        + ("A mensagem chegou digitada neste terminal (role a tela se não leu)"
           if eh_maestri(eu_handle) else f"Leia com orca orchestration check --terminal {eu_handle} --format "
           "se ainda não leu") + ", e responda:\n" + "\n".join(cmds))}


def decide_sendmessage(ev):
    """Canal nativo do Claude entre sessões: fechado entre agentes do time (sem log, pede aprovação)."""
    alvo = re.sub(r"\s*\[[^\]]*\]$", "", str(ev["tool_input"].get("to") or "")).strip()
    paineis = carregar_paineis()
    eu = paineis.get(meu_handle())
    nomes = {p.get("agente") for p in paineis.values()}
    do_time = alvo in nomes
    if eu is not None and not do_time:
        do_time = bool(papel_do_nome(alvo))
    if eu is not None and not do_time:
        try:
            prefixo = carregar_config(eu["raiz"]).get("prefixo", "")
        except Barrado:
            prefixo = ""
        do_time = alvo.startswith("uds:") or bool(prefixo and alvo.startswith(prefixo + "-"))
    if not do_time:
        return None  # subagent da própria sessão, ou fora do time
    return {"action": "deny", "reason": (
        f"Barrado pelo agent-board: entre agentes do time não use SendMessage (fica sem registro e pode "
        f"travar esperando aprovação). Use: {cmd_envio(meu_handle())} --to {alvo or '<agente>'} "
        "--type <pedido|resposta|aviso|escalacao|entrega|andamento> --subject \"...\" --body \"...\"")}



def decide_protecao(ev):
    """Log e cadastro só são escritos pelo hook e pelo painel.py, nunca à mão por um agente do time."""
    if ev["event"] != "pre_tool":
        return None
    alvo_cmd = ev["command"] or ""
    alvo_arq = str(ev["file_path"] or "")
    toca = [n for n in PROTEGIDOS if n in alvo_cmd or alvo_arq.endswith(n)]
    if not toca:
        return None
    if carregar_paineis().get(meu_handle()) is None:
        return None  # só vale para agentes do time
    if ev["tool"] == "edit" or (ev["tool"] == "shell" and escreve_em_protegido(alvo_cmd)):
        return {"action": "deny", "reason": (
            f"Barrado pelo agent-board: {', '.join(toca)} não se edita à mão. O log é escrito só pelo hook "
            "a cada orca orchestration send, e o cadastro só pelo master com painel.py. Para ler, use cat, jq ou grep.")}
    return None


def alvos_maestri_ask(cmd):
    """([nomes no canvas], tem --raw?) de cada `maestri ask` do comando, ou None se não deu para ler."""
    try:
        tokens = shlex.split(cmd)
    except ValueError:
        return None
    alvos, raw = [], False
    for i, t in enumerate(tokens):
        if not (os.path.basename(t) == "maestri" or t.strip("${}") == "MAESTRI_CLI") or tokens[i + 1:i + 2] != ["ask"]:
            continue
        resto = tokens[i + 2:]
        if resto[:1] == ["--batch"]:
            try:
                alvos += list(json.loads(resto[1]))
            except (IndexError, ValueError, TypeError):
                return None
        elif resto:
            alvos.append(resto[0])
            raw = raw or "--raw" in resto[1:3]
    return alvos, raw


def do_time_no_canvas(nome, paineis):
    """Cadastro do agente cujo nome no canvas (ou nome do time) é `nome` ("Nome @ Workspace" também vale)."""
    nome = re.sub(r"\s+@\s+.*$", "", nome or "").strip()
    for p in paineis.values():
        if nome and nome in (p.get("nome_canvas"), p.get("agente")):
            return p
    return None


def decide_maestri_ask(ev):
    """`maestri ask` direto para um agente do time fica sem registro, regra e cobrança: só pelo agent-board."""
    paineis = carregar_paineis()
    eu = paineis.get(meu_handle())
    lido = alvos_maestri_ask(ev["command"] or "")
    if lido is None:
        if eu is None:
            return None
        return {"action": "deny", "reason": "Barrado pelo agent-board: não consegui ler o maestri ask "
                                            "(confira as aspas e o JSON do --batch) e rode-o sozinho"}
    alvos, raw = lido
    do_time = [(a, do_time_no_canvas(a, paineis)) for a in alvos]
    do_time = [(a, p) for a, p in do_time if p is not None]
    if not do_time:
        return None  # ajudante fora do time (recruta, terminal avulso)
    if (raw and eu is not None and eu.get("papel") == "master" and not ev["raw"].get("agent_id")
            and all(p.get("projeto") == eu.get("projeto") for _, p in do_time)):
        return None  # o master pode digitar nos painéis do próprio time (ex.: /clear)
    nomes = ", ".join(sorted({p["agente"] for _, p in do_time}))
    if raw:
        motivo = (f"não digite no painel de outro agente ({nomes}). Só o master digita, e só nos painéis do "
                  "próprio time")
    else:
        motivo = (f"{nomes} é do time: mensagem entre agentes do time passa pelo agent-board (registro, regras, "
                  f"cobrança de resposta). Use: {cmd_envio(meu_handle())} --to <agente> "
                  "--type <pedido|resposta|aviso|escalacao|entrega|andamento> --subject \"...\" --body \"...\" "
                  "(ou a ferramenta MCP board_send)")
    return {"action": "deny", "reason": f"Barrado pelo agent-board: {motivo}"}


def decide(ev):
    if ev["event"] == "stop":
        return decide_stop(ev)
    protecao = decide_protecao(ev)
    if protecao is not None:
        return protecao
    if ev["event"] == "pre_tool" and ev["tool_name"] == "SendMessage":
        return decide_sendmessage(ev)
    if ev["event"] == "pre_tool" and ev["tool"] == "shell" and MAESTRI_RE.search(ev["command"] or ""):
        d = decide_maestri_ask(ev)
        if d is not None:  # sem maestri ask para o time (ex.: o texto só cita o comando), segue o fluxo
            return d
    if not envolve_orca(ev):
        return None
    if ev["event"] not in ("pre_tool", "post_tool"):
        return None
    paineis = carregar_paineis()
    eu_handle = meu_handle()
    eu = paineis.get(eu_handle)
    if not envolve_time(ev["command"], paineis, eu):
        return None  # comando orca de quem não é do time, para quem não é do time
    try:
        argv = separar(ev["command"], do_envio=bool(ev["raw"].get("agent_board_envio")))
        if len(argv) < 3:
            return None
        grupo, verbo = argv[1], argv[2]
        if ev["event"] == "post_tool":
            if (grupo, verbo) == ("orchestration", "send"):
                return post_send(ev, paineis)
            return None
        if (grupo, verbo) == ("orchestration", "send"):
            return pre_send(ev, argv, 3, paineis, eu_handle, eu)
        if (grupo, verbo) == ("terminal", "send"):
            return pre_terminal_send(ev, argv, 3, paineis, eu_handle, eu)
        if grupo == "orchestration" and verbo in ("reply", "ask") and eu is not None:
            raise Barrado(f"agente do time não usa orchestration {verbo}: fica fora do registro. "
                          "Use orca orchestration send --to <agente> --type resposta --responde-a <id> "
                          "(ou --type pedido para perguntar algo novo)")
        return None
    except Barrado as exc:
        if ev["event"] != "pre_tool":
            return None
        return {"action": "deny", "reason": f"Barrado pelo agent-board: {exc}"}


# ---------------------------------------------------------------------------
# Normalização e saída (dialeto Claude; Codex usa o mesmo formato).
# Recorte do template da skill agent-hook-development.
# ---------------------------------------------------------------------------
CLAUDE_EVENTS = {"PreToolUse": "pre_tool", "PostToolUse": "post_tool", "PostToolUseFailure": "other",
                 "Stop": "stop"}
SHELL_TOOLS = {"bash", "shell", "run_shell_command", "exec_command"}
EDIT_TOOLS = {"edit", "write", "multiedit", "notebookedit", "apply_patch", "write_file", "replace"}


def normalize(p, dialect):
    native = p.get("hook_event_name", "")
    tool_name = p.get("tool_name")
    tool_input = p.get("tool_input") if isinstance(p.get("tool_input"), dict) else {}
    return {
        "event": CLAUDE_EVENTS.get(native, "other"),
        "native_event": native,
        "dialect": dialect,
        "tool": ("shell" if (tool_name or "").lower() in SHELL_TOOLS
                 else "edit" if (tool_name or "").lower() in EDIT_TOOLS else "other"),
        "file_path": tool_input.get("file_path") or tool_input.get("path") or tool_input.get("filePath"),
        "tool_name": tool_name,
        "tool_input": tool_input,
        "command": tool_input.get("command"),
        "cwd": p.get("cwd"),
        "raw": p,
    }


def encode(ev, d):
    if d is None:
        return {}
    native = ev["native_event"]
    if ev["event"] == "pre_tool":
        if d["action"] == "deny":
            return {"hookSpecificOutput": {"hookEventName": native, "permissionDecision": "deny",
                                           "permissionDecisionReason": d["reason"]}}
        if d["action"] == "allow":
            return {"hookSpecificOutput": {"hookEventName": native, "permissionDecision": "allow",
                                           "updatedInput": d["updated_input"]}}
    if ev["event"] == "stop" and d["action"] == "continue":
        return {"decision": "block", "reason": d["reason"]}
    return {}



def main():
    if len(sys.argv) >= 5 and sys.argv[1] == "--avisar":
        avisar(*sys.argv[2:5])
        return
    dialect = "claude"
    try:
        payload = json.load(sys.stdin)
    except ValueError as exc:
        print(f"[agent-board] entrada ilegível: {exc}", file=sys.stderr)
        print("{}")
        return
    ev = normalize(payload, dialect)
    try:
        decision = decide(ev)
    except Exception as exc:  # a própria política quebrou
        print(f"[agent-board] decide() falhou: {exc!r}", file=sys.stderr)
        decision = None
        if FAIL_CLOSED and ev["event"] == "pre_tool" and envolve_orca(ev):
            decision = {"action": "deny",
                        "reason": f"Barrado: o hook agent-board falhou ({exc!r}); avise o master."}
    print(json.dumps(encode(ev, decision), ensure_ascii=False))


if __name__ == "__main__":
    main()
