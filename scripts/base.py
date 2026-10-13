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


def agora():
    return datetime.datetime.now().astimezone()


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
