"""
painel.py servir: o painel web do projeto, só leitura, em 127.0.0.1.

Rotas: a SPA (GET / e caminhos sem extensão), GET /assets/<arquivo> e a API em /api/* (contrato em
docs/referencia/painel-api.md), com SSE em /api/stream. Nada escreve.
Ver docs/adr/0005-painel-web-local-somente-leitura.md, docs/adr/0010 e docs/userguide/painel.md.
"""
import argparse
import datetime
import json
import os
import select
import socket
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import painel_dados
import painel_estado
import painel_orca
import painel_stream
import registro
from base import CONFIG_REL, carregar_paineis, ler_json

AQUI = os.path.dirname(os.path.abspath(__file__))
DIR_WEB = os.path.join(AQUI, "painel_web")  # build da SPA (web/)
PAGINA_ANTIGA = os.path.join(AQUI, "painel_web.html")
CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
LIMITE_SSE = 16
TIPOS = {".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
         ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff",
         ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".json": "application/json",
         ".map": "application/json", ".html": "text/html; charset=utf-8", ".txt": "text/plain; charset=utf-8"}
TEXTO = "text/plain; charset=utf-8"
JSON = "application/json; charset=utf-8"


def handles_abertos():
    """Painéis abertos no Orca (cache de 2 s). None se o orca não respondeu."""
    return painel_orca.handles_abertos()


def projetos_do_cadastro(raiz, cfg, paineis):
    """{projeto: raiz} em ordem: o do --raiz primeiro, depois os do cadastro cuja raiz tem o agent-board.json."""
    out = {}
    if raiz and cfg:
        out[cfg["projeto"]] = raiz
    for nome in sorted({p.get("projeto") for p in paineis.values()} - {None}):
        r = next((p.get("raiz") for p in paineis.values() if p.get("projeto") == nome and p.get("raiz")), None)
        if nome not in out and r and os.path.isfile(os.path.join(r, CONFIG_REL)):
            out[nome] = r
    return out


