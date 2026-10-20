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
from unittest import mock

AQUI = os.path.dirname(os.path.abspath(__file__))
HOME_TESTE = tempfile.mkdtemp(prefix="agent-board-web-")
os.environ["AGENT_BOARD_HOME"] = HOME_TESTE  # antes de importar base
sys.path.insert(0, AQUI)

import cmd_web  # noqa: E402
import painel_dados  # noqa: E402
import painel_estado  # noqa: E402
import painel_orca  # noqa: E402
import painel_stream  # noqa: E402
import painel_subagentes  # noqa: E402
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
        self.assertEqual(e["indicadores"]["tempo_resposta"], {"media": 60.0, "p50": 60.0, "p90": 60.0})
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


class NotasDoPainelPy(Base):
    def test_trecho_vem_do_arquivo_escrito_pelo_painel_py_nota(self):
        import subprocess
        env = dict(os.environ, AGENT_BOARD_HOME=HOME_TESTE)
        env.pop("ORCA_TERMINAL_HANDLE", None)
        for extra, texto in (([], "Postgres 5433, Redis 6380"), (["--decisao"], "JWT curto com refresh rotativo")):
            r = subprocess.run([sys.executable, os.path.join(AQUI, "painel.py"), "nota", "--raiz", self.raiz,
                                "--tema", "infra", "--de", "ceo"] + extra + [texto],
                               capture_output=True, text=True, env=env, timeout=30)
            self.assertEqual(r.returncode, 0, r.stderr)
        ns = painel_estado.montar(self.raiz, "alpha", PAINEIS, "hoje")["notas"]
        self.assertEqual(sorted((n["titulo"], n["trecho"], n["de"]) for n in ns),
                         [("Decisão", "JWT curto com refresh rotativo", "ceo"), ("Nota", "Postgres 5433, Redis 6380", "ceo")])


class Servidor(Base):
    def setUp(self):
        super().setUp()
        with open(os.path.join(HOME_TESTE, "paineis.json"), "w") as f:
            json.dump({"versao": 1, "paineis": PAINEIS}, f)
        self.gravar(m("c1", datetime.datetime.now().astimezone().isoformat(timespec="seconds"), M, R, "pedido",
                      assunto='<img src=x onerror="alert(1)">'))
        self.srv = cmd_web.servidor(self.raiz, 0, perguntar_orca=False)
        self.porta = self.srv.server_address[1]
        threading.Thread(target=self.srv.serve_forever, args=(0.02,), daemon=True).start()

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
        self.assertIn("<title>agent-board", corpo)  # v1 ou build da SPA
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
        for metodo in ("POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"):
            r = self.pedir(metodo, "/api/estado")[0]
            self.assertEqual(r.status, 405, metodo)
            self.assertEqual(r.getheader("X-Content-Type-Options"), "nosniff", metodo)
        self.assertEqual(self.pedir("GET", "/../../etc/passwd")[0].status, 404)
        self.assertEqual(self.pedir("GET", "/painel_web.html")[0].status, 404)


# ---------------------------------------------------------------------------
# Painel v2: status do agente, dados derivados, API e SSE
# ---------------------------------------------------------------------------
class StatusAgente(unittest.TestCase):
    AGORA_MS = 1_800_000_000_000

    def st(self, titulo="", preview="", saida=None, pend=0, **kw):
        t = {"title": titulo, "preview": preview, "lastOutputAt": saida}
        return painel_estado.status_agente(t, pend, self.AGORA_MS, **kw)

    def test_titulos_reais(self):
        self.assertEqual(self.st("✳ r7one-manager01-cc"), "parado")
        self.assertEqual(self.st("⠋ π - r7one-manager01-omp - tmp"), "trabalhando")
        self.assertEqual(self.st("◑ Atualização do dashboard"), "trabalhando")
        self.assertEqual(self.st("root@vmi3520955: ~"), "parado")

    def test_prioridades(self):
        self.assertEqual(painel_estado.status_agente(None, 3, self.AGORA_MS), "offline")
        self.assertEqual(painel_estado.status_agente({"title": "⠋ x"}, 0, self.AGORA_MS, orca_ok=False), "desconhecido")
        self.assertEqual(painel_estado.status_agente({"title": "x"}, 0, self.AGORA_MS, maestri=True), "desconhecido")
        # pai parado na tela esperando o sub-agent conta como trabalhando; offline continua offline
        self.assertEqual(painel_estado.status_agente({"title": "✳ x"}, 2, self.AGORA_MS, subs_rodando=1), "trabalhando")
        self.assertEqual(painel_estado.status_agente(None, 0, self.AGORA_MS, subs_rodando=1), "offline")
        self.assertEqual(painel_estado.status_agente({"title": "x", "preview": "Do you want to proceed?"}, 0,
                                                     self.AGORA_MS, subs_rodando=1), "esperando")
        # esperando vence trabalhando
        self.assertEqual(self.st("⠋ x", "Do you want to proceed?\n❯ 1. Yes\n  2. No"), "esperando")
        for tela in ("Continue? [y/n]", "Allow this tool?", "Needs permission to run"):
            self.assertEqual(self.st("✳ x", tela), "esperando", tela)
        # trabalhando vence pendente
        self.assertEqual(self.st("⠋ x", pend=2), "trabalhando")
        self.assertEqual(self.st("bash", pend=2, saida=self.AGORA_MS - 3000), "trabalhando")
        # Claude Code/OMP ociosos redesenham a tela: a saída recente não vira trabalhando (status piscava)
        self.assertEqual(self.st("✳ x", pend=2, saida=self.AGORA_MS - 3000), "pendente")
        self.assertEqual(self.st("✳ r7one-manager01-cc", saida=self.AGORA_MS - 1000), "parado")
        self.assertEqual(self.st("π - r7one-manager01-omp - tmp", saida=self.AGORA_MS - 1000), "parado")
        self.assertEqual(self.st("π - 󰒋 OMP: r7one-manager02-omp - t", saida=self.AGORA_MS - 1000), "parado")
        self.assertEqual(self.st("✳ x", pend=2, saida=self.AGORA_MS - 11000), "pendente")
        self.assertEqual(self.st("✳ x", pend=0, saida=self.AGORA_MS - 11000), "parado")
        self.assertEqual(self.st("✳ x", saida=None), "parado")

    def test_tela_antiga_longe_do_fim_nao_pede_acao(self):
        preview = "Do you want a summary?\n" + "\n".join(f"linha {i}" for i in range(30)) + "\n❯ "
        self.assertEqual(self.st("✳ x", preview), "parado")


class OrcaTerminais(unittest.TestCase):
    def test_normaliza_a_lista_do_orca(self):
        bruta = [{"handle": "term_a", "title": "✳ a", "preview": "oi", "lastOutputAt": 5, "agentIdentity": "claude",
                  "branch": "x", "worktreePath": "/root"}, {"id": "term_b"}, {"title": "sem handle"}]
        n = painel_orca.normalizar(bruta)
        self.assertEqual(sorted(n), ["term_a", "term_b"])
        self.assertEqual(n["term_a"], {"handle": "term_a", "title": "✳ a", "preview": "oi", "lastOutputAt": 5,
                                       "agentIdentity": "claude"})

    def test_cache_de_2s(self):
        chamadas = []
        painel_orca._cache.update(t=0.0, v=None)

        def consulta():
            chamadas.append(1)
            return {"term_a": {}}
        try:
            self.assertEqual(painel_orca.terminais(consulta), {"term_a": {}})
            painel_orca.terminais(consulta)
            self.assertEqual(len(chamadas), 1)
            painel_orca._cache["t"] -= 3
            painel_orca.terminais(consulta)
            self.assertEqual(len(chamadas), 2)
        finally:
            painel_orca._cache.update(t=0.0, v=None)


def carregar():
    from base import carregar_paineis
    return carregar_paineis()


def urllib_quote(texto):
    import urllib.parse
    return urllib.parse.quote(texto, safe="")


def agora_local():
    return datetime.datetime.now().astimezone()


def antes(minutos=0, dias=0):
    return (agora_local() - datetime.timedelta(minutes=minutos, days=dias)).isoformat(timespec="seconds")


def cenario_msgs():
    """p1 (com issue 7, andamento, entrega e aprovação), p2 aberto para o researcher, p3 antigo, nota e aviso."""
    return [
        m("p1", antes(60), M, G, "pedido", issues=[7]),
        m("a1", antes(50), G, M, "andamento", responde_a="p1"),
        m("e1", antes(40), G, M, "entrega", responde_a="p1", issues=[7], branch="ab/alpha-manager01-cc"),
        m("r1", antes(30), M, G, "resposta", responde_a="e1", veredito="aprovado"),
        m("p2", antes(20), M, R, "pedido"),
        m("av1", antes(15), M, R, "aviso"),
        dict(m("n1", antes(10), M, None, "nota"), tema="auth", decisao=True),
        m("p3", antes(dias=3), M, G, "pedido"),
        m("rp3", antes(dias=3, minutos=-5), G, M, "resposta", responde_a="p3"),
    ]


def paineis_do(raiz, raiz_beta=None):
    ps = {h: dict(p, raiz=raiz) for h, p in PAINEIS.items() if p["projeto"] == "alpha"}
    ps["term_x"] = {"projeto": "beta", "agente": "beta-master", "papel": "master"}
    if raiz_beta:
        ps["term_x"]["raiz"] = raiz_beta
    return ps


class Cenario(Base):
    def setUp(self):
        super().setUp()
        self.raiz_beta = os.path.join(self.tmp, "beta")
        os.makedirs(os.path.join(self.raiz_beta, "docs/agent-board"))
        with open(CONFIG) as f:
            cfg = json.load(f)
        cfg["projeto"], cfg["prefixo"] = "beta", "beta"
        with open(os.path.join(self.raiz_beta, "docs/agent-board/agent-board.json"), "w") as f:
            json.dump(cfg, f)
        registro.gravar_log(self.raiz_beta, m("b1", antes(5), "beta-master", "beta-master", "aviso"))
        with open(os.path.join(HOME_TESTE, "paineis.json"), "w") as f:
            json.dump({"versao": 1, "paineis": paineis_do(self.raiz, self.raiz_beta)}, f)
        self.gravar(*cenario_msgs())
        agora_ms = int(agora_local().timestamp() * 1000)
        self.terminais = {
            "term_m": {"handle": "term_m", "title": "✳ alpha-master", "preview": "tudo certo\n❯ ",
                       "lastOutputAt": agora_ms - 600000, "agentIdentity": "claude"},
            "term_g": {"handle": "term_g", "title": "⠋ π - alpha-manager01-cc - tmp", "preview": "rodando testes",
                       "lastOutputAt": agora_ms - 1000, "agentIdentity": None},
        }

    def tearDown(self):
        with open(os.path.join(HOME_TESTE, "paineis.json"), "w") as f:
            json.dump({"versao": 1, "paineis": {}}, f)
        super().tearDown()


