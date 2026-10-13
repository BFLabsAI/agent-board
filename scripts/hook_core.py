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
import datetime
import fcntl
import hashlib
import fnmatch
import json
import os
import re
import secrets
import shlex
import shutil
import subprocess
import sys
import time

try:
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "VERSION")) as _v:
        VERSAO = _v.read().strip()
except OSError:
    VERSAO = "desconhecida"
HOME = os.environ.get("AGENT_BOARD_HOME", os.path.expanduser("~/.agent-hooks/agent-board"))
PAINEIS = os.path.join(HOME, "paineis.json")
CONFIG_REL = "docs/agent-board/agent-board.json"
LOG_REL = "docs/agent-board/comunicacoes.jsonl"

# Gate: se a política quebrar num comando orca do time, o envio é barrado.
FAIL_CLOSED = True

TIPOS = ("pedido", "resposta", "aviso", "escalacao", "entrega")
MODOS = ("orquestrar", "executar")
# Os tipos do time viram um --type aceito pelo Orca.
TIPO_ORCA = {"pedido": "handoff", "resposta": "status", "aviso": "status",
             "escalacao": "status", "entrega": "status"}
# Flags nossas: o hook lê e remove antes de entregar ao Orca.
FLAGS_TIME = {"--modo": "modo", "--issues": "issues", "--responde-a": "responde_a"}
COM_VALOR = {"--to", "--from", "--type", "--subject", "--body", "--terminal", "--text"} | set(FLAGS_TIME)

ORCA_RE = re.compile(r"(?:^|[\s;&|(`/])orca\s+(?:orchestration\s+(?:send|reply|ask)|terminal\s+send)\b")
NOME_RE = re.compile(r"^(?P<prefixo>[a-z0-9]+)-(?:(?P<master>master)|(?P<papel>manager|researcher)(?P<nn>\d{2})-(?P<rt>[a-z]+))$")


class Barrado(Exception):
    pass


# ---------------------------------------------------------------------------
# Dados
# ---------------------------------------------------------------------------
def ler_json(caminho, padrao):
    try:
        with open(caminho) as f:
            return json.load(f)
    except FileNotFoundError:
        return padrao


def carregar_paineis():
    return ler_json(PAINEIS, {"versao": 1, "paineis": {}}).get("paineis", {})


def carregar_config(raiz):
    cfg = ler_json(os.path.join(raiz, CONFIG_REL), None)
    if cfg is None:
        raise Barrado(f"projeto sem {CONFIG_REL} em {raiz}; o master precisa configurar o agent-board")
    return cfg


def papel_do_nome(nome):
    m = NOME_RE.match(nome or "")
    if not m:
        return None
    return "master" if m.group("master") else m.group("papel")


def gravar_log(raiz, linha):
    caminho = os.path.join(raiz, LOG_REL)
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with open(caminho, "a") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        f.write(json.dumps(linha, ensure_ascii=False) + "\n")
        f.flush()
        fcntl.flock(f, fcntl.LOCK_UN)


def ler_log(raiz):
    """Mensagens do log do projeto, sem as que falharam no envio.

    Linha ilegível (escrita cortada, merge ruim) é pulada e anotada em avisos.log,
    para não travar o time inteiro.
    """
    linhas, falhas = [], set()
    try:
        with open(os.path.join(raiz, LOG_REL)) as f:
            for n, texto in enumerate(f, 1):
                if not texto.strip():
                    continue
                try:
                    l = json.loads(texto)
                except ValueError:
                    registrar_aviso(f"{LOG_REL}:{n} linha ilegível ignorada")
                    continue
                if l.get("status") == "falhou":
                    falhas.add(l.get("id"))
                elif "id" in l:
                    linhas.append(l)
    except FileNotFoundError:
        pass
    return [l for l in linhas if l["id"] not in falhas]


def agora():
    return datetime.datetime.now().astimezone()


# ---------------------------------------------------------------------------
# Leitura do comando
# ---------------------------------------------------------------------------
def separar(cmd):
    """Devolve argv do comando orca, exigindo que ele esteja sozinho.

    Operadores de shell (; && | > etc.) fora de aspas indicam mais de um comando.
    Texto entre aspas pode ter qualquer coisa, inclusive quebras de linha.
    """
    if re.search(r"`|\$\(", cmd):
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


