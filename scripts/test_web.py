#!/usr/bin/env python3
"""Testes do painel web: estado derivado do log e servidor só leitura em 127.0.0.1.

  python3 scripts/test_web.py
"""
import datetime
import http.client
import json
import os
import shutil
import sys
import tempfile
import threading
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
HOME_TESTE = tempfile.mkdtemp(prefix="agent-board-web-")
os.environ["AGENT_BOARD_HOME"] = HOME_TESTE  # antes de importar base
sys.path.insert(0, AQUI)

import cmd_web  # noqa: E402
import painel_estado  # noqa: E402
import registro  # noqa: E402

CONFIG = os.path.join(AQUI, "..", "templates", "agent-board.json")
AGORA = datetime.datetime(2026, 10, 12, 15, 0, tzinfo=datetime.timezone.utc)
PAINEIS = {
    "term_m": {"projeto": "alpha", "agente": "alpha-master", "papel": "master", "cadastrado_em": "2026-10-01T00:00:00+00:00"},
    "term_g": {"projeto": "alpha", "agente": "alpha-manager01-cc", "papel": "manager", "cadastrado_em": "2026-10-01T00:00:00+00:00"},
    "term_r": {"projeto": "alpha", "agente": "alpha-researcher01-cc", "papel": "researcher", "cadastrado_em": "2026-10-01T00:00:00+00:00"},
    "term_x": {"projeto": "beta", "agente": "beta-master", "papel": "master"},
}


def ts(h, m=0, dia=12):
    return datetime.datetime(2026, 10, dia, h, m, tzinfo=datetime.timezone.utc).isoformat(timespec="seconds")


def m(cid, quando, de, para, tipo, **extra):
    return dict({"id": cid, "ts": quando, "de": de, "para": para, "tipo": tipo, "assunto": cid}, **extra)


M, G, R = "alpha-master", "alpha-manager01-cc", "alpha-researcher01-cc"


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="agent-board-w-")
        self.raiz = os.path.join(self.tmp, "alpha")
        os.makedirs(os.path.join(self.raiz, "docs/agent-board"))
        with open(CONFIG) as f:
            cfg = json.load(f)
        cfg["projeto"], cfg["prefixo"] = "alpha", "alpha"
        with open(os.path.join(self.raiz, "docs/agent-board/agent-board.json"), "w") as f:
            json.dump(cfg, f)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def gravar(self, *linhas):
        for l in linhas:
            registro.gravar_log(self.raiz, l)