class Dados(Cenario):
    def msgs(self):
        return registro.ler_log(self.raiz)

    def agentes(self, terminais="padrao"):
        t = self.terminais if terminais == "padrao" else terminais
        return painel_dados.agentes("alpha", carregar(), self.msgs(), t, agora_local())

    def test_agentes_status_ordem_e_stats(self):
        ags = {a["agente"]: a for a in self.agentes()}
        self.assertEqual(list(ags), [M, G, R])
        self.assertEqual((ags[M]["status"], ags[G]["status"], ags[R]["status"]), ("parado", "trabalhando", "offline"))
        self.assertEqual((ags[M]["harness"], ags[R]["harness"], ags[G]["harness"]), ("cc", "cc", "cc"))  # o do master vem do agentIdentity do Orca
        self.assertEqual(ags[R]["pendentes"], 2)  # p2 e o aviso
        self.assertEqual(ags[R]["tarefa_atual"], {"id": "p2", "assunto": "p2", "estado": "aberto"})
        self.assertIsNone(ags[G]["tarefa_atual"])
        self.assertEqual(ags[M]["tela"], "tudo certo\n❯")
        self.assertTrue(ags[G]["ultima_saida"].startswith(str(agora_local().year)))
        self.assertIsNone(ags[R]["tela"])
        s = ags[G]["stats"]
        self.assertEqual(len(s["atividade_14d"]), 14)
        self.assertEqual((s["mensagens_7d"], s["entregas_7d"], s["aprovadas_7d"], s["rejeitadas_7d"]), (3, 1, 1, 0))
        self.assertEqual(s["tempo_resposta_p50_min"], 7.5)  # p1 -> a1 (10 min) e p3 -> rp3 (5 min)
        self.assertIsNone(ags[R]["stats"]["tempo_resposta_p50_min"])
        self.assertEqual(sum(s["atividade_14d"]), 3)

    def test_orca_mudo_e_maestri(self):
        self.assertEqual({a["status"] for a in self.agentes(None)}, {"desconhecido"})
        ps = {"maestri:1": {"projeto": "alpha", "agente": "alpha-master", "papel": "master"}}
        a = painel_dados.agentes("alpha", ps, [], {}, agora_local())[0]
        self.assertEqual((a["status"], a["harness"]), ("desconhecido", "maestri"))

    def test_mensagens_paginadas(self):
        pg = painel_dados.mensagens(self.msgs(), limite=4)
        self.assertEqual([x["id"] for x in pg["mensagens"]], ["n1", "av1", "p2", "r1"])
        self.assertTrue(pg["mais"])
        self.assertNotIn("prev", pg["mensagens"][0])
        pg2 = painel_dados.mensagens(self.msgs(), antes=pg["mensagens"][-1]["ts"], limite=4)
        self.assertEqual([x["id"] for x in pg2["mensagens"]], ["e1", "a1", "p1", "rp3"])
        self.assertTrue(pg2["mais"])
        ult = painel_dados.mensagens(self.msgs(), antes=pg2["mensagens"][-1]["ts"], limite=10)
        self.assertEqual([x["id"] for x in ult["mensagens"]], ["p3"])
        self.assertFalse(ult["mais"])
        self.assertEqual([x["id"] for x in painel_dados.mensagens(self.msgs(), agente=R)["mensagens"]], ["av1", "p2"])
        self.assertEqual([x["id"] for x in painel_dados.mensagens(self.msgs(), tipo="nota")["mensagens"]], ["n1"])
        self.assertEqual([x["id"] for x in painel_dados.mensagens(self.msgs(), q="P1")["mensagens"]], ["p1"])

    def test_thread_transitiva(self):
        # r2 responde ao andamento, que responde ao pedido: entra na thread mesmo sem apontar para a raiz
        self.gravar(m("r2", antes(45), M, G, "aviso", responde_a="a1"), m("r3", antes(44), G, M, "aviso", responde_a="r2"))
        conv = painel_dados.conversa_por_id(painel_dados.conversas(self.msgs(), agora_local()), "p1")
        self.assertEqual([x["id"] for x in conv["mensagens"]], ["p1", "a1", "r2", "r3", "e1", "r1"])
        self.assertEqual(conv["conversa"]["n_mensagens"], 6)

    def test_raizes_so_pedido_e_entrega_sem_pai(self):
        ids = [c["id"] for c, _ in painel_dados.conversas(self.msgs(), agora_local())]
        self.assertEqual(ids, ["p2", "p1", "p3"])  # e1 tem pai, aviso e nota não são raiz
        c = painel_dados.conversa_por_id(painel_dados.conversas(self.msgs(), agora_local()), "p1")["conversa"]
        self.assertEqual((c["tipo"], c["estado"], c["issues"], c["branch"]), ("pedido", "aprovado", [7], "ab/alpha-manager01-cc"))
        self.assertEqual((c["participantes"], c["duracao_min"], c["de"], c["para"]), ([M, G], 30.0, M, G))
        self.assertIsNone(painel_dados.conversa_por_id(painel_dados.conversas(self.msgs(), agora_local()), "e1"))

    def test_entrega_orfa_vira_raiz(self):
        self.gravar(m("eo", antes(5), G, M, "entrega", responde_a="inexistente"))
        ids = [c["id"] for c, _ in painel_dados.conversas(self.msgs(), agora_local())]
        self.assertIn("eo", ids)

    def test_conversas_muitas_threads_nao_explode(self):
        msgs = []
        for i in range(1500):
            msgs += [m(f"p{i}", antes(2000 - i), M, G, "pedido"), m(f"a{i}", antes(1999 - i), G, M, "andamento", responde_a=f"p{i}")]
        t0 = datetime.datetime.now()
        self.assertEqual(len(painel_dados.conversas(msgs, agora_local())), 1500)
        self.assertLess((datetime.datetime.now() - t0).total_seconds(), 5)

    def test_analytics(self):
        a = painel_dados.analytics(registro.ler_tudo(self.raiz), agora_local())
        self.assertEqual(len(a["heatmap"]), 371)
        self.assertEqual(a["heatmap"][-1]["dia"], agora_local().date().isoformat())
        self.assertEqual(a["heatmap"][0]["dia"], (agora_local().date() - datetime.timedelta(days=370)).isoformat())
        self.assertEqual(sum(x["n"] for x in a["heatmap"]), 8)  # sem a nota
        self.assertEqual(len(a["ultimos_30d"]), 30)
        self.assertEqual(sum(x["mensagens"] for x in a["ultimos_30d"]), 8)
        self.assertEqual(sum(x["entregas"] for x in a["ultimos_30d"]), 1)
        self.assertEqual(sum(x["aprovadas"] for x in a["ultimos_30d"]), 1)
        self.assertEqual(len(a["horas"]), 24)
        self.assertEqual(sum(a["horas"]), 8)
        self.assertEqual(a["tipos"][0], {"tipo": "pedido", "n": 3})
        por = {x["agente"]: x for x in a["por_agente"]}
        self.assertEqual((por[M]["enviadas"], por[G]["enviadas"], por[G]["entregas"], por[G]["aprovadas"]), (5, 3, 1, 1))
        self.assertEqual((por[G]["p50_min"], por[G]["p90_min"]), (7.5, 9.5))
        self.assertEqual(a["alertas"], [])

    def test_analytics_inclui_arquivo(self):
        antigo = antes(dias=40)
        pasta = os.path.join(self.raiz, "docs/agent-board/arquivo")
        os.makedirs(pasta)
        with open(os.path.join(pasta, "2020-01.jsonl"), "w") as f:
            f.write(json.dumps(m("old", antigo, M, G, "aviso")) + "\n")
        a = painel_dados.analytics(registro.ler_tudo(self.raiz), agora_local())
        self.assertEqual(sum(x["n"] for x in a["heatmap"]), 9)
        self.assertEqual(sum(x["mensagens"] for x in a["ultimos_30d"]), 8)  # 30 dias não pega

    def test_workflows(self):
        agora = agora_local()
        msgs = self.msgs()
        tars = painel_estado.tarefas(msgs, agora)
        w = painel_dados.workflows(msgs, painel_dados.conversas(msgs, agora, tars), "7d", agora,
                                   {M: "master", G: "manager", R: "researcher"}, {t["id"]: t for t in tars})
        arestas = {(a["de"], a["para"]): a["n"] for a in w["arestas"]}
        self.assertEqual(arestas, {(M, G): 2, (M, R): 1, (G, "#7"): 1, ("#7", "revisao"): 1, ("revisao", "aprovado"): 1,
                                   (G, "concluido"): 1, (R, "em_aberto"): 1})
        nos = {n["id"]: n for n in w["nos"]}
        self.assertEqual((nos[M]["coluna"], nos[G]["coluna"], nos[R]["coluna"]), ("master", "manager", "researcher"))
        self.assertEqual((nos["#7"]["coluna"], nos["revisao"]["coluna"], nos["aprovado"]["coluna"]), ("issue", "revisao", "resultado"))
        self.assertEqual(nos["aprovado"]["rotulo"], "Aprovado")
        self.assertEqual(nos[M]["n"], 3)
        cols = [n["coluna"] for n in w["nos"]]
        self.assertEqual(cols, sorted(cols, key=("master", "manager", "researcher", "issue", "revisao", "resultado").index))
        seqs = {tuple(f["sequencia"]): f["n"] for f in w["fluxos"]}
        self.assertEqual(seqs[("pedido", "andamento", "entrega", "resposta:aprovado")], 1)
        self.assertEqual(seqs[("pedido",)], 1)
        k = w["kpis"]
        self.assertEqual((k["conversas"], k["taxa_aprovacao"], k["tempo_ate_entrega_p50_min"]), (3, 1.0, 20.0))
        self.assertEqual(k["msgs_por_conversa"], 2.3)
        pares = {(c["de"], c["para"]): c["n"] for c in w["comunicacao"]}
        self.assertEqual((pares[(M, G)], pares[(M, R)], pares[(G, M)]), (3, 2, 3))

    def test_workflows_vazio(self):
        w = painel_dados.workflows([], [], "hoje", agora_local(), {}, {})
        self.assertEqual((w["nos"], w["arestas"], w["fluxos"]), ([], [], []))
        self.assertEqual(w["kpis"], {"conversas": 0, "taxa_aprovacao": None, "tempo_ate_entrega_p50_min": None,
                                     "fluxo_mais_comum": None, "msgs_por_conversa": None, "subagentes": 0})



class VigiaDoStream(Cenario):
    def setUp(self):
        super().setUp()
        self.t = [100.0]
        self.vigia = painel_stream.Vigia(self.raiz, "alpha", carregar, lambda: self.terminais,
                                         {"orca": 2.0, "ping": 15.0}, relogio=lambda: self.t[0])

    def passo(self, avanca=0.0):
        self.t[0] += avanca
        return [(e, d) for e, d in self.vigia.passo()]

    def test_linha_base_nao_gera_evento(self):
        self.assertEqual(self.passo(), [])
        self.assertEqual(self.vigia.ola()[0], "ola")
        self.assertEqual(self.vigia.ola()[1]["projeto"], "alpha")

    def test_mensagem_tarefa_e_agente(self):
        self.gravar(m("p9", antes(0), M, R, "pedido"))
        evs = self.passo()
        self.assertEqual([e for e, _ in evs if e == "mensagem"], ["mensagem"])
        self.assertEqual(next(d for e, d in evs if e == "mensagem")["id"], "p9")
        self.assertNotIn("prev", next(d for e, d in evs if e == "mensagem"))
        self.assertEqual(next(d for e, d in evs if e == "tarefa")["id"], "p9")
        ag = next(d for e, d in evs if e == "agente")
        self.assertEqual((ag["agente"], ag["pendentes"], ag["tarefa_atual"]["id"]), (R, 3, "p9"))
        self.assertEqual(self.passo(), [])

    def test_tarefa_muda_de_estado(self):
        self.gravar(m("a9", antes(0), R, M, "andamento", responde_a="p2"))
        evs = self.passo()
        t = next(d for e, d in evs if e == "tarefa")
        self.assertEqual((t["id"], t["estado"]), ("p2", "em_andamento"))

    def test_agente_so_quando_mudou(self):
        self.terminais["term_m"] = dict(self.terminais["term_m"], title="⠙ alpha-master")
        self.assertEqual(self.passo(), [])  # ainda não passou o intervalo do orca
        evs = self.passo(2.5)
        self.assertEqual([(e, d["agente"], d["status"]) for e, d in evs], [("agente", M, "trabalhando")])
        self.assertEqual(self.passo(2.5), [])
        # só a ultima_saida mudar não conta
        self.terminais["term_m"] = dict(self.terminais["term_m"], lastOutputAt=1)
        self.assertEqual(self.passo(2.5), [])

    def test_ping_a_cada_15s(self):
        self.assertEqual(self.passo(10), [])
        evs = self.passo(6)
        self.assertEqual([e for e, _ in evs], ["ping"])
        self.assertIn("agora", evs[0][1])
        self.assertEqual(self.passo(1), [])

    def test_linha_incompleta_espera_o_fim(self):
        caminho = os.path.join(self.raiz, "docs/agent-board/comunicacoes.jsonl")
        linha = json.dumps(m("p8", antes(0), M, G, "aviso"))
        with open(caminho, "a") as f:
            f.write(linha[:20])
        self.assertEqual([e for e, _ in self.passo() if e == "mensagem"], [])
        with open(caminho, "a") as f:
            f.write(linha[20:] + "\n")
        self.assertEqual([d["id"] for e, d in self.passo() if e == "mensagem"], ["p8"])

    def test_arquivar_encolhe_o_log_sem_replay(self):
        caminho = os.path.join(self.raiz, "docs/agent-board/comunicacoes.jsonl")
        with open(caminho, "w") as f:
            f.write(json.dumps(m("s1", antes(0), M, G, "aviso")) + "\n")
        self.assertEqual([e for e, _ in self.passo() if e == "mensagem"], [])


