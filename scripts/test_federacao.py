#!/usr/bin/env python3
"""Testes dos Workspaces federados (1.14): identidade, Host/Origin da tailnet, descoberta, /api/workspaces,
proxy /api/w/<id>/, stream workspace=* e painel.py servico. Sem rede de verdade: tailscale falso e Workspaces
remotos em servidores HTTP locais de porta efêmera.

  python3 scripts/test_federacao.py
"""
import contextlib
import http.client
import io
import json
import os
import shutil
import socket
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import test_web  # noqa: E402  (define AGENT_BOARD_HOME antes de importar base)
from test_web import HOME_TESTE, Cenario  # noqa: E402

import base  # noqa: E402
import cmd_servico  # noqa: E402
import cmd_web  # noqa: E402
import painel_federacao  # noqa: E402

DNS = "r7-workspace.tailcf59a0.ts.net."
IP_PROPRIO = "100.80.252.12"
CAB = painel_federacao.CABECALHO
GERAL_OK = {"agora": "2026-10-20T10:00:00-03:00", "periodo": "hoje", "totais": {"squads": 1, "agentes": 2},
            "squads": [{"projeto": "zeta", "saude": "ok", "agentes": [{}, {}], "indicadores": {"trabalhando": 1}}]}
GERAL_CRITICO = dict(GERAL_OK, squads=[dict(GERAL_OK["squads"][0], saude="ok"),
                                       dict(GERAL_OK["squads"][0], projeto="omega", saude="critico")])


def tailscale(peers=(), host="r7-workspace", dns=DNS, ips=(IP_PROPRIO,)):
    """Função que devolve um `tailscale status --json` falso. peers: [(HostName, ip, porta, online, os)]."""
    def lido():
        return {"Self": {"HostName": host, "DNSName": dns, "TailscaleIPs": list(ips), "OS": "linux", "Online": True},
                "Peer": {f"k{i}": {"HostName": h, "DNSName": f"{h}.tailcf59a0.ts.net.", "TailscaleIPs": [ip], "porta": porta,
                                   "Online": on, "OS": so} for i, (h, ip, porta, on, so) in enumerate(peers)}}
    return lido


def porta_livre():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Remoto(BaseHTTPRequestHandler):
    """Um Workspace falso. `server.cfg`: id, versao, geral, sono (segundos antes de /api/versao), eventos (SSE)."""
    protocol_version = "HTTP/1.0"

    def log_message(self, *a):
        pass

    def _json(self, dados, codigo=200):
        corpo = json.dumps(dados).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def do_GET(self):
        cfg = self.server.cfg
        cfg.setdefault("hits", []).append((self.path, self.headers.get(CAB)))
        if self.path == "/api/versao":
            time.sleep(cfg.get("sono", 0))
            if cfg.get("nao_e_workspace"):
                return self._json({"erro": "x"}, 404)
            return self._json({"versao": cfg.get("versao", base.VERSAO), "contrato": 3,
                               "workspace": {"id": cfg["id"], "nome": cfg.get("nome", cfg["id"].upper())}, "projetos": ["zeta"]})
        if self.path.startswith("/api/geral"):
            return self._json(cfg.get("geral", GERAL_OK))
        if self.path.startswith("/api/eco"):
            return self._json({"cab": self.headers.get(CAB), "path": self.path, "host": self.headers.get("Host")})
        if self.path == "/api/grande":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            for _ in range(6):
                self.wfile.write(b" " * (1024 * 1024))
            return
        if self.path == "/api/redireciona":
            self.send_response(302)
            self.send_header("Location", "http://127.0.0.1:1/api/x")
            self.end_headers()
            return
        if self.path.startswith("/api/stream"):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            self.wfile.write(b"event: ola\ndata: " + json.dumps({"projeto": "*", "projetos": ["zeta"]}).encode() + b"\n\n")
            self.wfile.flush()
            for ev, dados in cfg.get("eventos", []):
                self.wfile.write(f"event: {ev}\ndata: {json.dumps(dados)}\n\n".encode())
                self.wfile.flush()
            while not cfg.get("fechado"):
                time.sleep(0.05)
            return
        self._json({"erro": "não encontrado"}, 404)