def criar_handler(raiz, cfg, porta, perguntar_orca=True, terminais=None, intervalos=None, limite_sse=LIMITE_SSE):
    """`terminais`: função que devolve {handle: terminal} do Orca (ou None); os testes injetam uma falsa."""
    hosts = {f"127.0.0.1:{porta}", f"localhost:{porta}"}
    if terminais is None:
        terminais = painel_orca.terminais if perguntar_orca else (lambda: None)
    vagas = threading.Semaphore(limite_sse)

    class Handler(BaseHTTPRequestHandler):
        server_version = "agent-board"
        sys_version = ""

        def log_message(self, fmt, *args):  # sem log por requisição no terminal
            pass

        def _cabecalhos(self, codigo, tipo):
            self.send_response(codigo)
            self.send_header("Content-Type", tipo)
            self.send_header("Content-Security-Policy", CSP)
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Cache-Control", "no-store")

        def _enviar(self, codigo, corpo, tipo):
            dados = corpo.encode() if isinstance(corpo, str) else corpo
            self._cabecalhos(codigo, tipo)
            self.send_header("Content-Length", str(len(dados)))
            self.end_headers()
            self.wfile.write(dados)

        def _json(self, dados, codigo=200):
            self._enviar(codigo, json.dumps(dados, ensure_ascii=False), JSON)

        def _erro(self, codigo, texto):
            self._json({"erro": texto}, codigo)

        def do_GET(self):
            if self.headers.get("Host") not in hosts:  # DNS rebinding
                return self._enviar(403, "host não permitido", TEXTO)
            url = urllib.parse.urlsplit(self.path)
            caminho = urllib.parse.unquote(url.path)
            qs = urllib.parse.parse_qs(url.query)
            if "\0" in caminho or ".." in caminho.split("/") or "\\" in caminho:
                return self._enviar(404, "não encontrado", TEXTO)
            if caminho == "/api" or caminho.startswith("/api/"):
                return self._api(caminho, {k: v[0] for k, v in qs.items()})
            if caminho.startswith("/assets/"):
                return self._asset(caminho[1:], "assets")
            if "." in caminho.rsplit("/", 1)[-1]:
                # arquivos da raiz do build (favicon.svg etc.); subpastas só via /assets/
                if caminho.count("/") == 1 and os.path.splitext(caminho)[1].lower() in (".svg", ".png", ".ico"):
                    return self._asset(caminho[1:], "")
                return self._enviar(404, "não encontrado", TEXTO)
            return self._spa()

        def _spa(self):
            for arq in (os.path.join(DIR_WEB, "index.html"), PAGINA_ANTIGA):
                if os.path.isfile(arq):
                    with open(arq, "rb") as f:
                        return self._enviar(200, f.read(), TIPOS[".html"])
            return self._enviar(404, "painel sem página", TEXTO)

        def _asset(self, rel, pasta):
            base = os.path.normpath(os.path.join(DIR_WEB, pasta))
            alvo = os.path.normpath(os.path.join(DIR_WEB, rel))
            if not alvo.startswith(base + os.sep) or not os.path.isfile(alvo):
                return self._enviar(404, "não encontrado", TEXTO)
            with open(alvo, "rb") as f:
                dados = f.read()
            self._enviar(200, dados, TIPOS.get(os.path.splitext(alvo)[1].lower(), "application/octet-stream"))

        # --- API -----------------------------------------------------------------
        def _projeto(self, qs):
            """(nome, raiz, cfg, paineis) do ?projeto=, ou None se desconhecido."""
            paineis = carregar_paineis()
            projs = projetos_do_cadastro(raiz, cfg, paineis)
            nome = qs.get("projeto") or next(iter(projs), None)
            if nome not in projs:
                return None
            return nome, projs[nome], ler_json(os.path.join(projs[nome], CONFIG_REL), {}), paineis

        def _api(self, caminho, qs):
            if caminho == "/api/projetos":
                return self._json(self._lista_projetos())
            ctx = self._projeto(qs)
            if ctx is None:
                return self._erro(404, "projeto desconhecido")
            rota = caminho[len("/api/"):]
            if rota == "stream":
                return self._stream(ctx)
            periodo = qs.get("periodo", "hoje")
            if periodo not in painel_estado.PERIODOS:
                periodo = "hoje"
            if rota.startswith("conversas/"):
                return self._conversa(ctx, rota[len("conversas/"):])
            tratador = {"estado": self._estado, "resumo": self._resumo, "agentes": self._agentes,
                        "tarefas": self._tarefas, "conversas": self._conversas, "mensagens": self._mensagens,
                        "analytics": self._analytics, "workflows": self._workflows}.get(rota)
            if tratador is None:
                return self._erro(404, "não encontrado")
            return self._json(tratador(ctx, qs, periodo))

        def _lista_projetos(self):
            paineis = carregar_paineis()
            projs = projetos_do_cadastro(raiz, cfg, paineis)
            atual = next(iter(projs), None)
            return [{"projeto": n, "raiz": r, "atual": n == atual,
                     "agentes": sum(1 for p in paineis.values() if p.get("projeto") == n)} for n, r in projs.items()]

        def _base(self, ctx):
            nome, r, c, paineis = ctx
            agora = datetime.datetime.now().astimezone()
            msgs = registro.ler_log(r)
            return nome, r, c, paineis, agora, msgs, painel_estado.tarefas(msgs, agora)

        def _estado(self, ctx, qs, periodo):
            nome, r, c, paineis = ctx
            return painel_estado.montar(r, nome, paineis, periodo, abertos=self._abertos(), limites=c.get("limites"))

        def _abertos(self):
            t = terminais()
            return None if t is None else set(t)

        def _resumo(self, ctx, qs, periodo):
            nome, r, c, paineis = ctx
            e = painel_estado.montar(r, nome, paineis, periodo, abertos=self._abertos(), limites=c.get("limites"))
            _, _, _, _, agora, msgs, tars = self._base(ctx)
            ags = painel_dados.agentes(nome, paineis, msgs, terminais(), agora, tars)
            desde = painel_estado.inicio_do_periodo(periodo, agora)
            ind = dict(e["indicadores"])
            for st in ("trabalhando", "esperando", "offline"):
                ind[st] = sum(1 for a in ags if a["status"] == st)
            ind["abertos"] = sum(1 for t in tars if t["estado"] in painel_dados.ABERTAS)
            ind["entregas_periodo"] = sum(1 for m in msgs if m.get("tipo") == "entrega"
                                          and (painel_estado._ts(m.get("ts")) or agora) >= desde)
            return {"projeto": nome, "versao": e["versao"], "agora": e["agora"], "periodo": periodo,
                    "cadeia": e["cadeia"], "indicadores": ind}

        def _agentes(self, ctx, qs, periodo):
            nome, _, _, paineis, agora, msgs, tars = self._base(ctx)
            return painel_dados.agentes(nome, paineis, msgs, terminais(), agora, tars)

        def _tarefas(self, ctx, qs, periodo):
            _, _, _, _, agora, _, tars = self._base(ctx)
            return painel_dados.tarefas_do_periodo(tars, periodo, agora)

        def _conversas(self, ctx, qs, periodo):
            _, _, _, _, agora, msgs, tars = self._base(ctx)
            convs = painel_dados.conversas(msgs, agora, tars)
            return painel_dados.filtrar_conversas(convs, periodo, agora, painel_dados.inteiro(qs.get("limite"), 100),
                                                  qs.get("agente"), qs.get("estado"), qs.get("q"))

        def _conversa(self, ctx, cid):
            _, _, _, _, agora, msgs, tars = self._base(ctx)
            achada = painel_dados.conversa_por_id(painel_dados.conversas(msgs, agora, tars), cid)
            if achada is None:
                return self._erro(404, "conversa não encontrada")
            return self._json(achada)

        def _mensagens(self, ctx, qs, periodo):
            msgs = registro.ler_log(ctx[1])
            return painel_dados.mensagens(msgs, qs.get("antes"), painel_dados.inteiro(qs.get("limite"), 100),
                                          qs.get("agente"), qs.get("tipo"), qs.get("q"))

        def _analytics(self, ctx, qs, periodo):
            return painel_dados.analytics(registro.ler_tudo(ctx[1]), datetime.datetime.now().astimezone())

        def _workflows(self, ctx, qs, periodo):
            nome, _, _, paineis, agora, msgs, tars = self._base(ctx)
            papeis = {p["agente"]: p.get("papel") for p in paineis.values() if p.get("projeto") == nome}
            convs = painel_dados.conversas(msgs, agora, tars)
            return painel_dados.workflows(msgs, convs, periodo, agora, papeis, {t["id"]: t for t in tars})

        # --- SSE -----------------------------------------------------------------
        def _desconectou(self):
            """O cliente fechou a conexão (EOF legível no socket)."""
            try:
                if select.select([self.connection], [], [], 0)[0]:
                    return self.connection.recv(1, socket.MSG_PEEK) == b""
            except (OSError, ValueError):
                return True
            return False

        def _stream(self, ctx):
            if not vagas.acquire(False):
                return self._enviar(503, "conexões SSE demais", TEXTO)
            try:
                nome, r, _, _ = ctx
                vigia = painel_stream.Vigia(r, nome, carregar_paineis, terminais, intervalos)
                self._cabecalhos(200, "text/event-stream")
                self.send_header("X-Accel-Buffering", "no")
                self.end_headers()
                self.wfile.write(painel_stream.formatar(*vigia.ola()))
                self.wfile.flush()
                while not self._desconectou():
                    for ev in vigia.passo():
                        self.wfile.write(painel_stream.formatar(*ev))
                    self.wfile.flush()
                    time.sleep(vigia.iv["log"])
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
            finally:
                vagas.release()
                self.close_connection = True

        def _recusar(self):
            self._enviar(405, "o painel é só leitura", TEXTO)

        do_POST = do_PUT = do_PATCH = do_DELETE = _recusar

    return Handler