class ApiV2(Cenario):
    INTERVALOS = {"log": 0.05, "orca": 0.1, "ping": 0.4}

    def setUp(self):
        super().setUp()
        self.conexoes = []
        self.srv = self.subir()
        self.porta = self.srv.server_address[1]

    def subir(self, **kw):
        srv = cmd_web.servidor(self.raiz, 0, terminais=lambda: self.terminais, intervalos=self.INTERVALOS, **kw)
        threading.Thread(target=srv.serve_forever, args=(0.02,), daemon=True).start()
        self.addCleanup(self._parar, srv)
        return srv

    def _parar(self, srv):
        for c in self.conexoes:
            c.close()
            c.sock = None
        srv.shutdown()
        srv.server_close()

    def get(self, caminho, host=None):
        c = http.client.HTTPConnection("127.0.0.1", self.porta, timeout=5)
        c.request("GET", caminho, headers={"Host": host or f"127.0.0.1:{self.porta}"})
        r = c.getresponse()
        corpo = r.read()
        c.close()
        return r, corpo

    def api(self, caminho):
        r, corpo = self.get(caminho)
        self.assertEqual(r.status, 200, corpo)
        self.assertEqual(r.getheader("Content-Type"), "application/json; charset=utf-8")
        return json.loads(corpo)

    # --- projetos
    def test_projetos(self):
        ps = self.api("/api/projetos")
        self.assertEqual(ps, [{"projeto": "alpha", "raiz": self.raiz, "agentes": 3, "atual": True},
                              {"projeto": "beta", "raiz": self.raiz_beta, "agentes": 1, "atual": False}])

    def test_projeto_desconhecido_e_selecao(self):
        r, corpo = self.get("/api/agentes?projeto=zzz")
        self.assertEqual((r.status, json.loads(corpo)), (404, {"erro": "projeto desconhecido"}))
        self.assertEqual(self.get("/api/stream?projeto=zzz")[0].status, 404)
        self.assertEqual([a["agente"] for a in self.api("/api/agentes?projeto=beta")], ["beta-master"])
        self.assertEqual([a["agente"] for a in self.api("/api/agentes")], [M, G, R])
        self.assertEqual([x["id"] for x in self.api("/api/mensagens?projeto=beta")["mensagens"]], ["b1"])

    def test_sem_raiz_vale_o_primeiro_do_cadastro(self):
        srv = cmd_web.servidor(None, 0, False)
        self.addCleanup(srv.server_close)
        porta = srv.server_address[1]
        threading.Thread(target=srv.serve_forever, args=(0.02,), daemon=True).start()
        self.addCleanup(srv.shutdown)
        c = http.client.HTTPConnection("127.0.0.1", porta, timeout=5)
        c.request("GET", "/api/projetos", headers={"Host": f"127.0.0.1:{porta}"})
        ps = json.loads(c.getresponse().read())
        c.close()
        self.assertEqual([(p["projeto"], p["atual"]) for p in ps], [("alpha", True), ("beta", False)])

    # --- rotas
    def test_estado_v1_e_resumo(self):
        e = self.api("/api/estado?periodo=7d")
        self.assertEqual((e["projeto"], e["periodo"]), ("alpha", "7d"))
        self.assertIn("linha_do_tempo", e)
        r = self.api("/api/resumo?periodo=7d")
        self.assertEqual(set(r), {"projeto", "versao", "agora", "periodo", "cadeia", "indicadores"})
        self.assertEqual(r["cadeia"]["integra"], True)
        ind = r["indicadores"]
        for k in ("mensagens", "pendentes", "atrasados", "revisao", "tempo_resposta"):
            self.assertIn(k, ind)
        self.assertEqual((ind["trabalhando"], ind["esperando"], ind["offline"], ind["abertos"], ind["entregas_periodo"]),
                         (1, 0, 1, 1, 1))
        self.assertEqual(self.api("/api/resumo?periodo=lixo")["periodo"], "hoje")

    def test_agentes(self):
        ags = self.api("/api/agentes")
        self.assertEqual([(a["agente"], a["status"]) for a in ags], [(M, "parado"), (G, "trabalhando"), (R, "offline")])
        self.assertEqual(set(ags[0]), {"agente", "papel", "handle", "harness", "worktree", "branch", "status", "tela",
                                       "ultima_saida", "pendentes", "tarefa_atual", "stats", "subagentes"})
        self.assertEqual(ags[2]["handle"], "term_r")

    def test_agentes_com_orca_mudo(self):
        self.terminais = None
        self.assertEqual({a["status"] for a in self.api("/api/agentes")}, {"desconhecido"})

    def test_tarefas(self):
        ts_ = self.api("/api/tarefas?periodo=hoje")
        estados = {t["id"]: t["estado"] for t in ts_}
        self.assertEqual(estados["p2"], "aberto")  # aberta sempre entra
        self.assertNotIn("p3", estados)  # fechada há 3 dias
        self.assertEqual(self.api("/api/tarefas?periodo=7d")[-1]["id"], "p3")
        self.assertEqual(set(ts_[0]), {"id", "ts", "tipo", "de", "para", "assunto", "estado", "prazo", "issues", "branch",
                                       "andamento", "andamento_ts", "fechada_em", "subagentes"})

    def test_conversas_e_filtros(self):
        cs = self.api("/api/conversas?periodo=7d")
        self.assertEqual([c["id"] for c in cs], ["p2", "p1", "p3"])
        self.assertEqual([c["id"] for c in self.api("/api/conversas?periodo=hoje&agente=" + R)], ["p2"])
        self.assertEqual([c["id"] for c in self.api("/api/conversas?periodo=7d&estado=aberto")], ["p2"])
        self.assertEqual([c["id"] for c in self.api("/api/conversas?periodo=7d&q=7")], ["p1"])
        self.assertEqual([c["id"] for c in self.api("/api/conversas?periodo=7d&q=%237")], ["p1"])
        self.assertEqual([c["id"] for c in self.api("/api/conversas?periodo=7d&limite=1")], ["p2"])
        self.assertEqual(len(self.api("/api/conversas?periodo=7d&limite=abc")), 3)

    def test_conversa_detalhe(self):
        d = self.api("/api/conversas/p1")
        self.assertEqual([x["id"] for x in d["mensagens"]], ["p1", "a1", "e1", "r1"])
        self.assertEqual(d["conversa"]["id"], "p1")
        self.assertEqual(d["conversa"]["estado"], "aprovado")  # a entrega aprovada manda, não o pedido "concluido"
        self.assertEqual([c["id"] for c in self.api("/api/conversas?periodo=7d&estado=aprovado")], ["p1"])
        self.assertTrue(all("prev" not in x for x in d["mensagens"]))
        r, corpo = self.get("/api/conversas/nao-existe")
        self.assertEqual((r.status, "erro" in json.loads(corpo)), (404, True))

    def test_mensagens_pagina(self):
        p1 = self.api("/api/mensagens?limite=3")
        self.assertEqual([x["id"] for x in p1["mensagens"]], ["n1", "av1", "p2"])
        self.assertTrue(p1["mais"])
        ate = urllib_quote(p1["mensagens"][-1]["ts"])
        p2 = self.api(f"/api/mensagens?limite=3&antes={ate}")
        self.assertEqual([x["id"] for x in p2["mensagens"]], ["r1", "e1", "a1"])
        self.assertEqual([x["id"] for x in self.api("/api/mensagens?agente=" + G + "&tipo=entrega")["mensagens"]], ["e1"])
        self.assertEqual([x["id"] for x in self.api("/api/mensagens?q=av1")["mensagens"]], ["av1"])
        self.assertFalse(self.api("/api/mensagens")["mais"])

    def test_analytics_e_workflows(self):
        a = self.api("/api/analytics")
        self.assertEqual((len(a["heatmap"]), len(a["horas"]), len(a["ultimos_30d"])), (371, 24, 30))
        w = self.api("/api/workflows?periodo=7d")
        self.assertEqual(w["kpis"]["conversas"], 3)
        self.assertEqual(self.api("/api/workflows?periodo=hoje")["kpis"]["conversas"] <= 3, True)

    def test_rota_desconhecida_e_so_leitura(self):
        r, corpo = self.get("/api/nada")
        self.assertEqual((r.status, json.loads(corpo)), (404, {"erro": "não encontrado"}))
        c = http.client.HTTPConnection("127.0.0.1", self.porta, timeout=5)
        c.request("POST", "/api/agentes", headers={"Host": f"127.0.0.1:{self.porta}"})
        self.assertEqual(c.getresponse().status, 405)
        c.close()
        self.assertEqual(self.get("/api/agentes", host="evil.example")[0].status, 403)

    # --- SPA e assets
    def web(self, com_index=True):
        d = os.path.join(self.tmp, "web")
        os.makedirs(os.path.join(d, "assets"))
        if com_index:
            with open(os.path.join(d, "index.html"), "w") as f:
                f.write("<!doctype html><title>spa</title>")
        for nome, conteudo in (("app.js", "x"), ("app.css", "x"), ("i.svg", "<svg/>"), ("f.woff2", "x"), ("p.png", "x")):
            with open(os.path.join(d, "assets", nome), "w") as f:
                f.write(conteudo)
        with open(os.path.join(d, "segredo.txt"), "w") as f:
            f.write("segredo")
        with open(os.path.join(d, "favicon.svg"), "w") as f:
            f.write("<svg/>")
        velho = cmd_web.DIR_WEB
        cmd_web.DIR_WEB = d
        self.addCleanup(setattr, cmd_web, "DIR_WEB", velho)

    def test_spa_fallback_e_assets(self):
        self.web()
        for caminho in ("/", "/conversas/p1", "/office"):
            r, corpo = self.get(caminho)
            self.assertEqual((r.status, corpo), (200, b"<!doctype html><title>spa</title>"), caminho)
            self.assertIn("text/html", r.getheader("Content-Type"))
            self.assertIn("default-src 'self'", r.getheader("Content-Security-Policy"))
        for nome, tipo in (("app.js", "text/javascript"), ("app.css", "text/css"), ("i.svg", "image/svg+xml"),
                           ("f.woff2", "font/woff2"), ("p.png", "image/png")):
            r, _ = self.get("/assets/" + nome)
            self.assertEqual(r.status, 200, nome)
            self.assertTrue(r.getheader("Content-Type").startswith(tipo), nome)
            self.assertEqual(r.getheader("X-Content-Type-Options"), "nosniff")
        self.assertEqual(self.get("/assets/nao.js")[0].status, 404)
        self.assertEqual(self.get("/foo.js")[0].status, 404)
        self.assertEqual(self.get("/favicon.svg")[0].status, 200)  # ícones da raiz do build
        self.assertEqual(self.get("/segredo.txt")[0].status, 404)
        self.assertEqual(self.get("/index.html")[0].status, 404)
        self.assertEqual(self.get("/api/nada")[0].status, 404)  # /api nunca cai na SPA

    def test_assets_sem_path_traversal(self):
        self.web()
        for caminho in ("/assets/../segredo.txt", "/assets/..%2fsegredo.txt", "/assets/%2e%2e/segredo.txt",
                        "/assets/../../../../etc/passwd", "/assets//etc/passwd", "/assets/..\\segredo.txt",
                        "/assets/", "/assets", "/assets/%00.js"):
            r, corpo = self.get(caminho)
            self.assertNotIn(b"segredo", corpo, caminho)
            self.assertIn(r.status, (404,) if caminho != "/assets" else (200, 404), caminho)

    def test_sem_build_cai_no_html_antigo(self):
        self.web(com_index=False)
        # DIR_WEB sem index.html: usa painel_web.html
        r, corpo = self.get("/")
        self.assertEqual(r.status, 200)
        self.assertIn(b"agent-board", corpo)
        self.assertIn("script-src 'self' 'unsafe-inline'", r.getheader("Content-Security-Policy"))  # v1 tem script embutido

    def test_spa_sem_script_inline(self):
        self.web()
        for caminho in ("/", "/assets/app.js", "/api/projetos"):
            csp = self.get(caminho)[0].getheader("Content-Security-Policy")
            self.assertIn("script-src 'self';", csp, caminho)
            self.assertIn("frame-ancestors 'none'", csp, caminho)

    # --- SSE
    def stream(self, projeto="alpha", srv_porta=None):
        c = http.client.HTTPConnection("127.0.0.1", srv_porta or self.porta, timeout=5)
        c.request("GET", f"/api/stream?projeto={projeto}", headers={"Host": f"127.0.0.1:{srv_porta or self.porta}"})
        self.conexoes.append(c)
        return c, c.getresponse()

    @staticmethod
    def evento(r):
        """Lê um evento SSE: (nome, dados)."""
        nome = dados = None
        while True:
            linha = r.fp.readline().decode().rstrip("\n")
            if linha == "":
                if nome:
                    return nome, json.loads(dados)
                continue
            campo, _, valor = linha.partition(": ")
            if campo == "event":
                nome = valor
            elif campo == "data":
                dados = valor

    def ate(self, r, nome):
        while True:
            e, d = self.evento(r)
            if e == nome:
                return d

    def test_stream_ola_e_mensagem(self):
        _, r = self.stream()
        self.assertEqual(r.status, 200)
        self.assertEqual(r.getheader("Content-Type"), "text/event-stream")
        self.assertEqual(r.getheader("Cache-Control"), "no-store")
        ola = self.evento(r)
        self.assertEqual(ola[0], "ola")
        self.assertEqual(ola[1]["projeto"], "alpha")
        self.gravar(m("novo1", antes(0), M, R, "pedido", assunto="ao vivo"))
        msg = self.ate(r, "mensagem")
        self.assertEqual((msg["id"], msg["assunto"]), ("novo1", "ao vivo"))
        self.assertNotIn("prev", msg)
        self.assertEqual(self.ate(r, "tarefa")["id"], "novo1")
        self.assertEqual(self.ate(r, "agente")["agente"], R)
        self.assertIn("agora", self.ate(r, "ping"))

    def test_stream_agente_quando_o_terminal_muda(self):
        _, r = self.stream()
        self.evento(r)
        self.terminais["term_m"] = dict(self.terminais["term_m"], title="⠹ alpha-master")
        a = self.ate(r, "agente")
        self.assertEqual((a["agente"], a["status"]), (M, "trabalhando"))

    def test_limite_de_conexoes_e_liberacao_do_slot(self):
        srv = self.subir(limite_sse=2)
        porta = srv.server_address[1]
        abertas = [self.stream(srv_porta=porta) for _ in range(2)]
        for _, r in abertas:
            self.assertEqual(r.status, 200)
            self.evento(r)
        c3, r3 = self.stream(srv_porta=porta)
        self.assertEqual(r3.status, 503)
        r3.read()
        abertas[0][1].close()
        abertas[0][0].close()  # o cliente vai embora: a vaga volta
        fim = datetime.datetime.now() + datetime.timedelta(seconds=5)
        status = 503
        while status == 503 and datetime.datetime.now() < fim:
            c4, r4 = self.stream(srv_porta=porta)
            status = r4.status
            if status == 503:
                r4.read()
                c4.close()
        self.assertEqual(status, 200)