# ---------------------------------------------------------------------------
# Regras
# ---------------------------------------------------------------------------
def checar_permissao(cfg, de, para, tipo, modo):
    papel_de, papel_para = de["papel"], para["papel"]
    regras = cfg.get("papeis", {}).get(papel_de)
    if regras is None:
        raise Barrado(f"papel {papel_de} não existe em agent-board.json")
    if tipo not in regras.get("tipos", []):
        raise Barrado(f"{papel_de} não envia '{tipo}'. Permitidos: {', '.join(regras.get('tipos', []))}")
    if tipo == "pedido" and papel_para not in regras.get("pode_pedir_a", []):
        raise Barrado(f"{papel_de} não pode fazer pedido a {papel_para}. Pode pedir a: "
                      f"{', '.join(regras.get('pode_pedir_a', [])) or 'ninguém'}")
    if tipo in ("escalacao", "entrega") and papel_para != "master":
        raise Barrado(f"'{tipo}' só vai para o master")
    if tipo == "pedido" and papel_para == "manager" and modo not in MODOS:
        raise Barrado("pedido para manager precisa de --modo orquestrar ou --modo executar")
    if modo and modo not in MODOS:
        raise Barrado(f"--modo inválido: {modo}. Use orquestrar ou executar")


def checar_responde_a(eu, valor):
    """Resposta fecha a conversa: aponta para mensagens que existem e que não são respostas."""
    if not isinstance(valor, str) or not valor.strip():
        raise Barrado("resposta precisa de --responde-a <id da mensagem original>")
    tipos = {l["id"]: (l.get("tipo"), l.get("para")) for l in ler_log(eu["raiz"])}
    for cid in (x.strip() for x in valor.split(",") if x.strip()):
        if cid not in tipos:
            raise Barrado(f"--responde-a {cid}: essa mensagem não existe no log do projeto")
        tipo, para = tipos[cid]
        if tipo == "resposta":
            raise Barrado(f"{cid} já é uma resposta, e resposta não se responde (a conversa está fechada). "
                          "Se precisa de algo novo, mande --type pedido ou --type aviso")
        if para != eu["agente"]:
            raise Barrado(f"{cid} não foi enviada para você ({para}); responda só ao que você recebeu")


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

    tipo = d.get("--type")
    if tipo not in TIPOS:
        raise Barrado(f"use --type com um tipo do time: {', '.join(TIPOS)}")
    assunto = d.get("--subject")
    if not isinstance(assunto, str) or not assunto.strip():
        raise Barrado("--subject é obrigatório")
    modo = d.get("--modo") if isinstance(d.get("--modo"), str) else None
    cfg = carregar_config(eu["raiz"])
    checar_permissao(cfg, eu, para, tipo, modo)
    if tipo == "resposta":
        checar_responde_a(eu, d.get("--responde-a"))
    issues = []
    if isinstance(d.get("--issues"), str):
        issues = [int(x) for x in re.findall(r"\d+", d["--issues"])]

    cid = novo_id()
    rotulo = tipo + (f"·{modo}" if modo else "")
    corpo = d.get("--body") if isinstance(d.get("--body"), str) else ""
    corpo += (f"\n\n---\n[agent-board {cid}] de {eu['agente']} para {para['agente']}. "
              f"Para responder: orca orchestration send --to {eu['agente']} --type resposta "
              f"--responde-a {cid} --subject \"...\" --body \"...\"")

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
    })
    novo_input = dict(ev["tool_input"])
    novo_input["command"] = shlex.join(novo)
    guardar_pendente(ev, novo_input["command"], {"id": cid, "tipo": rotulo, "de": eu["agente"],
                                                 "para_handle": para_handle, "raiz": eu["raiz"]})
    return {"action": "allow", "updated_input": novo_input}


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
    # limpa pendentes velhos (envio que falhou e nunca teve post)
    try:
        for nome in os.listdir(pasta):
            c = os.path.join(pasta, nome)
            if time.time() - os.path.getmtime(c) > 3600:
                os.remove(c)
    except OSError:
        pass
    return achado