def servidor(raiz, porta, perguntar_orca=True, terminais=None, intervalos=None, limite_sse=LIMITE_SSE):
    cfg = None
    if raiz:
        cfg = ler_json(os.path.join(raiz, CONFIG_REL), None)
        if cfg is None:
            sys.exit(f"{raiz} não tem {CONFIG_REL}; rode painel.py init antes")
    srv = ThreadingHTTPServer(("127.0.0.1", porta), BaseHTTPRequestHandler)
    srv.RequestHandlerClass = criar_handler(raiz, cfg, srv.server_address[1], perguntar_orca, terminais, intervalos, limite_sse)
    srv.daemon_threads = True
    return srv


def servir(args):
    p = argparse.ArgumentParser(prog="painel.py servir")
    p.add_argument("--raiz", help="projeto a mostrar primeiro; os do cadastro entram de qualquer jeito")
    p.add_argument("--porta", type=int, default=8765)
    a = p.parse_args(args)
    raiz = os.path.abspath(a.raiz) if a.raiz else None
    try:
        srv = servidor(raiz, a.porta)
    except OSError as exc:
        sys.exit(f"não consegui abrir 127.0.0.1:{a.porta} ({exc}); tente --porta <outra>")
    projs = projetos_do_cadastro(raiz, ler_json(os.path.join(raiz, CONFIG_REL), None) if raiz else None, carregar_paineis())
    if not projs:
        srv.server_close()
        sys.exit("nenhum projeto para mostrar: passe --raiz <path> ou cadastre os painéis (painel.py cadastrar)")
    print(f"painel de {', '.join(projs)} em http://127.0.0.1:{a.porta}  (Ctrl+C para parar)")
    print(f"servidor remoto: ssh -L {a.porta}:127.0.0.1:{a.porta} <servidor>")
    for nome, r in projs.items():
        print(f"log de {nome}: {registro.verificar(r)['linhas']} linhas")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()