# ---------------------------------------------------------------------------
# Segurança (issue #12): log, terminal e rede são entrada não confiável
# ---------------------------------------------------------------------------
ENDPOINTS = ("estado", "resumo", "agentes", "tarefas", "conversas", "mensagens", "analytics", "workflows", "subagentes",
             "conversas/p1", "conversas/torto")
LINHAS_TORTAS = ['"id"', "[1, 2]", "42", "null", "{", '{"id": 5, "ts": "x"}', '{"id": ["a"], "tipo": "pedido"}',
                 '{"id": "t1", "tipo": "pedido"}',
                 '{"id": "t2", "ts": "2026-10-20T10:00:00", "tipo": "pedido", "de": "alpha-master", "para": "alpha-manager01-cc",'
                 ' "assunto": null, "prazo": "0001-01-01T00:00:00", "issues": "abc", "responde_a": {"x": 1}}',
                 '{"id": "t3", "ts": 12345, "tipo": ["pedido"], "de": {"a": 1}, "para": ["x"], "veredito": ["x"]}',
                 '{"id": "t4", "ts": "9999-12-31T23:59:59+14:00", "tipo": "pedido", "de": "a", "para": "b", "issues": [null, 1.5, true, 7]}',
                 '{"id": "t5", "ts": "2026-10-20T10:00:00Z", "tipo": "entrega", "de": "alpha-manager01-cc", "para": null, "x": NaN, "y": Infinity}',
                 "[" * 5000]