def achar_orca():
    """O hook roda com PATH reduzido: procura o orca nos lugares conhecidos."""
    for c in (os.environ.get("ORCA_BIN", ""),
              os.path.join(os.environ.get("ORCA_REMOTE_CLI_BIN_DIR", ""), "orca"),
              shutil.which("orca") or "", os.path.expanduser("~/.orca-relay/bin/orca")):
        if c and os.access(c, os.X_OK):
            return c
    return "orca"


def registrar_aviso(texto):
    os.makedirs(HOME, exist_ok=True)
    with open(os.path.join(HOME, "avisos.log"), "a") as f:
        f.write(f"{agora().isoformat(timespec='seconds')} {texto}\n")


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
    aviso = (f"[agent-board] Nova mensagem {p['id']} ({p['tipo']}) de {p['de']}. "
             f"Leia com: orca orchestration check --terminal {para_handle} --format")
    try:
        with open(os.path.join(HOME, "avisos.log"), "a") as erros:
            subprocess.Popen([sys.executable, os.path.abspath(__file__), "--avisar", para_handle, p["id"], aviso],
                             stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                             stderr=erros, start_new_session=True)
    except OSError as exc:
        registrar_aviso(f"{p['id']} aviso não enviado: {exc}")
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


def pendentes_de(eu):
    """Mensagens recebidas por `eu` (menos respostas) que ele ainda não respondeu."""
    linhas = ler_log(eu["raiz"])
    desde = eu.get("cadastrado_em", "")
    respondidas = set()
    for l in linhas:
        if l.get("de") == eu["agente"] and l.get("responde_a"):
            respondidas.update(x.strip() for x in str(l["responde_a"]).split(","))
    return [l for l in linhas
            if l.get("para") == eu["agente"] and l.get("tipo") != "resposta"
            and l["id"] not in respondidas and l.get("ts", "") >= desde]


def decide_stop(ev):
    if ev["raw"].get("agent_id"):
        return None  # subagent não responde mensagens do time
    eu_handle = os.environ.get("ORCA_TERMINAL_HANDLE")
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
        cmds.append(f"- De {de}: {assuntos}\n  Responda: orca orchestration send --to {de} --type resposta "
                    f"--responde-a {lista} --subject \"...\" --body \"...\"")
    return {"action": "continue", "reason": (
        "agent-board: regra do time - toda mensagem recebida precisa de resposta antes de encerrar: "
        "pedido se responde com o resultado ou o bloqueio (sem 'Recebido'); aviso, com uma resposta curta. Leia com orca orchestration check --terminal "
        f"{eu_handle} --format se ainda não leu, e responda:\n" + "\n".join(cmds))}


def decide_sendmessage(ev):
    """Canal nativo do Claude entre sessões: fechado entre agentes do time (sem log, pede aprovação)."""
    alvo = re.sub(r"\s*\[[^\]]*\]$", "", str(ev["tool_input"].get("to") or "")).strip()
    paineis = carregar_paineis()
    eu = paineis.get(os.environ.get("ORCA_TERMINAL_HANDLE"))
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
        f"travar esperando aprovação). Use: orca orchestration send --to {alvo or '<agente>'} "
        "--type <pedido|resposta|aviso|escalacao|entrega> --subject \"...\" --body \"...\"")}


PROTEGIDOS = ("comunicacoes.jsonl", "paineis.json")
ESCRITA_RE = re.compile(r"\bsed\s+-i|\btee\b|\brm\b|\bmv\b|\bcp\b|\btruncate\b|\bdd\b|"
                        r"\bperl\s+-\w*i|write|open\([^)]*['\"][wax+]|\bunlink\b|\breplace\b|\btouch\b|\bchmod\b")
OPEN_ESCRITA_RE = re.compile(r"""open\(\s*(?:(['"])(?P<p>[^'"]+)\1)?[^)]*?['"][wax+][^'"]*['"]""")
WRITE_TEXT_RE = re.compile(r"""(?:Path\(\s*(?:(['"])(?P<p>[^'"]+)\1)?[^)]*\)|\w+)\.write(?:_text|_bytes)?\(""")
CMDS_ALVO_TODOS = {"rm", "unlink", "tee", "truncate", "touch", "chmod", "mv", "shred"}
OPERADORES = set(";&|()")