class Estado(Base):
    def test_estados_das_tarefas(self):
        self.gravar(
            m("p-aberto", ts(14), M, R, "pedido"),
            m("p-andando", ts(13), M, G, "pedido", modo="executar"),
            m("a-1", ts(14, 30), G, M, "andamento", responde_a="p-andando"),
            m("p-atrasado", ts(10), M, R, "pedido", prazo=ts(12)),
            m("p-feito", ts(9), M, R, "pedido"),
            m("r-feito", ts(9, 30), R, M, "resposta", responde_a="p-feito"),
            m("e-revisao", ts(11), G, M, "entrega", issues=[412], branch="ab/alpha-manager01-cc"),
            m("e-aprovada", ts(8), G, M, "entrega"),
            m("r-aprov", ts(8, 30), M, G, "resposta", responde_a="e-aprovada", veredito="aprovado"),
            m("e-rejeitada", ts(8), G, M, "entrega"),
            m("r-rej", ts(8, 40), M, G, "resposta", responde_a="e-rejeitada", veredito="rejeitado"),
        )
        e = painel_estado.montar(self.raiz, "alpha", PAINEIS, "hoje", agora=AGORA)
        estados = {t["id"]: t["estado"] for t in e["tarefas"]}
        self.assertEqual(estados, {"p-aberto": "aberto", "p-andando": "em_andamento", "p-atrasado": "atrasado",
                                   "p-feito": "concluido", "e-revisao": "aguardando_revisao",
                                   "e-aprovada": "aprovado", "e-rejeitada": "rejeitado"})
        self.assertEqual(e["indicadores"]["atrasados"], 1)
        self.assertEqual(e["indicadores"]["revisao"], 1)
        rev = next(t for t in e["tarefas"] if t["id"] == "e-revisao")
        self.assertEqual((rev["issues"], rev["branch"]), ([412], "ab/alpha-manager01-cc"))

    def test_pendentes_seguem_a_regra_do_stop(self):
        self.gravar(m("p-1", ts(14), M, R, "pedido"), m("av-1", ts(14), G, R, "aviso"),
                    m("p-2", ts(13), M, G, "pedido"), m("a-2", ts(13, 5), G, M, "andamento", responde_a="p-2"),
                    m("antes", "2026-09-01T00:00:00+00:00", M, R, "pedido"))
        e = painel_estado.montar(self.raiz, "alpha", PAINEIS, "hoje", agora=AGORA)
        pend = {a["agente"]: a["pendentes"] for a in e["agentes"]}
        self.assertEqual(pend, {M: 0, G: 0, R: 2})
        self.assertEqual(e["indicadores"]["pendentes"], 2)
        self.assertEqual(e["indicadores"]["agentes_com_pendente"], 1)

    def test_periodo_arestas_e_outro_projeto_fora(self):
        self.gravar(m("ontem", ts(10, dia=11), M, R, "aviso"), m("h1", ts(10), M, R, "aviso"),
                    m("h2", ts(11), M, R, "aviso"), m("h3", ts(12), R, M, "resposta", responde_a="h2"))
        e = painel_estado.montar(self.raiz, "alpha", PAINEIS, "hoje", agora=AGORA)
        self.assertEqual(e["indicadores"]["mensagens"], 3)
        self.assertEqual(e["indicadores"]["mensagens_antes"], 1)
        self.assertEqual(e["arestas"], [{"de": M, "para": R, "n": 2}, {"de": R, "para": M, "n": 1}])
        self.assertEqual([a["agente"] for a in e["agentes"]], [M, G, R])  # beta-master fica fora
        self.assertNotIn("raiz", e["agentes"][0])
        self.assertEqual(e["linha_do_tempo"][0]["id"], "h3")
        self.assertEqual(e["indicadores"]["tempo_resposta"], {"media": 60.0, "p90": 60.0})
        e7 = painel_estado.montar(self.raiz, "alpha", PAINEIS, "7d", agora=AGORA)
        self.assertEqual(e7["indicadores"]["mensagens"], 4)

    def test_ping_pong_e_entrega_zera(self):
        conversa = [m(f"pp{i}", ts(14, i // 2), G if i % 2 else R, R if i % 2 else G, "aviso") for i in range(14)]
        self.gravar(*conversa)
        e = painel_estado.montar(self.raiz, "alpha", PAINEIS, "hoje", agora=AGORA)
        self.assertEqual(len(e["alertas"]), 1)
        self.assertEqual((e["alertas"][0]["de"], e["alertas"][0]["para"]), (G, R))
        self.gravar(m("ent", ts(14, 30), G, M, "entrega"))
        poucas = painel_estado.ping_pong(conversa[:7] + [m("ent", ts(14, 3), G, R, "entrega")] + conversa[7:])
        self.assertEqual(poucas, [])

    def test_cadeia_quebrada_e_painel_fechado(self):
        self.gravar(m("c1", ts(10), M, R, "aviso"), m("c2", ts(11), M, R, "aviso"))
        caminho = os.path.join(self.raiz, "docs/agent-board/comunicacoes.jsonl")
        with open(caminho) as f:
            ls = f.read().splitlines()
        with open(caminho, "w") as f:
            f.write(ls[0].replace('"c1"', '"cX"') + "\n" + ls[1] + "\n")
        e = painel_estado.montar(self.raiz, "alpha", PAINEIS, "hoje", agora=AGORA, abertos={"term_m", "term_g"})
        self.assertFalse(e["cadeia"]["integra"])
        self.assertEqual({a["agente"]: a["aberto"] for a in e["agentes"]}, {M: True, G: True, R: False})

    def test_notas_do_log_e_do_disco(self):
        self.gravar(dict(m("n-1", ts(11), M, None, "nota"), tema="auth", decisao=True, assunto="JWT curto"))
        pasta = os.path.join(self.raiz, "docs/agent-board/notas")
        os.makedirs(pasta, exist_ok=True)
        with open(os.path.join(pasta, "infra.md"), "w") as f:
            f.write("# Portas do ambiente\n\nPostgres 5433\n")
        e = painel_estado.montar(self.raiz, "alpha", PAINEIS, "hoje", agora=AGORA)
        por_tema = {n["tema"]: n for n in e["notas"]}
        self.assertTrue(por_tema["auth"]["decisao"])
        self.assertEqual((por_tema["infra"]["titulo"], por_tema["infra"]["trecho"]), ("Portas do ambiente", "Postgres 5433"))
        self.assertNotIn("n-1", [t["id"] for t in e["linha_do_tempo"]])


class Servidor(Base):
    def setUp(self):
        super().setUp()
        with open(os.path.join(HOME_TESTE, "paineis.json"), "w") as f:
            json.dump({"versao": 1, "paineis": PAINEIS}, f)
        self.gravar(m("c1", datetime.datetime.now().astimezone().isoformat(timespec="seconds"), M, R, "pedido",
                      assunto='<img src=x onerror="alert(1)">'))
        self.srv = cmd_web.servidor(self.raiz, 0, perguntar_orca=False)
        self.porta = self.srv.server_address[1]
        self.srv.RequestHandlerClass = cmd_web.criar_handler(self.raiz, {"projeto": "alpha"}, self.porta, False)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()
        super().tearDown()

    def pedir(self, metodo, caminho, host=None):
        c = http.client.HTTPConnection("127.0.0.1", self.porta, timeout=5)
        c.request(metodo, caminho, headers={"Host": host or f"127.0.0.1:{self.porta}"})
        r = c.getresponse()
        corpo = r.read().decode()
        c.close()
        return r, corpo

    def test_escuta_so_em_loopback(self):
        self.assertEqual(self.srv.server_address[0], "127.0.0.1")

    def test_pagina_com_cabecalhos_de_seguranca(self):
        r, corpo = self.pedir("GET", "/")
        self.assertEqual(r.status, 200)
        self.assertIn("default-src 'self'", r.getheader("Content-Security-Policy"))
        self.assertEqual(r.getheader("X-Content-Type-Options"), "nosniff")
        self.assertIn("<title>agent-board · painel</title>", corpo)
        self.assertNotIn("innerHTML", corpo)

    def test_api_estado_entrega_texto_do_log_como_dado(self):
        r, corpo = self.pedir("GET", "/api/estado?periodo=7d")
        self.assertEqual(r.status, 200)
        e = json.loads(corpo)
        self.assertEqual(e["periodo"], "7d")
        self.assertEqual(e["linha_do_tempo"][0]["assunto"], '<img src=x onerror="alert(1)">')
        self.assertEqual(json.loads(self.pedir("GET", "/api/estado?periodo=xyz")[1])["periodo"], "hoje")

    def test_host_estranho_e_barrado(self):
        self.assertEqual(self.pedir("GET", "/", host="evil.example:80")[0].status, 403)
        self.assertEqual(self.pedir("GET", "/api/estado", host=f"localhost:{self.porta}")[0].status, 200)

    def test_so_leitura_e_rotas_desconhecidas(self):
        for metodo in ("POST", "PUT", "DELETE", "PATCH"):
            self.assertEqual(self.pedir(metodo, "/api/estado")[0].status, 405, metodo)
        self.assertEqual(self.pedir("GET", "/../../etc/passwd")[0].status, 404)
        self.assertEqual(self.pedir("GET", "/painel_web.html")[0].status, 404)


if __name__ == "__main__":
    try:
        unittest.main(verbosity=1)
    finally:
        shutil.rmtree(HOME_TESTE, ignore_errors=True)