class Base(Cenario):
    INTERVALOS = {"log": 0.05, "orca": 0.1, "ping": 0.4, "projetos": 0.2, "workspaces": 0.2}

    def setUp(self):
        super().setUp()
        self.conexoes, self.fakes = [], []

    def tearDown(self):
        for c in self.conexoes:
            c.close()
        for srv in self.fakes:
            srv.cfg["fechado"] = True
        super().tearDown()
        for p in ("workspace.json",):
            with contextlib.suppress(OSError):
                os.remove(os.path.join(HOME_TESTE, p))

    def fake(self, wid, **cfg):
        srv = ThreadingHTTPServer(("127.0.0.1", 0), Remoto)
        srv.daemon_threads = True
        srv.handle_error = lambda *a: None  # cliente que desiste (sonda lenta) não suja a saída
        srv.cfg = dict(id=wid, **cfg)
        threading.Thread(target=srv.serve_forever, args=(0.02,), daemon=True).start()
        self.fakes.append(srv)
        self.addCleanup(self._parar, srv)
        return srv

    @staticmethod
    def _parar(srv):
        srv.cfg["fechado"] = True
        with contextlib.suppress(Exception):
            srv.shutdown()
            srv.server_close()

    def peer(self, nome, srv, online=True, so="linux"):
        return (nome, "127.0.0.1", srv.server_address[1], online, so)

    def subir(self, peers=(), ttl=30.0, ts=None, **kw):
        fed = painel_federacao.Federacao(0, tailscale=ts or tailscale(peers), ttl_descoberta=ttl)
        srv = cmd_web.servidor(self.raiz, 0, terminais=lambda: self.terminais, intervalos=self.INTERVALOS, federacao=fed, **kw)
        fed.porta = srv.server_address[1]
        threading.Thread(target=srv.serve_forever, args=(0.02,), daemon=True).start()
        self.addCleanup(lambda: (srv.shutdown(), srv.server_close()))
        self.fed, self.srv, self.porta = fed, srv, srv.server_address[1]
        return srv

    def get(self, caminho, host=None, cab=None):
        c = http.client.HTTPConnection("127.0.0.1", self.porta, timeout=10)
        c.request("GET", caminho, headers=dict({"Host": host or f"127.0.0.1:{self.porta}"}, **(cab or {})))
        r = c.getresponse()
        corpo = r.read()
        c.close()
        return r, corpo

    def api(self, caminho, cab=None):
        r, corpo = self.get(caminho, cab=cab)
        self.assertEqual(r.status, 200, corpo)
        return json.loads(corpo)

    def stream(self, caminho):
        c = http.client.HTTPConnection("127.0.0.1", self.porta, timeout=10)
        c.request("GET", caminho, headers={"Host": f"127.0.0.1:{self.porta}"})
        self.conexoes.append(c)
        return c, c.getresponse()

    evento = staticmethod(test_web.ApiV2.evento)

    def ate(self, r, nome, **filtro):
        while True:
            e, d = self.evento(r)
            if e == nome and all(d.get(k) == v for k, v in filtro.items()):
                return d

    def escrever_workspace_json(self, **dados):
        with open(os.path.join(HOME_TESTE, "workspace.json"), "w") as f:
            json.dump(dados, f)


class IdentidadeEVersao(Base):
    def test_versao_traz_id_do_tailscale_projetos_e_contrato(self):
        self.subir()
        v = self.api("/api/versao")
        self.assertEqual(v["versao"], base.VERSAO)
        self.assertEqual(v["contrato"], 3)
        self.assertEqual(v["workspace"], {"id": "r7-workspace", "nome": "r7-workspace"})
        self.assertEqual(set(v["projetos"]), {"alpha", "beta"})

    def test_workspace_json_da_o_nome(self):
        self.escrever_workspace_json(nome="R7")
        self.subir()
        self.assertEqual(self.api("/api/versao")["workspace"], {"id": "r7-workspace", "nome": "R7"})

    def test_workspace_json_torto_vale_como_ausente(self):
        with open(os.path.join(HOME_TESTE, "workspace.json"), "w") as f:
            f.write("{")
        self.subir()
        self.assertEqual(self.api("/api/versao")["workspace"]["nome"], "r7-workspace")

    def test_sem_tailscale_o_id_e_o_hostname_da_maquina(self):
        self.subir(ts=lambda: None)
        self.assertEqual(self.api("/api/versao")["workspace"]["id"], socket.gethostname())

    def test_tailscale_que_explode_nao_derruba(self):
        def explode():
            raise RuntimeError("x")
        self.subir(ts=explode)
        self.assertEqual(self.api("/api/versao")["workspace"]["id"], socket.gethostname())