def _protegido(caminho):
    base = os.path.basename(caminho.rstrip("/"))
    return base in PROTEGIDOS or (any(c in base for c in "*?[") and any(fnmatch.fnmatchcase(n, base) for n in PROTEGIDOS))


def _duvida(caminho):
    """Alvo que não dá para resolver ($var, crase) conta como possível log."""
    return "$" in caminho or "`" in caminho


def alvos_de_escrita(cmd):
    """Lista os alvos de escrita do comando de shell, ou None se não deu para ler (aspas quebradas)."""
    try:
        lex = shlex.shlex(cmd, posix=True, punctuation_chars=True)
        lex.whitespace_split = True
        tokens = list(lex)
    except ValueError:
        return None
    alvos = []
    segmentos, atual = [], []
    for i, t in enumerate(tokens):
        if t and set(t) <= OPERADORES:
            segmentos.append(atual)
            atual = []
        else:
            atual.append(t)
        # redirecionamento de saída: o alvo é o próximo token
        if t and ">" in t and set(t) <= set("<>&|;0123456789"):
            prox = tokens[i + 1] if i + 1 < len(tokens) else ""
            if t.endswith("&") and re.fullmatch(r"\d+|-", prox):
                continue  # 2>&1, >&2
            if prox == "/dev/null" or not prox:
                continue
            alvos.append(prox)
    segmentos.append(atual)
    for seg in segmentos:
        for j, t in enumerate(seg):
            nome = os.path.basename(t)
            resto = seg[j + 1:]
            args = [a for a in resto if not a.startswith("-") or a == "-"]
            if nome in CMDS_ALVO_TODOS:
                alvos += args
            elif nome == "cp":
                alvos += args[-1:]
            elif nome == "sed" and any(re.fullmatch(r"-\w*i\w*|--in-place.*", a) for a in resto):
                alvos += args
            elif nome == "perl" and any(re.fullmatch(r"-\w*i\w*", a) for a in resto):
                alvos += args
            elif nome == "dd":
                alvos += [a[3:] for a in resto if a.startswith("of=")]
    return alvos


def escreve_em_protegido(cmd):
    """True quando algum alvo de escrita é o log ou o cadastro; na dúvida (alvo ilegível), True."""
    alvos = alvos_de_escrita(cmd)
    if alvos is None:
        return bool(ESCRITA_RE.search(cmd)) or ">" in cmd
    for a in alvos:
        if _protegido(a) or (_duvida(a) and any(n in cmd for n in PROTEGIDOS)):
            return True
        if os.path.basename(a.rstrip("/")) == "agent-board":  # rm -r docs/agent-board leva o log junto
            return True
    # python -c / heredoc: open(...,'w'|'a') e write_text/write
    for rx in (OPEN_ESCRITA_RE, WRITE_TEXT_RE):
        for m in rx.finditer(cmd):
            p = m.group("p")
            if p is None:
                if any(n in cmd for n in PROTEGIDOS):
                    return True  # alvo não literal e o nome do log está no comando
            elif _protegido(p):
                return True
    return False


def decide_protecao(ev):
    """Log e cadastro só são escritos pelo hook e pelo painel.py, nunca à mão por um agente do time."""
    if ev["event"] != "pre_tool":
        return None
    alvo_cmd = ev["command"] or ""
    alvo_arq = str(ev["file_path"] or "")
    toca = [n for n in PROTEGIDOS if n in alvo_cmd or alvo_arq.endswith(n)]
    if not toca:
        return None
    if carregar_paineis().get(os.environ.get("ORCA_TERMINAL_HANDLE")) is None:
        return None  # só vale para agentes do time
    if ev["tool"] == "edit" or (ev["tool"] == "shell" and escreve_em_protegido(alvo_cmd)):
        return {"action": "deny", "reason": (
            f"Barrado pelo agent-board: {', '.join(toca)} não se edita à mão. O log é escrito só pelo hook "
            "a cada orca orchestration send, e o cadastro só pelo master com painel.py. Para ler, use cat, jq ou grep.")}
    return None