class Seguranca(Cenario):
    """Regressão da auditoria de segurança do painel (docs: ADR 0005). O painel é só leitura em 127.0.0.1."""

    def setUp(self):
        super().setUp()
        self.srv = self.subir()
        self.porta = self.srv.server_address[1]

    def subir(self, **kw):
        srv = cmd_web.servidor(self.raiz, 0, terminais=lambda: self.terminais, intervalos={"log": 0.05, "orca": 0.1, "ping": 0.4}, **kw)
        threading.Thread(target=srv.serve_forever, args=(0.02,), daemon=True).start()
        self.addCleanup(lambda: (srv.shutdown(), srv.server_close()))
        return srv

    def get(self, caminho, host=None, cab=None, porta=None):
        porta = porta or self.porta
        c = http.client.HTTPConnection("127.0.0.1", porta, timeout=5)
        c.request("GET", caminho, headers=dict({"Host": host or f"127.0.0.1:{porta}"}, **(cab or {})))
        r = c.getresponse()
        corpo = r.read()
        c.close()
        return r, corpo

    def gravar_cru(self, *linhas):
        with open(os.path.join(self.raiz, "docs/agent-board/comunicacoes.jsonl"), "a") as f:
            for l in linhas:
                f.write(l + "\n")

    # --- linha torta no log não derruba a API, nem o SSE, nem escreve em avisos.log
    def test_linhas_tortas_nao_derrubam_nenhum_endpoint(self):
        self.gravar_cru(*LINHAS_TORTAS)
        for ep in ENDPOINTS:
            for q in ("", "?periodo=7d", "?periodo=24h"):
                r, corpo = self.get(f"/api/{ep}{q}")
                self.assertIn(r.status, (200, 404), (ep, q, corpo[:200]))
                if r.status == 200:  # JSON estrito: NaN/Infinity quebram o JSON.parse do navegador
                    json.loads(corpo, parse_constant=lambda c: self.fail(f"{c} em {ep}"))

    def test_ler_o_log_nao_escreve_avisos(self):
        avisos = os.path.join(HOME_TESTE, "avisos.log")
        antes_ = os.path.getsize(avisos) if os.path.exists(avisos) else 0
        self.gravar_cru("{", "lixo")
        for _ in range(3):
            self.get("/api/estado")
            self.get("/api/analytics")
        self.assertEqual(os.path.getsize(avisos) if os.path.exists(avisos) else 0, antes_)

    def test_vigia_sobrevive_a_linha_torta(self):
        v = painel_stream.Vigia(self.raiz, "alpha", carregar, lambda: self.terminais, {"log": 0, "orca": 0, "ping": 99})
        self.gravar_cru(*LINHAS_TORTAS)
        self.gravar(m("ok1", antes(1), M, G, "pedido"))
        evs = v.passo()
        self.assertEqual([e[1]["id"] for e in evs if e[0] == "mensagem"], ["t1", "t2", "t3", "t4", "t5", "ok1"])

    def test_ts_sem_fuso_e_datas_absurdas_nao_estouram(self):
        self.gravar_cru('{"id": "n1", "ts": "2026-10-20T10:00:00", "tipo": "pedido", "de": "alpha-master", "para": "alpha-manager01-cc"}')
        self.assertEqual(self.get("/api/mensagens?antes=2026-01-01T00:00:00")[0].status, 200)
        self.assertEqual(self.get("/api/mensagens?antes=0001-01-01T00:00:00")[0].status, 200)
        self.assertEqual(self.get("/api/mensagens?antes=9999-12-31T23:59:59%2B14:00")[0].status, 200)

    def test_texto_do_log_e_limitado_e_so_texto(self):
        self.gravar(m("gigante", antes(1), M, G, "pedido", assunto="A" * 1_000_000, branch="B" * 1_000_000, issues=list(range(500))),
                    m("aninhado", antes(1), M, G, "pedido", extra={"a": [1]}, lista=[1]))
        r, corpo = self.get("/api/mensagens?limite=1000")
        self.assertLess(len(corpo), 200_000)
        ms = {x["id"]: x for x in json.loads(corpo)["mensagens"]}
        self.assertLessEqual(len(ms["gigante"]["assunto"]), 2000)
        self.assertLessEqual(len(ms["gigante"]["issues"]), 50)
        self.assertNotIn("extra", ms["aninhado"])
        self.assertLess(len(self.get("/api/estado")[1]), 400_000)

    def test_de_para_assunto_sempre_texto(self):
        self.gravar_cru('{"id": "sem-campos", "ts": "%s", "tipo": "pedido"}' % antes(1))
        ms = {x["id"]: x for x in json.loads(self.get("/api/mensagens")[1])["mensagens"]}
        self.assertEqual((ms["sem-campos"]["de"], ms["sem-campos"]["para"], ms["sem-campos"]["assunto"]), ("", "", ""))

    # --- parâmetros
    def test_parametros_invalidos_ou_enormes(self):
        for q in ("limite=-1", "limite=0", "limite=1000000000", "limite=abc", "limite=1e9", "limite=" + "9" * 400, "antes=lixo",
                  "periodo=%00", "agente[]=x", "q=" + "a" * 5000, "estado=%00", "tipo=" + "x" * 5000):
            for ep in ("mensagens", "conversas", "estado", "workflows"):
                r, corpo = self.get(f"/api/{ep}?{q}")
                self.assertEqual(r.status, 200, (ep, q))
        self.assertLessEqual(len(json.loads(self.get("/api/mensagens?limite=1000000")[1])["mensagens"]), 1000)
        self.assertEqual(len(json.loads(self.get("/api/mensagens?limite=-5")[1])["mensagens"]), 1)

    def test_projeto_malicioso_e_id_malicioso(self):
        for p in ("../../etc", "..", "a/b", "%2e%2e%2f", "alpha%00", "x" * 400, "<script>", "beta/../alpha", self.raiz_beta + "/../alpha",
                  "/etc"):
            r, corpo = self.get(f"/api/agentes?projeto={urllib_quote(p)}")
            self.assertEqual((r.status, json.loads(corpo)), (404, {"erro": "projeto desconhecido"}), p)
        for cid in ("..%2f..%2fetc", "%00", "../x", "p1/../p1", "x" * 300, "%3Cscript%3E", ""):
            self.assertEqual(self.get(f"/api/conversas/{cid}")[0].status, 404, cid)

    # --- caminhos
    def test_path_traversal_e_codificacoes(self):
        for c in ("/../../etc/passwd", "/%2e%2e/%2e%2e/etc/passwd", "/assets/../index.html", "/assets/%2e%2e/index.html",
                  "/assets/%252e%252e/x", "/assets/..%5cindex.html", "/assets/..%2findex.html", "/assets//etc/passwd",
                  "/assets/%00", "/assets/", "/sub/favicon.svg", "/x.py", "/cmd_web.py", "/painel_web.html",
                  "/api/stream/../estado", "/api/%2e%2e/%2e%2e/etc/passwd", "/%5c..%5c..%5cetc%5cpasswd"):
            r, corpo = self.get(c)
            self.assertIn(r.status, (404, 400), c)
            self.assertNotIn(b"root:", corpo, c)

    def test_link_simbolico_nao_sai_do_build(self):
        build = os.path.join(self.tmp, "build")
        os.makedirs(os.path.join(build, "assets"))
        segredo = os.path.join(self.tmp, "segredo.txt")
        with open(segredo, "w") as f:
            f.write("SEGREDO")
        with open(os.path.join(build, "assets", "ok.js"), "w") as f:
            f.write("1")
        os.symlink(segredo, os.path.join(build, "assets", "link.js"))
        os.symlink(segredo, os.path.join(build, "link.svg"))
        antigo, cmd_web.DIR_WEB = cmd_web.DIR_WEB, build
        self.addCleanup(setattr, cmd_web, "DIR_WEB", antigo)
        self.assertEqual(self.get("/assets/ok.js")[1], b"1")
        for c in ("/assets/link.js", "/link.svg"):
            r, corpo = self.get(c)
            self.assertEqual(r.status, 404, c)
            self.assertNotIn(b"SEGREDO", corpo)

    def test_metodos_e_requisicao_sem_host(self):
        for metodo in ("POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"):
            self.assertEqual(self.pedir_cru(f"{metodo} /api/estado HTTP/1.0\r\nHost: 127.0.0.1:{self.porta}\r\n\r\n")[0], 405, metodo)
        self.assertEqual(self.pedir_cru("GET /api/estado HTTP/1.0\r\n\r\n")[0], 403)  # sem Host
        self.assertEqual(self.pedir_cru("GET /api/estado HTTP/1.0\r\nHost:\r\n\r\n")[0], 403)

    def pedir_cru(self, texto):
        import socket
        s = socket.create_connection(("127.0.0.1", self.porta), timeout=5)
        s.sendall(texto.encode())
        dado = b""
        while True:
            parte = s.recv(65536)
            if not parte:
                break
            dado += parte
        s.close()
        return int(dado.split(b" ", 2)[1]), dado

    # --- DNS rebinding, CORS, CSRF/SSE de outra origem, cabeçalhos
    def test_host_e_origem(self):
        for h in ("evil.example", "evil.example:80", "127.0.0.1", f"127.0.0.1:{self.porta}.evil.com", f"evil.com:{self.porta}",
                  f"127.0.0.1:{self.porta},evil.com", f"[::1]:{self.porta}", f"0.0.0.0:{self.porta}"):
            self.assertEqual(self.get("/api/estado", host=h)[0].status, 403, h)
        for cab in ({"Origin": "http://evil.example"}, {"Origin": "null"}, {"Origin": f"http://127.0.0.1:{self.porta + 1}"},
                    {"Origin": f"http://localhost:{self.porta + 1}"}, {"Sec-Fetch-Site": "cross-site"},
                    {"Sec-Fetch-Site": "same-site", "Sec-Fetch-Mode": "cors"}):
            for caminho in ("/api/estado", "/api/stream"):
                self.assertEqual(self.get(caminho, cab=cab)[0].status, 403, (caminho, cab))
        self.assertEqual(self.get("/api/estado", cab={"Origin": f"http://127.0.0.1:{self.porta}", "Sec-Fetch-Site": "same-origin"})[0].status, 200)
        # navegar direto (digitar a URL, clicar num link de outro site) continua abrindo a página
        self.assertEqual(self.get("/", cab={"Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "navigate"})[0].status, 200)

    def test_cabecalhos_em_todas_as_respostas(self):
        for c in ("/", "/api/estado", "/api/projetos", "/nada.js", "/api/x", "/assets/nada.js"):
            r, _ = self.get(c, cab={"Origin": f"http://127.0.0.1:{self.porta}"})
            csp = r.getheader("Content-Security-Policy") or ""
            for parte in ("default-src 'self'", "script-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'none'",
                          "form-action 'none'"):
                self.assertIn(parte, csp, (c, parte))
            if c == "/":
                self.assertNotIn("unsafe-inline", csp.split("style-src")[0])  # script sem 'unsafe-inline'
                self.assertNotRegex(csp, r"script-src[^;]*unsafe")
            self.assertEqual(r.getheader("X-Content-Type-Options"), "nosniff", c)
            self.assertEqual(r.getheader("Referrer-Policy"), "no-referrer", c)
            self.assertEqual(r.getheader("X-Frame-Options"), "DENY", c)
            self.assertEqual(r.getheader("Cross-Origin-Resource-Policy"), "same-origin", c)
            self.assertEqual(r.getheader("Cache-Control"), "no-store", c)
            self.assertIsNone(r.getheader("Access-Control-Allow-Origin"), c)  # sem CORS

    # --- DoS
    def test_slowloris_e_leitor_parado_perdem_a_conexao(self):
        import socket
        import time
        antigo, cmd_web.TIMEOUT_SOCKET = cmd_web.TIMEOUT_SOCKET, 0.4
        self.addCleanup(setattr, cmd_web, "TIMEOUT_SOCKET", antigo)
        srv = self.subir()
        s = socket.create_connection(("127.0.0.1", srv.server_address[1]), timeout=5)
        s.sendall(b"GET /api/estado HTTP/1.1\r\nHost: 127.0.0.1:1\r\nX-Lento: ")  # cabeçalho nunca termina
        t0 = time.time()
        self.assertEqual(s.recv(100), b"")  # o servidor fechou
        self.assertLess(time.time() - t0, 4)
        s.close()

    def test_teto_de_conexoes_simultaneas(self):
        import socket
        antigo, cmd_web.ServidorLimitado.limite_conexoes = cmd_web.ServidorLimitado.limite_conexoes, 3
        self.addCleanup(setattr, cmd_web.ServidorLimitado, "limite_conexoes", antigo)
        srv = self.subir()
        porta = srv.server_address[1]
        ociosas = [socket.create_connection(("127.0.0.1", porta), timeout=5) for _ in range(3)]
        try:
            fim = datetime.datetime.now() + datetime.timedelta(seconds=3)
            status = 200
            while status != 503 and datetime.datetime.now() < fim:  # as ociosas ainda podem não ter chegado ao accept
                status = self.get("/api/projetos", porta=porta)[0].status
            self.assertEqual(status, 503)
        finally:
            for s in ociosas:
                s.close()
        fim = datetime.datetime.now() + datetime.timedelta(seconds=5)  # fechou: as vagas voltam
        while status != 200 and datetime.datetime.now() < fim:
            status = self.get("/api/projetos", porta=porta)[0].status
        self.assertEqual(status, 200)

    def test_erro_inesperado_vira_500_com_resposta(self):
        original = painel_dados.agentes
        painel_dados.agentes = lambda *a, **k: 1 / 0
        self.addCleanup(setattr, painel_dados, "agentes", original)
        r, corpo = self.get("/api/agentes")
        self.assertEqual((r.status, json.loads(corpo)), (500, {"erro": "erro interno"}))
        self.assertEqual(self.get("/api/projetos")[0].status, 200)  # o servidor segue de pé

    # --- XSS: o servidor devolve o texto do log como dado (JSON), nunca como HTML
    def test_payloads_voltam_como_json_inertes(self):
        xs = ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', "javascript:alert(1)", '<svg onload=alert(1)>',
              "\u202eevil\u202c", '"><script>', "{{7*7}}"]
        for i, x in enumerate(xs):
            self.gravar(m(f"x{i}", antes(1), M, G, "pedido", assunto=x, branch=x, prazo=x, modo=x, veredito=x, tema=x))
        for ep in ("mensagens", "estado", "tarefas", "conversas/x0"):
            r, corpo = self.get(f"/api/{ep}")
            self.assertEqual(r.getheader("Content-Type"), "application/json; charset=utf-8")
            self.assertEqual(r.getheader("X-Content-Type-Options"), "nosniff")
        self.assertIn("<script>", json.loads(self.get("/api/mensagens")[1])["mensagens"][0]["assunto"])

    # --- vazamento pela tela do terminal
    def test_tela_mascara_segredos(self):
        saida = painel_dados.tela_de("\n".join([
            "export OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwx", 'curl -H "Authorization: Bearer abc.def-1234567890" x',
            "ghp_abcdefghijklmnopqrstuvwxyz0123456789", "AKIAIOSFODNN7EXAMPLE", "password=hunter2", "senha: x1y2",
            "token: abc123", "-----BEGIN RSA PRIVATE KEY-----", "MIIEvQIBADANBg", "-----END RSA PRIVATE KEY-----",
            "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcdefghijk", "npm test passou, 3 tokens usados"]))
        for segredo in ("abcdefghijklmnopqrstuvwx", "abc.def-1234567890", "ghp_", "AKIA", "hunter2", "x1y2", "abc123", "MIIEvQ",
                        "eyJhbGci"):
            self.assertNotIn(segredo, saida, segredo)
        self.assertIn("npm test passou", saida)
        t = json.loads(self.get("/api/agentes")[1])
        self.assertTrue(all("sk-" not in (a["tela"] or "") for a in t))

    def test_api_entrega_tela_mascarada(self):
        self.terminais["term_m"]["preview"] = "rodando\nAPI_KEY=sk-abcdefghijklmnopqrstuvwxyz\n"
        m_ = next(a for a in json.loads(self.get("/api/agentes")[1]) if a["agente"] == M)
        self.assertNotIn("sk-abc", m_["tela"])
        self.assertIn("rodando", m_["tela"])


# ---------------------------------------------------------------------------
# Sub-agents (issue #20): leitor, ligação, campos novos, rota e SSE
# ---------------------------------------------------------------------------
def quando(minutos=0):
    return agora_local() - datetime.timedelta(minutes=minutos)


def ev(ev_, minutos, agente=G, **extra):
    base_ = {"ts": quando(minutos).isoformat(timespec="seconds"), "ev": ev_, "agente": agente, "sessao": "s1",
             "id": None, "tipo": None}
    return dict(base_, **extra)


class SubBase(Cenario):
    def setUp(self):
        super().setUp()
        self.pasta_sub = os.path.join(HOME_TESTE, "subagentes", "alpha")
        shutil.rmtree(os.path.join(HOME_TESTE, "subagentes"), ignore_errors=True)
        self.addCleanup(shutil.rmtree, os.path.join(HOME_TESTE, "subagentes"), True)

    def arquivo(self, dia=None):
        dia = dia or agora_local().date()
        return os.path.join(self.pasta_sub, dia.isoformat() + ".jsonl")

    def sub_cru(self, *linhas, dia=None):
        os.makedirs(self.pasta_sub, exist_ok=True)
        with open(self.arquivo(dia), "a") as f:
            for l in linhas:
                f.write((l if isinstance(l, str) else json.dumps(l)) + "\n")

    def sub_gravar(self, *eventos):
        for e in eventos:  # cada evento vai para o arquivo do dia do seu ts, como faz o coletor
            self.sub_cru(e, dia=painel_estado._ts(e["ts"]).date())

    def listar(self, **kw):
        agora = agora_local()
        tars = painel_estado.tarefas(painel_estado.ler_log(self.raiz), agora)
        return painel_subagentes.listar("alpha", agora, tars, **kw)

    def um(self, **kw):
        subs = self.listar(**kw)
        self.assertEqual(len(subs), 1, subs)
        return subs[0]


class LeitorDeSubagentes(SubBase):
    def test_spawn_sem_inicio_nao_vira_subagent(self):
        self.sub_gravar(ev("spawn", 5, tipo="Explore", descricao="x"))
        self.assertEqual(self.listar(), [])

    def test_sem_inicio_nasce_no_primeiro_evento(self):
        # sessão aberta antes dos hooks novos: só chegam atividade e fim (fim com tipo vazio)
        self.sub_gravar(ev("atividade", 5, id="a1", tipo="general-purpose", ferramenta="Bash", resumo="ls"),
                        ev("fim", 4, id="a1", tipo=""),
                        ev("fim", 3, id="a2", tipo=""),
                        ev("atividade", 2, id="a3", tipo="Explore", ferramenta="Edit", resumo="x.py"))
        d = {s["id"]: s for s in self.listar()}
        self.assertEqual((d["a1"]["status"], d["a1"]["tipo"], d["a1"]["n_atividades"]), ("concluido", "general-purpose", 1))
        self.assertEqual((d["a2"]["status"], d["a2"]["tipo"]), ("concluido", None))
        # sem inicio: o começo é desconhecido, então não há duração (era 0 s)
        self.assertEqual((d["a2"]["inicio_aproximado"], d["a2"]["duracao_s"]), (True, None))
        self.assertEqual((d["a3"]["status"], d["a3"]["tipo"]), ("rodando", "Explore"))

    def test_inicio_sem_spawn(self):
        self.sub_gravar(ev("inicio", 5, id="a1", tipo="Explore"))
        s = self.um()
        self.assertEqual((s["id"], s["agente"], s["tipo"], s["descricao"], s["fundo"], s["status"]),
                         ("a1", G, "Explore", None, False, "rodando"))
        self.assertEqual((s["fim"], s["duracao_s"], s["n_atividades"], s["ultima_atividade"], s["tarefa"]),
                         (None, None, 0, None, None))

    def test_spawn_alimenta_descricao_e_fundo(self):
        self.sub_gravar(ev("spawn", 5, tipo="Explore", descricao="mapear o painel", fundo=True),
                        ev("inicio", 4.9, id="a1", tipo="Explore"))
        s = self.um()
        self.assertEqual((s["descricao"], s["fundo"]), ("mapear o painel", True))

    def test_dois_spawns_do_mesmo_tipo_consumidos_na_ordem(self):
        self.sub_gravar(ev("spawn", 10, tipo="Explore", descricao="A"), ev("spawn", 9.9, tipo="Explore", descricao="B"),
                        ev("inicio", 9.8, id="a1", tipo="Explore"), ev("inicio", 9.7, id="a2", tipo="Explore"))
        d = {s["id"]: s["descricao"] for s in self.listar()}
        self.assertEqual(d, {"a1": "A", "a2": "B"})

    def test_spawn_do_mesmo_tipo_tem_preferencia_e_sem_tipo_igual_vale_qualquer_um(self):
        self.sub_gravar(ev("spawn", 10, tipo="Explore", descricao="E"), ev("spawn", 9.9, tipo="general-purpose", descricao="G"),
                        ev("inicio", 9.8, id="a1", tipo="general-purpose"), ev("inicio", 9.7, id="a2", tipo="Plan"))
        d = {s["id"]: s["descricao"] for s in self.listar()}
        self.assertEqual(d, {"a1": "G", "a2": "E"})

    def test_spawn_com_mais_de_60s_nao_e_consumido(self):
        self.sub_gravar(ev("spawn", 10, tipo="Explore", descricao="velho"), ev("inicio", 8.5, id="a1", tipo="Explore"))
        self.assertIsNone(self.um()["descricao"])

    def test_spawns_de_pais_diferentes_nao_se_misturam(self):
        self.sub_gravar(ev("spawn", 5, agente=R, tipo="Explore", descricao="do R"), ev("inicio", 4.9, id="a1", tipo="Explore"))
        self.assertIsNone(self.um()["descricao"])

    def test_fim_define_duracao_e_atividade_atualiza(self):
        self.sub_gravar(ev("inicio", 10, id="a1", tipo="Explore"),
                        ev("atividade", 8, id="a1", ferramenta="Bash", resumo="ls"),
                        ev("atividade", 6, id="a1", ferramenta="Edit", resumo="/x/y.py"),
                        ev("fim", 5, id="a1", tipo="Explore"))
        s = self.um()
        self.assertEqual((s["status"], s["duracao_s"], s["n_atividades"]), ("concluido", 300.0, 2))
        self.assertEqual(s["ultima_atividade"]["ferramenta"], "Edit")
        self.assertEqual(s["ultima_atividade"]["resumo"], "/x/y.py")
        self.assertEqual(s["fim"], ev("fim", 5)["ts"])

    def test_retorno_com_erro_e_ordem(self):
        self.sub_gravar(ev("inicio", 10, id="a1", tipo="Explore"), ev("inicio", 9, id="a2", tipo="Explore"),
                        ev("inicio", 8, id="b1", tipo="Plan"),
                        ev("fim", 7, id="a1"), ev("fim", 6, id="a2"), ev("fim", 5, id="b1"),
                        ev("retorno", 4, tipo="Explore", ok=False), ev("retorno", 3, tipo="Explore", ok=True),
                        ev("retorno", 2, tipo="Plan"))
        st = {s["id"]: s["status"] for s in self.listar()}
        self.assertEqual(st, {"a1": "erro", "a2": "concluido", "b1": "concluido"})

    def test_erro_vale_mesmo_sem_fim(self):
        self.sub_gravar(ev("inicio", 10, id="a1", tipo="Explore"), ev("retorno", 9, tipo="Explore", ok=False))
        self.assertEqual(self.um()["status"], "erro")

    def test_perdido_e_rodando(self):
        self.sub_gravar(ev("inicio", 200, id="velho", tipo="Explore"),
                        ev("inicio", 300, id="ativo", tipo="Explore"), ev("atividade", 30, id="ativo", ferramenta="Bash", resumo="x"),
                        ev("inicio", 130, id="quase", tipo="Explore"), ev("fim", 100, id="quase"),
                        ev("inicio", 119, id="limite", tipo="Explore"))
        st = {s["id"]: s["status"] for s in self.listar()}
        self.assertEqual(st, {"velho": "perdido", "ativo": "rodando", "quase": "concluido", "limite": "rodando"})

    def test_tarefa_e_a_aberta_mais_recente_do_pai_no_inicio(self):
        # cenario: p2 (R, 20 min atrás, aberta); p1 (G, 60 min atrás, entrega e1 aprovada em r1, 30 min atrás)
        self.sub_gravar(ev("inicio", 5, agente=R, id="r1", tipo="Explore"),
                        ev("inicio", 30, agente=R, id="r0", tipo="Explore"),
                        ev("inicio", 55, id="g1", tipo="Explore"), ev("inicio", 2, id="g2", tipo="Explore"))
        t = {s["id"]: s["tarefa"] for s in self.listar()}
        self.assertEqual(t["r1"], {"id": "p2", "assunto": "p2"})
        self.assertIsNone(t["r0"])  # p2 só chegou depois
        self.assertEqual(t["g1"], {"id": "p1", "assunto": "p1"})
        self.assertIsNone(t["g2"])  # p1 já estava fechada quando g2 nasceu

    def test_ordem_mais_recente_primeiro(self):
        self.sub_gravar(ev("inicio", 30, id="a1"), ev("inicio", 10, id="a2"), ev("inicio", 20, id="a3"))
        self.assertEqual([s["id"] for s in self.listar()], ["a2", "a3", "a1"])

    def test_leitura_incremental_so_le_o_que_cresceu(self):
        self.sub_gravar(ev("inicio", 10, id="a1", tipo="Explore"))
        self.assertEqual(len(self.listar()), 1)
        self.sub_gravar(ev("atividade", 9, id="a1", ferramenta="Bash", resumo="ls"), ev("inicio", 8, id="a2"))
        with mock.patch.object(painel_subagentes, "sanear", wraps=painel_subagentes.sanear) as lido:
            subs = self.listar()
            self.assertEqual(lido.call_count, 2)  # só as 2 linhas novas
            self.listar()
            self.assertEqual(lido.call_count, 2)  # nada novo: nem abre o parser
        self.assertEqual({s["id"]: s["n_atividades"] for s in subs}, {"a1": 1, "a2": 0})

    def test_linha_incompleta_espera_o_fim(self):
        self.sub_gravar(ev("inicio", 10, id="a1"))
        linha = json.dumps(ev("inicio", 9, id="a2"))
        with open(self.arquivo(), "a") as f:
            f.write(linha[:30])
        self.assertEqual(len(self.listar()), 1)
        with open(self.arquivo(), "a") as f:
            f.write(linha[30:] + "\n")
        self.assertEqual(len(self.listar()), 2)

    def test_arquivo_trocado_e_relido(self):
        self.sub_gravar(ev("inicio", 10, id="a1"), ev("inicio", 9, id="a2"), ev("inicio", 8, id="a3"))
        self.assertEqual(len(self.listar()), 3)
        os.remove(self.arquivo())
        self.sub_gravar(ev("inicio", 7, id="b1"))
        self.assertEqual([s["id"] for s in self.listar()], ["b1"])
        # reescrito com mais bytes que antes: o começo diferente denuncia
        os.remove(self.arquivo())
        self.sub_gravar(*[ev("inicio", 7 - i / 10, id=f"c{i}") for i in range(6)])
        self.assertEqual(len(self.listar()), 6)

    def test_virada_do_dia_liga_eventos_de_arquivos_diferentes(self):
        ontem = (agora_local() - datetime.timedelta(days=1)).replace(hour=23, minute=58, second=0, microsecond=0)
        hoje = ontem + datetime.timedelta(minutes=5)
        fmt = lambda t: t.isoformat(timespec="seconds")  # noqa: E731
        self.sub_gravar({"ts": fmt(ontem - datetime.timedelta(seconds=5)), "ev": "spawn", "agente": G, "tipo": "Explore",
                         "descricao": "atravessa a meia-noite"},
                        {"ts": fmt(ontem), "ev": "inicio", "agente": G, "id": "a1", "tipo": "Explore"},
                        {"ts": fmt(hoje), "ev": "atividade", "agente": G, "id": "a1", "ferramenta": "Bash", "resumo": "ls"},
                        {"ts": fmt(hoje + datetime.timedelta(minutes=1)), "ev": "fim", "agente": G, "id": "a1"})
        self.assertEqual(len(os.listdir(self.pasta_sub)), 2)
        s = self.um()
        self.assertEqual((s["descricao"], s["status"], s["n_atividades"], s["duracao_s"]),
                         ("atravessa a meia-noite", "concluido", 1, 360.0))

    def test_linhas_tortas_sao_ignoradas_e_nada_e_escrito(self):
        avisos = os.path.join(HOME_TESTE, "avisos.log")
        antes_ = os.path.getsize(avisos) if os.path.exists(avisos) else 0
        self.sub_cru("{", "lixo", "[1,2]", "42", "null", '"ev"', '{"ev": "inicio"}', '{"ev": "xpto", "ts": "2026-10-12T10:00:00Z"}',
                     '{"ev": "inicio", "ts": "ontem", "agente": "a", "id": "x"}',
                     '{"ev": "inicio", "ts": "0001-01-01T00:00:00", "agente": "a", "id": "x"}',
                     '{"ev": "inicio", "ts": 5, "agente": "a", "id": "x"}', "x" * 20000, "[" * 5000,
                     json.dumps(ev("inicio", 3, id=["lista"], tipo={"x": 1})),
                     json.dumps(ev("inicio", 2, id="ok1", tipo=5, descricao=7, ferramenta=[], ok="sim", fundo="sim")))
        s = self.um()
        self.assertEqual((s["id"], s["tipo"], s["descricao"], s["fundo"]), ("ok1", None, None, False))
        self.assertEqual(os.path.getsize(avisos) if os.path.exists(avisos) else 0, antes_)

    def test_textos_limitados(self):
        self.sub_gravar(ev("spawn", 5, tipo="T" * 500, descricao="D" * 5000), ev("inicio", 4.9, id="a1", tipo="T" * 500),
                        ev("atividade", 4, id="a1", ferramenta="F" * 500, resumo="R" * 5000))
        s = self.um()
        self.assertLessEqual(len(s["tipo"]), 100)
        self.assertLessEqual(len(s["descricao"]), 300)
        self.assertLessEqual(len(s["ultima_atividade"]["resumo"]), 300)
        self.assertLessEqual(len(s["ultima_atividade"]["ferramenta"]), 60)

    def test_projeto_sem_diretorio_ou_com_nome_malicioso(self):
        self.assertEqual(self.listar(), [])
        for nome in ("..", ".", "a/b", "..\\x", "", None, "a\0b", "../../etc"):
            self.assertEqual(painel_subagentes.listar(nome), [], nome)
        self.assertEqual(painel_subagentes.assinatura("zzz", agora_local()),
                         tuple((n, 0, 0) for n, _, _ in painel_subagentes.assinatura("zzz", agora_local())))

    def test_mascara_na_saida(self):
        self.sub_gravar(ev("spawn", 5, tipo="Explore", descricao="usar token=abc123segredo na API"),
                        ev("inicio", 4.9, id="a1", tipo="Explore"),
                        ev("atividade", 4, id="a1", ferramenta="Bash",
                           resumo="curl -H 'Authorization: Bearer abc.def-1234567890' x; OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwx"))
        saida = json.dumps(self.um())
        for segredo in ("abc123segredo", "abc.def-1234567890", "sk-abcdefghijkl"):
            self.assertNotIn(segredo, saida)
        self.assertIn("[oculto]", saida)

    def test_arquivos_fora_da_janela_ou_com_nome_estranho_nao_entram(self):
        antigo = agora_local().date() - datetime.timedelta(days=40)
        self.sub_cru(ev("inicio", 5, id="velho"), dia=antigo)
        os.makedirs(self.pasta_sub, exist_ok=True)
        for nome in ("lixo.jsonl", "2026-10-12.jsonl.bak", "x2026-10-12.jsonl"):
            with open(os.path.join(self.pasta_sub, nome), "w") as f:
                f.write(json.dumps(ev("inicio", 5, id="estranho")) + "\n")
        self.assertEqual(self.listar(), [])


class CamposDeSubagentes(SubBase):
    """Agente, Tarefa, Indicadores, Analytics e Workflows com sub-agents (funções puras)."""

    def setUp(self):
        super().setUp()
        self.sub_gravar(
            ev("spawn", 100, tipo="Explore", descricao="mapear"), ev("inicio", 99.9, id="e1", tipo="Explore"),
            ev("fim", 90, id="e1"), ev("retorno", 89, tipo="Explore", ok=True),
            ev("inicio", 50, id="e2", tipo="Explore"), ev("retorno", 49, tipo="Explore", ok=False),
            ev("inicio", 10, id="p1", tipo="Plan"), ev("atividade", 9, id="p1", ferramenta="Bash", resumo="ls"),
            ev("inicio", 8, agente=R, id="r1", tipo="Explore"), ev("fim", 7, agente=R, id="r1"))

    def test_agente_subagentes_e_stats(self):
        subs = self.listar()
        ags = {a["agente"]: a for a in painel_dados.agentes("alpha", carregar(), registro.ler_log(self.raiz), self.terminais,
                                                           agora_local(), None, subs)}
        self.assertEqual([s["id"] for s in ags[G]["subagentes"]], ["p1", "e2", "e1"])
        self.assertEqual(ags[G]["stats"]["subagentes_7d"], 3)
        self.assertEqual([s["id"] for s in ags[R]["subagentes"]], ["r1"])
        self.assertEqual(ags[M]["subagentes"], [])
        self.assertEqual(ags[M]["stats"]["subagentes_7d"], 0)

    def test_agente_sem_coleta(self):
        for a in painel_dados.agentes("alpha", carregar(), registro.ler_log(self.raiz), self.terminais, agora_local()):
            self.assertEqual((a["subagentes"], a["stats"]["subagentes_7d"]), ([], 0))

    def test_agente_todos_rodando_mais_5_terminados_das_ultimas_24h(self):
        shutil.rmtree(self.pasta_sub)
        eventos = [ev("inicio", 30 + i, id=f"run{i}") for i in range(3)]
        for i in range(8):
            eventos += [ev("inicio", 200 + i * 10, id=f"fim{i}"), ev("fim", 190 + i * 10, id=f"fim{i}")]
        eventos += [ev("inicio", 60 * 30, id="antigo"), ev("fim", 60 * 30 - 1, id="antigo")]  # 30 h atrás
        self.sub_gravar(*eventos)
        a = next(a for a in painel_dados.agentes("alpha", carregar(), [], self.terminais, agora_local(), None, self.listar())
                 if a["agente"] == G)
        ids = [s["id"] for s in a["subagentes"]]
        self.assertEqual(sorted(i for i in ids if i.startswith("run")), ["run0", "run1", "run2"])
        self.assertEqual(sorted(i for i in ids if i.startswith("fim")), [f"fim{i}" for i in range(5)])
        self.assertNotIn("antigo", ids)
        self.assertEqual(a["stats"]["subagentes_7d"], 3 + 8 + 1)

    def test_tarefa_tem_os_subagentes_ligados(self):
        self.sub_gravar(ev("inicio", 5, agente=R, id="r9", tipo="Explore", ))
        subs = self.listar()
        tars = painel_subagentes.anexar_tarefas(painel_estado.tarefas(registro.ler_log(self.raiz), agora_local()), subs)
        p2 = next(t for t in tars if t["id"] == "p2")
        self.assertEqual(p2["subagentes"], [{"id": "r9", "tipo": "Explore", "descricao": None, "status": "rodando"},
                                            {"id": "r1", "tipo": "Explore", "descricao": None, "status": "concluido"}])
        self.assertTrue(all("subagentes" in t for t in tars))

    def test_analytics(self):
        a = painel_dados.analytics_subagentes(self.listar(), agora_local())
        self.assertEqual(a["por_agente"][0], {"agente": G, "n": 3, "rodando": 1, "erro": 1,
                                              "duracao_media_s": 594.0})
        self.assertEqual(a["por_agente"][1]["agente"], R)
        self.assertEqual({t["tipo"]: t["n"] for t in a["por_tipo"]}, {"Explore": 3, "Plan": 1})
        self.assertEqual(len(a["por_dia_30"]), 30)
        self.assertEqual([d["dia"] for d in a["por_dia_30"]], sorted(d["dia"] for d in a["por_dia_30"]))
        self.assertEqual(a["por_dia_30"][-1]["dia"], agora_local().date().isoformat())
        self.assertEqual(sum(d["n"] for d in a["por_dia_30"]), 4)
        vazio = painel_dados.analytics_subagentes([], agora_local())
        self.assertEqual((vazio["por_agente"], vazio["por_tipo"], len(vazio["por_dia_30"])), ([], [], 30))

    def test_workflows(self):
        msgs = registro.ler_log(self.raiz)
        agora = agora_local()
        tars = painel_estado.tarefas(msgs, agora)
        w = painel_dados.workflows(msgs, painel_dados.conversas(msgs, agora, tars), "7d", agora, {}, {t["id"]: t for t in tars},
                                   self.listar())
        nos = {n["id"]: n for n in w["nos"]}
        # agrupado por harness do pai (subagent-cc / subagent-omp), não pelo tipo
        self.assertEqual((nos["sub:subagent-cc"]["coluna"], nos["sub:subagent-cc"]["rotulo"], nos["sub:subagent-cc"]["n"]),
                         ("subagente", "subagent-cc", 4))
        self.assertNotIn("sub:Explore", nos)
        ar = {(a["de"], a["para"]): a["n"] for a in w["arestas"]}
        self.assertEqual((ar[(G, "sub:subagent-cc")], ar[(R, "sub:subagent-cc")]), (3, 1))
        self.assertEqual(w["kpis"]["subagentes"], 4)
        self.assertEqual(nos[G]["coluna"], "manager")
        ordem = [n["coluna"] for n in w["nos"]]
        self.assertLess(ordem.index("manager"), ordem.index("subagente"))
        self.assertLess(ordem.index("subagente"), ordem.index("issue") if "issue" in ordem else 99)

    def test_workflows_periodo_hoje_deixa_de_fora_os_de_ontem_exceto_rodando(self):
        shutil.rmtree(self.pasta_sub)
        ontem = agora_local() - datetime.timedelta(days=1, hours=1)
        self.sub_gravar({"ts": ontem.isoformat(timespec="seconds"), "ev": "inicio", "agente": G, "id": "o1", "tipo": "Explore"},
                        {"ts": ontem.isoformat(timespec="seconds"), "ev": "fim", "agente": G, "id": "o1"})
        w = painel_dados.workflows([], [], "hoje", agora_local(), {}, {}, self.listar())
        self.assertEqual((w["nos"], w["kpis"]["subagentes"]), ([], 0))


class ApiDeSubagentes(SubBase):
    INTERVALOS = {"log": 0.05, "orca": 0.1, "ping": 0.4, "sub": 0.0}

    def setUp(self):
        super().setUp()
        self.conexoes = []
        self.srv = cmd_web.servidor(self.raiz, 0, terminais=lambda: self.terminais, intervalos=self.INTERVALOS)
        self.porta = self.srv.server_address[1]
        threading.Thread(target=self.srv.serve_forever, args=(0.02,), daemon=True).start()
        self.addCleanup(self._parar)

    def _parar(self):
        for c in self.conexoes:
            c.close()
            c.sock = None
        self.srv.shutdown()
        self.srv.server_close()

    def get(self, caminho, host=None, cab=None):
        c = http.client.HTTPConnection("127.0.0.1", self.porta, timeout=5)
        c.request("GET", caminho, headers=dict({"Host": host or f"127.0.0.1:{self.porta}"}, **(cab or {})))
        r = c.getresponse()
        corpo = r.read()
        c.close()
        return r, corpo

    def api(self, caminho):
        r, corpo = self.get(caminho)
        self.assertEqual(r.status, 200, corpo)
        return json.loads(corpo)

    def cenario(self):
        self.sub_gravar(
            ev("inicio", 100, id="e1", tipo="Explore"), ev("fim", 90, id="e1"), ev("retorno", 89, tipo="Explore", ok=True),
            ev("inicio", 50, id="e2", tipo="Explore"), ev("retorno", 49, tipo="Explore", ok=False),
            ev("inicio", 10, id="p1", tipo="Plan"), ev("atividade", 9, id="p1", ferramenta="Bash", resumo="ls"),
            ev("inicio", 8, agente=R, id="r1", tipo="Explore"), ev("fim", 7, agente=R, id="r1"))
        d = agora_local() - datetime.timedelta(days=3)
        self.sub_cru({"ts": d.isoformat(timespec="seconds"), "ev": "inicio", "agente": G, "id": "tres", "tipo": "Plan"}, dia=d.date())

    def test_sem_coleta_tudo_vazio(self):
        self.assertEqual(self.api("/api/subagentes"), [])
        self.assertEqual(self.api("/api/subagentes?projeto=beta"), [])
        self.assertTrue(all(a["subagentes"] == [] and a["stats"]["subagentes_7d"] == 0 for a in self.api("/api/agentes")))
        self.assertTrue(all(t["subagentes"] == [] for t in self.api("/api/tarefas")))
        self.assertEqual(self.api("/api/resumo")["indicadores"]["subagentes_rodando"], 0)
        self.assertEqual(self.api("/api/estado")["indicadores"]["subagentes_rodando"], 0)
        sub = self.api("/api/analytics")["subagentes"]
        self.assertEqual((sub["por_agente"], sub["por_tipo"], len(sub["por_dia_30"])), ([], [], 30))
        self.assertEqual(self.api("/api/workflows")["kpis"]["subagentes"], 0)

    def test_rota_subagentes_filtros_e_limites(self):
        self.cenario()
        todos = self.api("/api/subagentes")
        self.assertEqual([s["id"] for s in todos], ["r1", "p1", "e2", "e1"])  # hoje: o de 3 dias atrás fica fora
        self.assertEqual({k for k in todos[0]}, {"id", "agente", "tipo", "descricao", "status", "fundo", "inicio", "fim", "inicio_aproximado", "nome",
                                                  "duracao_s", "ultima_atividade", "n_atividades", "tarefa"})
        self.assertEqual([s["id"] for s in self.api("/api/subagentes?periodo=7d")][-1], "tres")
        self.assertEqual([s["id"] for s in self.api(f"/api/subagentes?agente={R}")], ["r1"])
        self.assertEqual([s["id"] for s in self.api("/api/subagentes?status=erro")], ["e2"])
        self.assertEqual([s["id"] for s in self.api("/api/subagentes?status=rodando&periodo=7d")], ["p1"])
        self.assertEqual([s["id"] for s in self.api("/api/subagentes?status=perdido&periodo=7d")], ["tres"])
        self.assertEqual(self.api("/api/subagentes?status=xpto"), [])
        self.assertEqual(len(self.api("/api/subagentes?limite=2")), 2)
        self.assertEqual(len(self.api("/api/subagentes?limite=0")), 1)    # mínimo 1
        self.assertEqual(len(self.api("/api/subagentes?limite=-5")), 1)
        self.assertEqual(len(self.api("/api/subagentes?limite=abc&periodo=7d")), 5)  # padrão 200
        self.assertEqual(len(self.api("/api/subagentes?limite=999999&periodo=7d")), 5)  # máximo 1000
        self.assertEqual(len(self.api("/api/subagentes?periodo=xyz")), 4)  # período inválido = hoje

    def test_rodando_entra_mesmo_fora_do_periodo(self):
        d = agora_local() - datetime.timedelta(days=2)
        self.sub_cru({"ts": d.isoformat(timespec="seconds"), "ev": "inicio", "agente": G, "id": "ontem", "tipo": "Plan"},
                     {"ts": (d + datetime.timedelta(minutes=1)).isoformat(timespec="seconds"), "ev": "atividade", "agente": G,
                      "id": "ontem", "ferramenta": "Bash", "resumo": "x"}, dia=d.date())
        # 2 dias sem evento: perdido, não rodando -> fora de "hoje"
        self.assertEqual(self.api("/api/subagentes"), [])
        self.assertEqual([s["status"] for s in self.api("/api/subagentes?periodo=7d")], ["perdido"])

    def test_guardas_de_host_origem_e_projeto(self):
        self.cenario()
        self.assertEqual(self.get("/api/subagentes", host="evil.example:80")[0].status, 403)
        self.assertEqual(self.get("/api/subagentes", cab={"Origin": "http://evil.example"})[0].status, 403)
        self.assertEqual(self.get("/api/subagentes", cab={"Sec-Fetch-Site": "cross-site"})[0].status, 403)
        r, corpo = self.get("/api/subagentes?projeto=zzz")
        self.assertEqual((r.status, json.loads(corpo)), (404, {"erro": "projeto desconhecido"}))
        r, corpo = self.get("/api/subagentes?projeto=..")
        self.assertEqual(r.status, 404)
        c = http.client.HTTPConnection("127.0.0.1", self.porta, timeout=5)
        c.request("POST", "/api/subagentes", headers={"Host": f"127.0.0.1:{self.porta}"})
        self.assertEqual(c.getresponse().status, 405)
        c.close()

    def test_campos_novos_nas_rotas(self):
        self.cenario()
        ags = {a["agente"]: a for a in self.api("/api/agentes")}
        self.assertEqual([s["id"] for s in ags[G]["subagentes"]], ["p1", "e2", "e1"])
        self.assertEqual(ags[G]["stats"]["subagentes_7d"], 4)
        self.assertEqual(self.api("/api/resumo")["indicadores"]["subagentes_rodando"], 1)  # só o p1; e2 (erro), r1 (concluído) e tres (perdido) não contam
        self.assertEqual(self.api("/api/estado")["indicadores"]["subagentes_rodando"], 1)
        p2 = next(t for t in self.api("/api/tarefas") if t["id"] == "p2")
        self.assertEqual([s["id"] for s in p2["subagentes"]], ["r1"])
        self.assertEqual([s["id"] for s in next(t for t in self.api("/api/estado")["tarefas"] if t["id"] == "p2")["subagentes"]], ["r1"])
        an = self.api("/api/analytics")["subagentes"]
        self.assertEqual(an["por_agente"][0]["agente"], G)
        self.assertEqual(an["por_agente"][0]["n"], 4)
        self.assertEqual(an["por_dia_30"][-1]["n"], 4)
        w = self.api("/api/workflows?periodo=7d")
        self.assertEqual(w["kpis"]["subagentes"], 5)
        self.assertIn({"id": "sub:subagent-cc", "coluna": "subagente", "rotulo": "subagent-cc", "n": 5}, w["nos"])

    def test_todos_os_endpoints_com_arquivo_torto(self):
        self.cenario()
        self.sub_cru("{", "lixo", "[1]", '{"ev":"inicio","ts":"x"}', "\x00\x01", "x" * 30000)
        for ep in ("estado", "resumo", "agentes", "tarefas", "analytics", "workflows", "subagentes"):
            r, corpo = self.get(f"/api/{ep}?periodo=7d")
            self.assertEqual(r.status, 200, ep)
            json.loads(corpo, parse_constant=lambda c: self.fail(c))

    def test_mascara_na_api(self):
        self.sub_gravar(ev("spawn", 5, tipo="Explore", descricao="senha=hunter2 aqui"), ev("inicio", 4.9, id="a1", tipo="Explore"),
                        ev("atividade", 4, id="a1", ferramenta="Bash", resumo="export API_KEY=sk-abcdefghijklmnopqrstuvwxyz"))
        for rota in ("/api/subagentes", "/api/agentes"):
            corpo = self.get(rota)[1].decode()
            self.assertNotIn("hunter2", corpo)
            self.assertNotIn("sk-abcdef", corpo)
            self.assertIn("[oculto]", corpo)

    # --- SSE
    def stream(self):
        c = http.client.HTTPConnection("127.0.0.1", self.porta, timeout=5)
        c.request("GET", "/api/stream?projeto=alpha", headers={"Host": f"127.0.0.1:{self.porta}"})
        self.conexoes.append(c)
        return c.getresponse()

    def test_stream_emite_subagente_ao_gravar_no_arquivo(self):
        r = self.stream()
        self.assertEqual(ApiV2.evento(r)[0], "ola")
        self.sub_gravar(ev("inicio", 0, id="ao-vivo", tipo="Explore"))
        while True:
            nome, d = ApiV2.evento(r)
            if nome == "subagente":
                break
        self.assertEqual((d["id"], d["agente"], d["status"]), ("ao-vivo", G, "rodando"))
        self.sub_gravar(ev("fim", 0, id="ao-vivo"))
        while True:
            nome, d = ApiV2.evento(r)
            if nome == "subagente" and d["status"] == "concluido":
                break
        self.assertIsNotNone(d["duracao_s"])


class VigiaDeSubagentes(SubBase):
    def setUp(self):
        super().setUp()
        self.t = [100.0]
        self.vigia = painel_stream.Vigia(self.raiz, "alpha", carregar, lambda: self.terminais,
                                         {"orca": 2.0, "ping": 99.0, "sub": 2.0}, relogio=lambda: self.t[0])

    def passo(self, avanca=0.0):
        self.t[0] += avanca
        return self.vigia.passo()

    def subs(self, evs):
        return [d for e, d in evs if e == "subagente"]

    def test_baseline_nao_vira_evento(self):
        shutil.rmtree(self.pasta_sub, ignore_errors=True)
        self.sub_gravar(ev("inicio", 5, id="velho", tipo="Explore"))
        v = painel_stream.Vigia(self.raiz, "alpha", carregar, lambda: self.terminais, {"sub": 0.0}, relogio=lambda: self.t[0])
        self.assertEqual(v.passo(), [])

    def test_nasce_atividade_e_muda_de_status(self):
        self.sub_gravar(ev("inicio", 0, id="a1", tipo="Explore"))
        evs = self.passo(1)
        self.assertEqual([(d["id"], d["status"], d["n_atividades"]) for d in self.subs(evs)], [("a1", "rodando", 0)])
        ag = [d for e, d in evs if e == "agente" and d["agente"] == G]
        self.assertEqual([s["id"] for s in ag[0]["subagentes"]], ["a1"])  # o agente reflete o sub-agent novo
        self.sub_gravar(ev("atividade", 0, id="a1", ferramenta="Bash", resumo="ls"))
        evs = self.passo(2)
        self.assertEqual([(d["n_atividades"], d["ultima_atividade"]["resumo"]) for d in self.subs(evs)], [(1, "ls")])
        self.sub_gravar(ev("fim", 0, id="a1"))
        evs = self.passo(2)
        self.assertEqual([d["status"] for d in self.subs(evs)], ["concluido"])
        self.assertEqual([d["subagentes"][0]["status"] for e, d in evs if e == "agente" and d["agente"] == G], ["concluido"])
        self.assertEqual(self.subs(self.passo(2)), [])

    def test_atividade_so_nao_gera_evento_de_agente(self):
        self.sub_gravar(ev("inicio", 0, id="a1"))
        self.passo(1)
        self.sub_gravar(ev("atividade", 0, id="a1", ferramenta="Bash", resumo="x"))
        evs = self.passo(2)
        self.assertEqual(len(self.subs(evs)), 1)
        self.assertEqual([e for e, _ in evs if e == "agente"], [])

    def test_rate_limit_de_2s_sem_perder_o_estado_final(self):
        self.sub_gravar(ev("inicio", 0, id="a1"))
        self.assertEqual(len(self.subs(self.passo(1))), 1)           # t=101: emite
        self.sub_gravar(ev("atividade", 0, id="a1", ferramenta="Bash", resumo="um"))
        self.assertEqual(self.subs(self.passo(0.5)), [])             # t=101.5: segurado
        self.sub_gravar(ev("atividade", 0, id="a1", ferramenta="Bash", resumo="dois"),
                        ev("fim", 0, id="a1"))
        self.assertEqual(self.subs(self.passo(0.5)), [])             # t=102: ainda < 2 s
        final = self.subs(self.passo(1.1))                           # t=103.1: sai o estado mais recente
        self.assertEqual([(d["status"], d["n_atividades"], d["ultima_atividade"]["resumo"]) for d in final],
                         [("concluido", 2, "dois")])
        self.assertEqual(self.subs(self.passo(5)), [])

    def test_rate_limit_e_por_subagent(self):
        self.sub_gravar(ev("inicio", 0, id="a1"), ev("inicio", 0, id="a2"))
        self.assertEqual(sorted(d["id"] for d in self.subs(self.passo(1))), ["a1", "a2"])
        self.sub_gravar(ev("atividade", 0, id="a1", ferramenta="Bash", resumo="x"), ev("inicio", 0, id="a3"))
        self.assertEqual(sorted(d["id"] for d in self.subs(self.passo(0.5))), ["a3"])  # a3 é novo; a1 espera

    def test_perdido_por_passagem_do_tempo(self):
        self.sub_gravar(ev("inicio", 119, id="a1"))
        self.passo(1)
        with mock.patch.object(painel_subagentes, "PERDIDO_S", 60):
            evs = self.passo(3)
        self.assertEqual([(d["id"], d["status"]) for d in self.subs(evs)], [("a1", "perdido")])

    def test_mascara_no_evento(self):
        self.sub_gravar(ev("inicio", 0, id="a1"), ev("atividade", 0, id="a1", ferramenta="Bash", resumo="token=segredo123 x"))
        corpo = json.dumps(self.subs(self.passo(1)))
        self.assertNotIn("segredo123", corpo)

    def test_virada_do_dia_muda_os_arquivos_vigiados(self):
        hoje = agora_local()
        amanha = hoje + datetime.timedelta(days=1)
        a = painel_subagentes.assinatura("alpha", hoje)
        b = painel_subagentes.assinatura("alpha", amanha)
        self.assertEqual(a[0][0], hoje.date().isoformat() + ".jsonl")
        self.assertEqual(b[0][0], amanha.date().isoformat() + ".jsonl")
        self.assertEqual(b[1][0], a[0][0])  # ontem de amanhã = hoje: o arquivo anterior continua vigiado
        self.sub_gravar(ev("inicio", 0, id="a1"))
        self.assertNotEqual(painel_subagentes.assinatura("alpha", hoje), a)

    def test_vigia_sobrevive_a_arquivo_torto_e_sem_diretorio(self):
        self.assertEqual(self.subs(self.passo(3)), [])
        self.sub_cru("{", "lixo", "[]")
        self.assertEqual(self.subs(self.passo(3)), [])


if __name__ == "__main__":
    try:
        unittest.main(verbosity=1)
    finally:
        shutil.rmtree(HOME_TESTE, ignore_errors=True)
