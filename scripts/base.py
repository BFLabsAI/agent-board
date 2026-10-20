"""
agent-board: base compartilhada pelo hook, pelo painel.py e pelo servidor MCP.

Caminhos, leitura do cadastro e da config, nomes do time, trava entre processos
e o registro de avisos em $AGENT_BOARD_HOME/avisos.log.
"""
import contextlib
import datetime
import json
import os
import re
import shlex
import shutil
import time

try:
    import fcntl
except ImportError:  # Windows: sem fcntl, a trava usa msvcrt
    fcntl = None
    import msvcrt

try:
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "VERSION")) as _v:
        VERSAO = _v.read().strip()
except OSError:
    VERSAO = "desconhecida"
HOME = os.environ.get("AGENT_BOARD_HOME", os.path.expanduser("~/.agent-hooks/agent-board"))
PAINEIS = os.path.join(HOME, "paineis.json")
CONFIG_REL = "docs/agent-board/agent-board.json"
LOG_REL = "docs/agent-board/comunicacoes.jsonl"

NOME_RE = re.compile(r"^(?P<prefixo>[a-z0-9]+)-(?:(?P<master>master)|(?P<papel>manager|researcher)(?P<nn>\d{2})-(?P<rt>[a-z]+))$")


class Barrado(Exception):
    pass


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


def master_do_projeto(paineis, projeto):
    """Handle do painel do master do projeto, ou None se não estiver cadastrado."""
    for h, p in paineis.items():
        if p.get("projeto") == projeto and p.get("papel") == "master":
            return h
    return None


def papel_do_nome(nome):
    m = NOME_RE.match(nome or "")
    if not m:
        return None
    return "master" if m.group("master") else m.group("papel")


# Segredos que nunca devem ir para tela, painel ou arquivo de coleta. Compilado só no primeiro uso:
# o hook roda a cada chamada de ferramenta e a maioria não mascara nada.
SEGREDOS_PADRAO = (
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)"  # chave privada PEM
    r"|\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}"                                           # OpenAI/Anthropic/Stripe
    r"|\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}"     # GitHub
    r"|\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|\bAIza[0-9A-Za-z_-]{30,}"                        # AWS, Google
    r"|\bxox[abposr]-[A-Za-z0-9-]{10,}|\bnpm_[A-Za-z0-9]{30,}"                        # Slack, npm
    r"|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"                  # JWT
    r"|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}"
    r"|(?i:\b[\w.-]*(?:password|passwd|senha|secret|token|api[_-]?key|apikey|authorization)[\w.-]*)\s*[=:]\s*(?:(?:Bearer|Basic)\s+)?\S+"
)
_segredos = []


def mascarar(texto):
    """Troca por [oculto] o que parece segredo (token, chave, senha, Bearer) no texto."""
    if not _segredos:
        _segredos.append(re.compile(SEGREDOS_PADRAO, re.S))
    return _segredos[0].sub("[oculto]", texto)


def agora():
    return datetime.datetime.now().astimezone()


def meu_handle():
    """Painel deste terminal: Orca ($ORCA_TERMINAL_HANDLE) ou Maestri (maestri:<$MAESTRI_TERMINAL_ID>)."""
    h = os.environ.get("ORCA_TERMINAL_HANDLE")
    if h:
        return h
    m = os.environ.get("MAESTRI_TERMINAL_ID")
    return f"maestri:{m}" if m else None


def prefixo_home():
    """`AGENT_BOARD_HOME=... ` para comandos sugeridos ou agendados quando o estado não está no padrão."""
    padrao = os.path.expanduser("~/.agent-hooks/agent-board")
    if os.path.abspath(HOME) == os.path.abspath(padrao):
        return ""
    return f"AGENT_BOARD_HOME={shlex.quote(HOME)} "


def eh_maestri(handle):
    return str(handle or "").startswith("maestri:")


def achar_orca():
    """O hook roda com PATH reduzido: procura o orca nos lugares conhecidos.

    Ordem: ORCA_BIN explícito; o shim do terminal aberto por um Orca server
    ($ORCA_CLI_BIN_DIR); o shim do terminal aberto por SSH ($ORCA_REMOTE_CLI_BIN_DIR);
    o PATH; e por último o relay SSH (~/.orca-relay). Um terminal do servidor nunca
    cai no relay, que fala com outro runtime e não conhece os painéis do servidor.
    """
    def em(var):
        d = os.environ.get(var, "")
        return os.path.join(d, "orca") if d else ""
    for c in (os.environ.get("ORCA_BIN", ""), em("ORCA_CLI_BIN_DIR"), em("ORCA_REMOTE_CLI_BIN_DIR"),
              shutil.which("orca") or "", os.path.expanduser("~/.orca-relay/bin/orca")):
        if c and os.access(c, os.X_OK):
            return c
    return "orca"


def registrar_aviso(texto):
    os.makedirs(HOME, exist_ok=True)
    with open(os.path.join(HOME, "avisos.log"), "a") as f:
        f.write(f"{agora().isoformat(timespec='seconds')} {texto}\n")


@contextlib.contextmanager
def trava(caminho):
    """Trava exclusiva entre processos, num arquivo .lock próprio (nunca no arquivo que é trocado)."""
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with open(caminho, "a+") as f:
        if fcntl:
            fcntl.flock(f, fcntl.LOCK_EX)
        else:
            f.seek(0)
            while True:
                try:
                    msvcrt.locking(f.fileno(), msvcrt.LK_LOCK, 1)
                    break
                except OSError:  # LK_LOCK desiste depois de ~10 s; tenta de novo
                    time.sleep(0.05)
        try:
            yield
        finally:
            if fcntl:
                fcntl.flock(f, fcntl.LOCK_UN)
            else:
                f.seek(0)
                msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
