"""
agent-board: os terminais abertos no Orca (`orca terminal list --json`), para o painel web.

Só leitura. O resultado fica em cache por 2 s e é compartilhado por todas as conexões.
"""
import json
import subprocess
import threading
import time

from base import achar_orca

TTL = 2.0
_lock = threading.Lock()
_cache = {"t": 0.0, "v": None}


def _consultar():
    """{handle: terminal} do Orca, ou None se o orca não respondeu."""
    try:
        r = subprocess.run([achar_orca(), "terminal", "list", "--json"], capture_output=True, text=True, timeout=5)
        d = json.loads(r.stdout)
        if r.returncode != 0 or (isinstance(d, dict) and d.get("ok") is False):
            return None  # orca sem runtime: status "desconhecido", não "offline" para todo mundo
        t = d.get("result", d)
        t = t.get("terminals", t) if isinstance(t, dict) else t
        return normalizar(t)
    except (OSError, ValueError, subprocess.TimeoutExpired, AttributeError, TypeError):
        return None


def normalizar(lista):
    """{handle: {handle, title, preview, lastOutputAt, agentIdentity}} a partir da lista crua do Orca."""
    out = {}
    for x in lista or []:
        h = x.get("handle") or x.get("id")
        if h:
            out[h] = {"handle": h, "title": x.get("title") or "", "preview": x.get("preview") or "",
                      "lastOutputAt": x.get("lastOutputAt"), "agentIdentity": x.get("agentIdentity")}
    return out


def terminais(consulta=_consultar):
    """Terminais abertos (cache de 2 s). None se o orca não respondeu."""
    with _lock:
        if time.time() - _cache["t"] >= TTL:
            _cache["v"] = consulta()
            _cache["t"] = time.time()
        return _cache["v"]


def handles_abertos():
    """Handles abertos no Orca, ou None se não deu para perguntar."""
    t = terminais()
    return None if t is None else set(t)