class HostEOrigemDaTailnet(Base):
    def setUp(self):
        super().setUp()
        self.subir()

    def test_host_da_tailnet_com_e_sem_porta(self):
        for h in ("r7-workspace.tailcf59a0.ts.net", f"r7-workspace.tailcf59a0.ts.net:{self.porta}",
                  IP_PROPRIO, f"{IP_PROPRIO}:{self.porta}", f"{IP_PROPRIO}:8765", "R7-Workspace.tailcf59a0.ts.net"):
            r, corpo = self.get("/api/versao", host=h)
            self.assertEqual(r.status, 200, (h, corpo))

    def test_host_de_fora_continua_barrado(self):
        for h in ("evil.com", f"evil.com:{self.porta}", "100.1.2.3", f"100.1.2.3:{self.porta}", "r7-workspace.evil.com",
                  "tailcf59a0.ts.net"):
            self.assertEqual(self.get("/api/versao", host=h)[0].status, 403, repr(h))

    def test_host_extra_do_workspace_json(self):
        self.escrever_workspace_json(hosts_extras=["painel.r7.exemplo"])
        self.fed._st_em = None  # relê já, em vez de esperar os 5 min
        self.assertEqual(self.get("/api/versao", host="painel.r7.exemplo")[0].status, 200)
        self.assertEqual(self.get("/api/versao", host=f"painel.r7.exemplo:{self.porta}")[0].status, 200)

    def test_origin_https_do_dns_e_http_do_ip(self):
        for o in ("https://r7-workspace.tailcf59a0.ts.net", f"http://{IP_PROPRIO}:{self.porta}",
                  f"http://127.0.0.1:{self.porta}", f"http://localhost:{self.porta}"):
            r, corpo = self.get("/api/versao", host=f"{IP_PROPRIO}:{self.porta}", cab={"Origin": o})
            self.assertEqual(r.status, 200, (o, corpo))

    def test_origin_de_fora_continua_barrado(self):
        for o in ("https://evil.com", "http://evil.com", f"http://evil.com:{self.porta}", "http://100.1.2.3:8765",
                  "https://r7-workspace.tailcf59a0.ts.net.evil.com", "null"):
            self.assertEqual(self.get("/api/versao", cab={"Origin": o})[0].status, 403, o)

    def test_sec_fetch_cross_site_continua_barrado_na_tailnet(self):
        r, _ = self.get("/api/versao", host="r7-workspace.tailcf59a0.ts.net", cab={"Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "cors"})
        self.assertEqual(r.status, 403)

    def test_sem_tailscale_so_o_local_vale(self):
        self.subir(ts=lambda: None)
        self.assertEqual(self.get("/api/versao", host=f"{IP_PROPRIO}:{self.porta}")[0].status, 403)
        self.assertEqual(self.get("/api/versao")[0].status, 200)


class Descoberta(Base):
    def test_so_peers_online_linux_que_respondem_viram_workspace(self):
        a = self.fake("aura")
        velho = self.fake("legado", versao="0.9.0")
        off = self.fake("offline-no-ts")
        mac = self.fake("mac")
        nao = self.fake("nao", nao_e_workspace=True)
        morta = porta_livre()
        peers = [self.peer("aura", a), self.peer("legado", velho), self.peer("off", off, online=False), self.peer("mac", mac, so="macOS"),
                 self.peer("nao", nao), ("morta", "127.0.0.1", morta, True, "linux")]
        self.subir(peers)
        ids = sorted(w["id"] for w in self.fed.descobrir())
        self.assertEqual(ids, ["aura", "legado"])
        for s in (off, mac):
            self.assertNotIn("/api/versao", [h[0] for h in s.cfg.get("hits", [])])

    def test_ignorar_do_workspace_json(self):
        a = self.fake("aura")
        self.escrever_workspace_json(ignorar=["aura-ts"])
        self.subir([self.peer("aura-ts", a)])
        self.assertEqual(self.fed.descobrir(), [])
        self.assertEqual(a.cfg.get("hits", []), [])

    def test_cache_de_30s_nao_sonda_de_novo(self):
        a = self.fake("aura")
        self.subir([self.peer("aura", a)])
        for _ in range(3):
            self.fed.descobrir()
        self.assertEqual(len([h for h in a.cfg["hits"] if h[0] == "/api/versao"]), 1)

    def test_a_sonda_manda_o_cabecalho_anti_laco(self):
        a = self.fake("aura")
        self.subir([self.peer("aura", a)])
        self.fed.descobrir()
        self.assertEqual(a.cfg["hits"][0], ("/api/versao", "1"))

    def test_peer_lento_nao_segura_a_requisicao_mais_de_2s(self):
        lento = self.fake("lento", sono=4)
        rapido = self.fake("rapido")
        self.subir([self.peer("lento", lento), self.peer("rapido", rapido)])
        t0 = time.monotonic()
        ids = [w["id"] for w in self.fed.descobrir()]
        self.assertLess(time.monotonic() - t0, 2.6)
        self.assertEqual(ids, ["rapido"])

    def test_sem_tailscale_so_o_local(self):
        self.subir(ts=lambda: None)
        self.assertEqual(self.fed.descobrir(), [])
        ws = self.api("/api/workspaces")["workspaces"]
        self.assertEqual([(w["local"], w["online"]) for w in ws], [(True, True)])

    def test_no_maximo_16_peers(self):
        fakes = [self.fake(f"w{i}") for i in range(20)]
        self.subir([self.peer(f"w{i}", f) for i, f in enumerate(fakes)])
        self.assertEqual(len(self.fed.descobrir()), 16)

    def test_id_de_remoto_fora_do_formato_nao_vira_workspace(self):
        a = self.fake("../../etc")
        self.subir([self.peer("x", a)])
        self.assertEqual(self.fed.descobrir(), [])


class ApiWorkspaces(Base):
    def cenario(self):
        self.aura = self.fake("aura", nome="Aura Bios")
        self.velho = self.fake("legado", versao="0.9.0", geral=GERAL_CRITICO)
        self.morta = porta_livre()
        peers = [self.peer("aura", self.aura), self.peer("legado", self.velho), ("morta", "127.0.0.1", self.morta, True, "linux")]
        self.subir(peers, ttl=0.3)

    def test_local_primeiro_e_depois_por_nome(self):
        self.cenario()
        d = self.api("/api/workspaces?periodo=7d")
        self.assertEqual(set(d), {"agora", "workspaces"})
        self.assertEqual([w["id"] for w in d["workspaces"]], ["r7-workspace", "aura", "legado"])
        loc = d["workspaces"][0]
        self.assertEqual((loc["local"], loc["online"], loc["desatualizado"], loc["versao"]), (True, True, False, base.VERSAO))
        g = self.api("/api/geral?periodo=7d")
        self.assertEqual(loc["totais"], g["totais"])
        self.assertEqual({s["projeto"] for s in loc["squads"]}, {"alpha", "beta"})
        self.assertEqual(set(loc["squads"][0]), {"projeto", "saude", "agentes", "trabalhando"})

    def test_remoto_online_com_latencia_totais_e_squads(self):
        self.cenario()
        aura = self.api("/api/workspaces")["workspaces"][1]
        self.assertEqual((aura["nome"], aura["local"], aura["online"], aura["saude"], aura["desatualizado"]),
                         ("Aura Bios", False, True, "ok", False))
        self.assertIsInstance(aura["latencia_ms"], int)
        self.assertEqual(aura["totais"], GERAL_OK["totais"])
        self.assertEqual(aura["squads"], [{"projeto": "zeta", "saude": "ok", "agentes": 2, "trabalhando": 1}])

    def test_versao_antiga_fica_desatualizada_e_saude_e_a_pior_dos_squads(self):
        self.cenario()
        velho = self.api("/api/workspaces")["workspaces"][2]
        self.assertEqual((velho["versao"], velho["desatualizado"], velho["saude"]), ("0.9.0", True, "critico"))

    def test_quem_nunca_respondeu_nao_e_workspace(self):
        self.cenario()
        ids = [w["id"] for w in self.api("/api/workspaces")["workspaces"]]
        self.assertEqual(len(ids), 3)

    def test_remoto_que_cai_vira_offline(self):
        self.cenario()
        self.api("/api/workspaces")
        self._parar(self.aura)
        time.sleep(0.4)  # vence o cache da descoberta
        aura = next(w for w in self.api("/api/workspaces")["workspaces"] if w["id"] == "aura")
        self.assertEqual((aura["online"], aura["saude"], aura["latencia_ms"], aura["totais"], aura["squads"]),
                         (False, "offline", None, None, []))
        self.assertIn("erro", aura)

    def test_remoto_que_deu_erro_no_geral_e_offline_mesmo_com_cache(self):
        self.cenario()
        self.api("/api/workspaces")
        self._parar(self.velho)
        legado = next(w for w in self.api("/api/workspaces")["workspaces"] if w["id"] == "legado")
        self.assertEqual((legado["online"], legado["saude"]), (False, "offline"))

    def test_periodo_invalido_vira_hoje_e_chega_ao_remoto(self):
        self.cenario()
        self.api("/api/workspaces?periodo=7d")
        self.api("/api/workspaces?periodo=xx")
        pedidos = [h[0] for h in self.aura.cfg["hits"] if h[0].startswith("/api/geral")]
        self.assertEqual(pedidos, ["/api/geral?periodo=7d", "/api/geral?periodo=hoje"])

    def test_offline_desde_marca_a_1a_vez_e_zera_ao_voltar(self):
        self.cenario()
        ws = {w["id"]: w for w in self.api("/api/workspaces")["workspaces"]}
        self.assertEqual({w["offline_desde"] for w in ws.values()}, {None})
        porta = self.aura.server_address[1]
        self._parar(self.aura)
        time.sleep(0.4)
        a1 = next(w for w in self.api("/api/workspaces")["workspaces"] if w["id"] == "aura")
        self.assertFalse(a1["online"])
        self.assertRegex(a1["offline_desde"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$")
        time.sleep(1.1)
        a2 = next(w for w in self.api("/api/workspaces")["workspaces"] if w["id"] == "aura")
        self.assertEqual(a2["offline_desde"], a1["offline_desde"])  # não anda enquanto segue offline
        # volta: novo servidor na mesma porta
        srv = ThreadingHTTPServer(("127.0.0.1", porta), Remoto)
        srv.daemon_threads, srv.cfg = True, dict(id="aura", nome="Aura Bios")
        threading.Thread(target=srv.serve_forever, args=(0.02,), daemon=True).start()
        self.addCleanup(self._parar, srv)
        time.sleep(0.4)
        a3 = next(w for w in self.api("/api/workspaces")["workspaces"] if w["id"] == "aura")
        self.assertEqual((a3["online"], a3["offline_desde"]), (True, None))

    def test_com_cabecalho_anti_laco_so_responde_o_local(self):
        self.cenario()
        d = self.api("/api/workspaces", cab={CAB: "1"})
        self.assertEqual([w["id"] for w in d["workspaces"]], ["r7-workspace"])
        self.assertEqual([h for h in self.aura.cfg.get("hits", []) if h[0].startswith("/api/geral")], [])

    def test_semver(self):
        self.assertTrue(painel_federacao.mais_antiga("1.13.1", "1.14.0"))
        self.assertTrue(painel_federacao.mais_antiga("1.9.0", "1.10.0"))
        self.assertFalse(painel_federacao.mais_antiga("1.14.0", "1.14.0"))
        self.assertFalse(painel_federacao.mais_antiga("2.0.0", "1.14.0"))
        self.assertFalse(painel_federacao.mais_antiga(None, "1.14.0"))
        self.assertFalse(painel_federacao.mais_antiga("desconhecida", "1.14.0"))


class Proxy(Base):
    def setUp(self):
        super().setUp()
        self.aura = self.fake("aura")
        self.subir([self.peer("aura", self.aura)])

    def test_repassa_get_do_remoto_e_manda_o_cabecalho(self):
        d = self.api("/api/w/aura/api/eco?x=1&y=%C3%A9")
        self.assertEqual(d["cab"], "1")
        self.assertEqual(d["path"], "/api/eco?x=1&y=%C3%A9")
        self.assertEqual(self.api("/api/w/aura/api/geral?periodo=7d")["totais"], GERAL_OK["totais"])

    def test_o_destino_e_o_ip_descoberto(self):
        # conecta no IP descoberto (o falso escuta só em 127.0.0.1, então chegar aqui prova o destino),
        # mas o Host leva o nome da tailnet: o tailscale serve roteia pelo nome, e pelo IP dá 404
        d = self.api("/api/w/aura/api/eco")
        self.assertEqual(d["host"], f"aura.tailcf59a0.ts.net:{self.aura.server_address[1]}")

    def test_peer_sem_dnsname_usa_host_padrao(self):
        self.assertEqual(painel_federacao._cabecalhos({"ip": "100.1.1.1", "porta": 8765, "host": None}, "*/*").get("Host"),
                         None)
        self.assertEqual(painel_federacao._cabecalhos({"ip": "100.1.1.1", "porta": 8765, "host": "x.ts.net"}, "*/*")["Host"],
                         "x.ts.net:8765")

    def test_status_do_remoto_passa(self):
        r, _ = self.get("/api/w/aura/api/nao-existe")
        self.assertEqual(r.status, 404)

    def test_id_local_responde_localmente(self):
        self.assertEqual(self.api("/api/w/r7-workspace/api/versao")["workspace"]["id"], "r7-workspace")
        self.assertEqual({p["projeto"] for p in self.api("/api/w/r7-workspace/api/projetos")}, {"alpha", "beta"})
        self.assertEqual({s["projeto"] for s in self.api("/api/w/r7-workspace/api/geral")["squads"]}, {"alpha", "beta", })
        self.assertEqual(self.aura.cfg.get("hits", [])[1:], [])  # nada foi ao remoto além da sonda

    def test_id_desconhecido_ou_offline_e_502(self):
        for caminho in ("/api/w/fantasma/api/geral", "/api/w/aura2/api/geral"):
            r, corpo = self.get(caminho)
            self.assertEqual(r.status, 502, caminho)
            self.assertIn("erro", json.loads(corpo))
        self._parar(self.aura)
        self.fed._rodada_em = None
        r, _ = self.get("/api/w/aura/api/geral")
        self.assertEqual(r.status, 502)

    def test_so_get(self):
        for metodo in ("POST", "PUT", "DELETE", "PATCH"):
            c = http.client.HTTPConnection("127.0.0.1", self.porta, timeout=5)
            c.request(metodo, "/api/w/aura/api/geral", headers={"Host": f"127.0.0.1:{self.porta}"})
            self.assertEqual(c.getresponse().status, 405, metodo)
            c.close()

    def test_so_caminhos_api(self):
        for caminho in ("/api/w/aura/", "/api/w/aura", "/api/w/aura/assets/x.js", "/api/w/aura/etc/passwd", "/api/w/aura/apix/geral",
                        "/api/w/aura//evil.com/api/x", "/api/w/aura/api"):
            self.assertIn(self.get(caminho)[0].status, (404, 502), caminho)
        hits = [h[0] for h in self.aura.cfg.get("hits", []) if h[0] != "/api/versao"]
        self.assertEqual(hits, [])  # nada disso chegou ao remoto

    def test_ponto_ponto_e_host_na_url_nao_passam(self):
        for caminho in ("/api/w/aura/api/../etc", "/api/w/aura/api/%2e%2e/etc", "/api/w/aura/api/%2E%2E%2Fx", "/api/w/../api/geral",
                        "/api/w/aura/api/x%00y", "/api/w/http://evil.com/api/x", "/api/w/evil.com:80/api/x",
                        "/api/w/127.0.0.1:1/api/x", "/api/w/aura@evil.com/api/x"):
            r, _ = self.get(caminho)
            self.assertIn(r.status, (404, 502), caminho)
        self.assertEqual([h[0] for h in self.aura.cfg.get("hits", []) if h[0] != "/api/versao"], [])

    def test_host_na_url_nunca_vira_destino(self):
        # id que não está na descoberta (ainda que seja um IP alcançável) dá 502, sem conectar
        outro = self.fake("outro")
        r, _ = self.get(f"/api/w/127.0.0.1/api/geral?porta={outro.server_address[1]}")
        self.assertEqual(r.status, 502)
        self.assertEqual(outro.cfg.get("hits", []), [])

    def test_resposta_acima_de_5mb_e_502(self):
        r, corpo = self.get("/api/w/aura/api/grande")
        self.assertEqual(r.status, 502)
        self.assertIn("erro", json.loads(corpo))

    def test_redirect_nao_e_seguido(self):
        r, _ = self.get("/api/w/aura/api/redireciona")
        self.assertEqual(r.status, 502)
        self.assertIsNone(r.getheader("Location"))

    def test_cabecalho_anti_laco_recebido_da_404(self):
        self.assertEqual(self.get("/api/w/aura/api/geral", cab={CAB: "1"})[0].status, 404)
        self.assertEqual(self.get("/api/w/r7-workspace/api/projetos", cab={CAB: "1"})[0].status, 404)

    def test_repassa_sse_linha_a_linha(self):
        self.aura.cfg["eventos"] = [("mensagem", {"id": "m1", "projeto": "zeta"})]
        c, r = self.stream("/api/w/aura/api/stream?projeto=*")
        self.assertEqual((r.status, r.getheader("Content-Type")), (200, "text/event-stream"))
        self.assertEqual(self.evento(r)[0], "ola")
        self.assertEqual(self.evento(r), ("mensagem", {"id": "m1", "projeto": "zeta"}))

    def test_sse_do_proxy_ocupa_vaga_e_devolve_ao_desconectar(self):
        self.subir([self.peer("aura", self.aura)], limite_sse=1)
        c, r = self.stream("/api/w/aura/api/stream?projeto=*")
        self.evento(r)
        r2, _ = self.get("/api/stream?projeto=*")
        self.assertEqual(r2.status, 503)
        r.close()
        c.close()
        for _ in range(60):
            if self.get("/api/w/aura/api/geral")[0].status == 200 and self.stream("/api/w/aura/api/stream")[1].status == 200:
                break
            time.sleep(0.1)
        else:
            self.fail("a vaga não voltou")


class StreamDeTodos(Base):
    def cenario(self, **cfg):
        self.aura = self.fake("aura", eventos=[("mensagem", {"id": "r1", "projeto": "zeta", "de": "a", "para": "b"}),
                                               ("agente", {"agente": "zeta-master", "projeto": "zeta"})], **cfg)
        self.subir([self.peer("aura", self.aura)], ttl=0.2, limite_sse=2)

    def threads_fed(self):
        return [t.name for t in threading.enumerate() if t.name.startswith(("fed-cliente", "fed-gerente", "fed-leitor"))]

    def test_ola_e_eventos_do_remoto_com_workspace_e_projeto(self):
        self.cenario()
        c, r = self.stream("/api/stream?workspace=*")
        self.assertEqual(r.status, 200)
        e, d = self.evento(r)
        self.assertEqual(e, "ola")
        self.assertEqual((d["workspace"], d["workspaces"][0]), ("*", "r7-workspace"))
        self.assertIn("aura", d["workspaces"])
        m = self.ate(r, "mensagem", workspace="aura")
        self.assertEqual((m["id"], m["projeto"]), ("r1", "zeta"))
        a = self.ate(r, "agente", workspace="aura")
        self.assertEqual(a["projeto"], "zeta")

    def test_eventos_locais_levam_workspace_local_e_projeto(self):
        self.cenario()
        c, r = self.stream("/api/stream?workspace=*")
        self.evento(r)
        test_web.registro.gravar_log(self.raiz, test_web.m("novo1", test_web.antes(0), test_web.M, test_web.G, "pedido"))
        m = self.ate(r, "mensagem", id="novo1")
        self.assertEqual((m["workspace"], m["projeto"]), ("r7-workspace", "alpha"))

    def test_evento_workspace_quando_o_remoto_cai(self):
        self.cenario()
        c, r = self.stream("/api/stream?workspace=*")
        self.ate(r, "mensagem", workspace="aura")   # o gerente já fez a linha de base
        time.sleep(0.6)
        self._parar(self.aura)
        w = self.ate(r, "workspace", id="aura")
        self.assertEqual((w["online"], w["saude"]), (False, "offline"))
        self.assertEqual(w["local"], False)
        self.assertIsNotNone(w["offline_desde"])

    def test_evento_workspace_quando_a_saude_muda(self):
        self.cenario()
        c, r = self.stream("/api/stream?workspace=*")
        self.ate(r, "mensagem", workspace="aura")
        time.sleep(0.6)
        self.aura.cfg["geral"] = GERAL_CRITICO
        w = self.ate(r, "workspace", id="aura")
        self.assertEqual((w["online"], w["saude"]), (True, "critico"))

    def test_ocupa_so_uma_vaga(self):
        self.cenario()
        c1, r1 = self.stream("/api/stream?workspace=*")
        self.assertEqual(r1.status, 200)
        self.evento(r1)
        c2, r2 = self.stream("/api/stream?projeto=*")      # a 2ª vaga ainda existe
        self.assertEqual(r2.status, 200)
        c3, r3 = self.stream("/api/stream?projeto=*")
        self.assertEqual(r3.status, 503)

    def test_ao_desconectar_encerra_as_threads_dos_remotos(self):
        self.cenario()
        c, r = self.stream("/api/stream?workspace=*")
        self.ate(r, "mensagem", workspace="aura")
        self.assertTrue(any(n.startswith("fed-cliente") for n in self.threads_fed()))
        r.close()
        c.close()
        for _ in range(80):
            if not self.threads_fed():
                break
            time.sleep(0.1)
        self.assertEqual(self.threads_fed(), [])

    def test_reconecta_depois_de_queda_do_stream_remoto(self):
        self.cenario()
        c, r = self.stream("/api/stream?workspace=*")
        self.ate(r, "mensagem", workspace="aura")
        self.aura.cfg["fechado"] = True            # o remoto fecha o stream mas continua de pé
        time.sleep(0.3)
        self.aura.cfg["fechado"] = False
        m = self.ate(r, "mensagem", workspace="aura")  # reconectou (backoff de 1 s) e recebeu de novo
        self.assertEqual(m["id"], "r1")


class Servico(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="agent-board-svc-")
        self.addCleanup(shutil.rmtree, self.dir, True)
        self.cmds, self.saida = [], []
        self.serve_json = None
        self.cert_domains = ["r7-workspace.tailcf59a0.ts.net"]  # tailnet com HTTPS habilitado

    def executar(self, cmd):
        self.cmds.append(cmd)
        if cmd[:3] == ["tailscale", "status", "--json"]:
            return 0, json.dumps({"CertDomains": self.cert_domains})
        if cmd[:3] == ["tailscale", "serve", "status"]:
            return (0, json.dumps(self.serve_json)) if self.serve_json is not None else (1, "")
        if cmd[:2] == ["systemctl", "is-active"]:
            return 0, "active\n"
        return 0, ""

    def rodar(self, fn, *a, **kw):
        return fn(*a, dir_unit=self.dir, executar=self.executar, saida=self.saida.append, **kw)

    def unit(self):
        return os.path.join(self.dir, cmd_servico.NOME_UNIT)

    def test_unit_gerado(self):
        t = cmd_servico.gerar_unit(8765, home=os.path.expanduser("~/.agent-hooks/agent-board"))
        scripts = os.path.dirname(os.path.abspath(cmd_servico.__file__))
        self.assertIn(f"ExecStart=/usr/bin/python3 {scripts}/painel.py servir --porta 8765\n", t)
        self.assertIn("Restart=always\n", t)
        self.assertIn("User=root\n", t)
        self.assertIn(f"WorkingDirectory={os.path.dirname(scripts)}\n", t)
        self.assertIn("WantedBy=multi-user.target", t)
        self.assertNotIn("AGENT_BOARD_HOME", t)

    def test_home_fora_do_padrao_vira_environment(self):
        self.assertIn("Environment=AGENT_BOARD_HOME=/srv/ab\n", cmd_servico.gerar_unit(8765, home="/srv/ab"))

    def test_porta_no_exec_start(self):
        self.assertIn("servir --porta 9000\n", cmd_servico.gerar_unit(9000))

    def test_dry_run_imprime_unit_e_comandos_sem_executar_nem_gravar(self):
        self.assertEqual(self.rodar(cmd_servico.instalar, 8765, dry_run=True), 0)
        texto = "\n".join(self.saida)
        self.assertIn("ExecStart=/usr/bin/python3", texto)
        self.assertIn("$ systemctl enable --now agent-board-painel.service", texto)
        self.assertIn("$ tailscale serve --bg --https=443 http://127.0.0.1:8765", texto)
        self.assertIn("$ tailscale serve --bg --http=8765 http://127.0.0.1:8765", texto)
        # dry-run só consulta (leitura) se a tailnet tem HTTPS; nada que mude a máquina
        self.assertEqual(self.cmds, [["tailscale", "status", "--json"]])
        self.assertFalse(os.path.exists(self.unit()))

    def test_instalar_grava_unit_liga_e_configura_o_serve(self):
        self.assertEqual(self.rodar(cmd_servico.instalar, 8765), 0)
        with open(self.unit()) as f:
            self.assertEqual(f.read(), cmd_servico.gerar_unit(8765))
        self.assertIn(["systemctl", "daemon-reload"], self.cmds)
        self.assertIn(["systemctl", "enable", "--now", "agent-board-painel.service"], self.cmds)
        for c in cmd_servico.comandos_serve(8765):
            self.assertIn(c, self.cmds)

    def test_instalar_e_idempotente(self):
        self.rodar(cmd_servico.instalar, 8765)
        self.serve_json = {"Web": {"r7-workspace.tailcf59a0.ts.net:443": {"Handlers": {"/": {"Proxy": "http://127.0.0.1:8765"}}},
                                   "r7-workspace.tailcf59a0.ts.net:8765": {"Handlers": {"/": {"Proxy": "http://127.0.0.1:8765"}}}}}
        antes = os.stat(self.unit()).st_mtime_ns
        self.cmds.clear()
        self.assertEqual(self.rodar(cmd_servico.instalar, 8765), 0)
        self.assertEqual(os.stat(self.unit()).st_mtime_ns, antes)
        self.assertNotIn(["systemctl", "daemon-reload"], self.cmds)
        self.assertEqual([c for c in self.cmds if c[:2] == ["tailscale", "serve"] and "--bg" in c], [])

    def test_tailnet_sem_https_usa_http_80_no_navegador(self):
        self.cert_domains = None
        self.assertEqual(self.rodar(cmd_servico.instalar, 8765), 0)
        self.assertIn(["tailscale", "serve", "--bg", "--http=80", "http://127.0.0.1:8765"], self.cmds)
        self.assertNotIn(["tailscale", "serve", "--bg", "--https=443", "http://127.0.0.1:8765"], self.cmds)
        self.assertTrue(any("não emite HTTPS" in l for l in self.saida))
        # idempotente também no modo HTTP
        self.serve_json = {"Web": {"h:80": {"Handlers": {"/": {"Proxy": "http://127.0.0.1:8765"}}},
                                   "h:8765": {"Handlers": {"/": {"Proxy": "http://127.0.0.1:8765"}}}}}
        self.cmds = []
        self.rodar(cmd_servico.instalar, 8765)
        self.assertEqual([c for c in self.cmds if c[:2] == ["tailscale", "serve"] and "--bg" in c], [])

    def test_serve_configurado(self):
        ok = {"Web": {"h:443": {"Handlers": {"/": {"Proxy": "http://127.0.0.1:8765"}}},
                      "h:8765": {"Handlers": {"/": {"Proxy": "http://127.0.0.1:8765"}}}}}
        self.assertTrue(cmd_servico.serve_configurado(ok, 8765))
        self.assertFalse(cmd_servico.serve_configurado(None, 8765))
        self.assertFalse(cmd_servico.serve_configurado({}, 8765))
        self.assertFalse(cmd_servico.serve_configurado({"Web": {"h:443": ok["Web"]["h:443"]}}, 8765))
        self.assertFalse(cmd_servico.serve_configurado(ok, 9000))

    def test_falha_do_systemctl_devolve_1(self):
        self.executar = lambda cmd: (1, "boom") if cmd[:2] == ["systemctl", "enable"] else (0, "")
        self.assertEqual(self.rodar(cmd_servico.instalar, 8765), 1)

    def test_status(self):
        self.rodar(cmd_servico.instalar, 8765)
        self.saida.clear()
        self.serve_json = {}
        self.assertEqual(self.rodar(cmd_servico.status, 8765), 0)
        texto = "\n".join(self.saida)
        self.assertIn("existe", texto)
        self.assertIn("serviço: active", texto)
        self.assertIn("tailscale serve: não configurado", texto)

    def test_remover(self):
        self.rodar(cmd_servico.instalar, 8765)
        self.serve_json = {"Web": {"h:443": {"Handlers": {"/": {"Proxy": "http://127.0.0.1:8765"}}},
                                   "h:8765": {"Handlers": {"/": {"Proxy": "http://127.0.0.1:8765"}}}}}
        self.cmds.clear()
        self.assertEqual(self.rodar(cmd_servico.remover, 8765), 0)
        self.assertFalse(os.path.exists(self.unit()))
        self.assertIn(["systemctl", "disable", "--now", "agent-board-painel.service"], self.cmds)
        for c in cmd_servico.comandos_serve_off(8765):
            self.assertIn(c, self.cmds)

    def test_cli_dry_run(self):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf), self.assertRaises(SystemExit) as e:
            cmd_servico.servico(["instalar", "--dry-run", "--dir-unit", self.dir])
        self.assertEqual(e.exception.code, 0)
        self.assertIn("Restart=always", buf.getvalue())
        self.assertFalse(os.path.exists(self.unit()))

    def test_registrado_no_painel_py(self):
        import painel
        self.assertIs(painel.COMANDOS["servico"], cmd_servico.servico)


if __name__ == "__main__":
    try:
        unittest.main(verbosity=1)
    finally:
        shutil.rmtree(HOME_TESTE, ignore_errors=True)
