"""
painel.py servir: o painel web do projeto, só leitura, em 127.0.0.1.

Rotas: GET / (a página) e GET /api/estado?periodo=hoje|24h|7d. Nada escreve.
Ver docs/adr/0005-painel-web-local-somente-leitura.md e docs/userguide/painel.md.
"""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import painel_estado
import registro
from base import CONFIG_REL, achar_orca, carregar_paineis, ler_json

PAGINA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "painel_web.html")
CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"


def handles_abertos(cache={"t": 0, "v": None}):
    """Painéis abertos no Orca (cache de 15 s). None se o orca não respondeu."""
    if time.time() - cache["t"] < 15:
        return cache["v"]
    try:
        r = subprocess.run([achar_orca(), "terminal", "list", "--json"], capture_output=True, text=True, timeout=5)
        d = json.loads(r.stdout)
        t = d.get("result", d)
        t = t.get("terminals", t) if isinstance(t, dict) else t
        cache["v"] = {x.get("handle") or x.get("id") for x in t}
    except (OSError, ValueError, subprocess.TimeoutExpired, AttributeError, TypeError):
        cache["v"] = None
    cache["t"] = time.time()
    return cache["v"]


def criar_handler(raiz, cfg, porta, perguntar_orca=True):
    hosts = {f"127.0.0.1:{porta}", f"localhost:{porta}"}

    class Handler(BaseHTTPRequestHandler):
        server_version = "agent-board"
        sys_version = ""

        def log_message(self, fmt, *args):  # sem log por requisição no terminal
            pass

        def _enviar(self, codigo, corpo, tipo):
            dados = corpo.encode() if isinstance(corpo, str) else corpo
            self.send_response(codigo)
            self.send_header("Content-Type", tipo)
            self.send_header("Content-Length", str(len(dados)))
            self.send_header("Content-Security-Policy", CSP)
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(dados)

        def do_GET(self):
            if self.headers.get("Host") not in hosts:  # DNS rebinding
                return self._enviar(403, "host não permitido", "text/plain; charset=utf-8")
            url = urllib.parse.urlsplit(self.path)
            if url.path == "/":
                with open(PAGINA, "rb") as f:
                    return self._enviar(200, f.read(), "text/html; charset=utf-8")
            if url.path == "/api/estado":
                periodo = urllib.parse.parse_qs(url.query).get("periodo", ["hoje"])[0]
                if periodo not in painel_estado.PERIODOS:
                    periodo = "hoje"
                estado = painel_estado.montar(raiz, cfg["projeto"], carregar_paineis(), periodo,
                                              abertos=handles_abertos() if perguntar_orca else None,
                                              limites=cfg.get("limites"))
                return self._enviar(200, json.dumps(estado, ensure_ascii=False), "application/json; charset=utf-8")
            return self._enviar(404, "não encontrado", "text/plain; charset=utf-8")

        def _recusar(self):
            self._enviar(405, "o painel é só leitura", "text/plain; charset=utf-8")

        do_POST = do_PUT = do_PATCH = do_DELETE = _recusar

    return Handler


def servidor(raiz, porta, perguntar_orca=True):
    cfg = ler_json(os.path.join(raiz, CONFIG_REL), None)
    if cfg is None:
        sys.exit(f"{raiz} não tem {CONFIG_REL}; rode painel.py init antes")
    srv = ThreadingHTTPServer(("127.0.0.1", porta), criar_handler(raiz, cfg, porta, perguntar_orca))
    srv.daemon_threads = True
    return srv


def servir(args):
    p = argparse.ArgumentParser(prog="painel.py servir")
    p.add_argument("--raiz", required=True)
    p.add_argument("--porta", type=int, default=8765)
    a = p.parse_args(args)
    raiz = os.path.abspath(a.raiz)
    try:
        srv = servidor(raiz, a.porta)
    except OSError as exc:
        sys.exit(f"não consegui abrir 127.0.0.1:{a.porta} ({exc}); tente --porta <outra>")
    print(f"painel de {raiz} em http://127.0.0.1:{a.porta}  (Ctrl+C para parar)")
    print(f"servidor remoto: ssh -L {a.porta}:127.0.0.1:{a.porta} <servidor>")
    print(f"log: {registro.verificar(raiz)['linhas']} linhas")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()