def decide(ev):
    if ev["event"] == "stop":
        return decide_stop(ev)
    protecao = decide_protecao(ev)
    if protecao is not None:
        return protecao
    if ev["event"] == "pre_tool" and ev["tool_name"] == "SendMessage":
        return decide_sendmessage(ev)
    if not envolve_orca(ev):
        return None
    if ev["event"] not in ("pre_tool", "post_tool"):
        return None
    paineis = carregar_paineis()
    eu_handle = os.environ.get("ORCA_TERMINAL_HANDLE")
    eu = paineis.get(eu_handle)
    if not envolve_time(ev["command"], paineis, eu):
        return None  # comando orca de quem não é do time, para quem não é do time
    try:
        argv = separar(ev["command"])
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


DIALOGO = re.compile(r"Enter to confirm|Esc to cancel|Do you want to|\(y/n\)|Press Enter", re.I)


JANELA_AVISO = float(os.environ.get("AGENT_BOARD_JANELA_AVISO", "60"))  # segundos entre avisos digitados por destino
ESTADO_AVISO = os.path.join(HOME, "avisos-estado.json")


def com_estado(fn):
    """Lê, altera e grava o estado dos avisos sob trava de arquivo. fn(dict) -> resultado."""
    os.makedirs(HOME, exist_ok=True)
    with open(ESTADO_AVISO + ".lock", "w") as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        estado = ler_json(ESTADO_AVISO, {})
        r = fn(estado)
        tmp = ESTADO_AVISO + ".tmp"
        with open(tmp, "w") as f:
            json.dump(estado, f)
        os.replace(tmp, ESTADO_AVISO)
        return r


def reservar_aviso(handle):
    """Reserva o direito de digitar em `handle`. Devolve 0 se reservou, ou os segundos que faltam para a janela fechar."""
    def f(estado):
        falta = estado.get(handle, 0) + JANELA_AVISO - time.time()
        if falta > 0:
            return falta
        estado[handle] = time.time()
        return 0
    return com_estado(f)


def tem_nao_lida(handle, orca):
    """True se o destino ainda tem mensagem não lida no correio. Na dúvida (erro do orca), True."""
    try:
        r = subprocess.run([orca, "orchestration", "inbox", "--terminal", handle, "--json", "--limit", "50"],
                           capture_output=True, text=True, timeout=30)
        msgs = json.loads(r.stdout[r.stdout.index("{"):])["result"]["messages"]
    except (subprocess.TimeoutExpired, ValueError, KeyError, OSError):
        return True
    return any(m.get("to_handle") == handle and not m.get("read") for m in msgs)


def avisar(handle, cid, texto):
    """Processo separado. No máximo 1 aviso digitado por destino a cada JANELA_AVISO s.
    Dentro da janela, espera ela fechar e só digita se ainda houver mensagem não lida (a mensagem fica sempre no correio).
    Também não digita se o destino estiver com uma pergunta aberta na tela."""
    orca = achar_orca()
    falta = reservar_aviso(handle)
    if falta:
        time.sleep(falta)
        if not tem_nao_lida(handle, orca):
            registrar_aviso(f"{cid} aviso NÃO digitado em {handle}: janela de {JANELA_AVISO:g}s e nada não lido; a mensagem está no correio")
            return
        if reservar_aviso(handle):
            registrar_aviso(f"{cid} aviso NÃO digitado em {handle}: outro aviso já saiu nesta janela; a mensagem está no correio")
            return
    try:
        tela = subprocess.run([orca, "terminal", "read", "--terminal", handle, "--screen"],
                              capture_output=True, text=True, timeout=30).stdout
    except subprocess.TimeoutExpired:
        tela = ""
    fim = "\n".join(tela.strip().splitlines()[-15:])
    if DIALOGO.search(fim):
        registrar_aviso(f"{cid} aviso NÃO digitado em {handle}: tela com pergunta aberta; a mensagem está no correio")
        return
    try:
        r = subprocess.run([orca, "terminal", "send", "--terminal", handle, "--text", texto, "--enter",
                            "--wait-submit", "15"], capture_output=True, text=True, timeout=60)
        registrar_aviso(f"{cid} aviso digitado em {handle} (saída {r.returncode})")
    except subprocess.TimeoutExpired:
        registrar_aviso(f"{cid} aviso enviado a {handle}, sem confirmação em 60s (destino ocupado?)")


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
