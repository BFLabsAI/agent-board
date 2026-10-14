#!/usr/bin/env python3
"""Testes dos recursos do time: notas, resumo, worktree por agente e notificação externa.

  python3 scripts/test_time.py
"""
import datetime
import http.server
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
HOME_TESTE = tempfile.mkdtemp(prefix="agent-board-time-")
os.environ["AGENT_BOARD_HOME"] = HOME_TESTE  # antes de importar base
sys.path.insert(0, AQUI)

import cmd_time  # noqa: E402
import notificar  # noqa: E402
import registro  # noqa: E402
from base import LOG_REL  # noqa: E402

CONFIG = os.path.join(AQUI, "..", "templates", "agent-board.json")
PAINEL = os.path.join(AQUI, "painel.py")
CORE = os.path.join(AQUI, "hook_core.py")
NOTIFICAR = os.path.join(AQUI, "notificar.py")
TEM_GIT = shutil.which("git") is not None


def projeto(tmp, nome="alpha", github=False):
    raiz = os.path.join(tmp, nome)
    os.makedirs(os.path.join(raiz, "docs/agent-board"))
    with open(CONFIG) as f:
        cfg = json.load(f)
    cfg["projeto"], cfg["prefixo"] = nome, nome
    cfg["github"] = {"comentar_entregas": github}
    with open(os.path.join(raiz, "docs/agent-board/agent-board.json"), "w") as f:
        json.dump(cfg, f)
    return raiz


def git(raiz, *args):
    env = dict(os.environ, GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@t", GIT_COMMITTER_NAME="t",
               GIT_COMMITTER_EMAIL="t@t")
    return subprocess.run(["git", "-C", raiz] + list(args), capture_output=True, text=True, env=env,
                          timeout=30, check=True).stdout.strip()


def iniciar_git(raiz):
    git(raiz, "init", "-q")
    git(raiz, "add", "-A")
    git(raiz, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "inicio")


def gravar_paineis(paineis):
    with open(os.path.join(HOME_TESTE, "paineis.json"), "w") as f:
        json.dump({"versao": 1, "paineis": paineis}, f)


def ler_paineis():
    with open(os.path.join(HOME_TESTE, "paineis.json")) as f:
        return json.load(f)["paineis"]


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="agent-board-t-")
        self.raiz = projeto(self.tmp)
        self.orca = os.path.join(self.tmp, "orca")  # orca falso: nada sai daqui
        with open(self.orca, "w") as f:
            f.write("#!/bin/sh\nexit 0\n")
        os.chmod(self.orca, 0o755)
        gravar_paineis({
            "term_m": {"projeto": "alpha", "agente": "alpha-master", "papel": "master", "raiz": self.raiz},
            "term_g": {"projeto": "alpha", "agente": "alpha-manager01-cc", "papel": "manager", "raiz": self.raiz},
        })

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def painel(self, *args, eu=None, ok=True, env_extra=None):
        env = dict(os.environ, AGENT_BOARD_HOME=HOME_TESTE, ORCA_BIN=self.orca, **(env_extra or {}))
        env.pop("ORCA_TERMINAL_HANDLE", None)
        if eu:
            env["ORCA_TERMINAL_HANDLE"] = eu
        r = subprocess.run([sys.executable, PAINEL] + list(args), capture_output=True, text=True, env=env, timeout=60)
        if ok:
            self.assertEqual(r.returncode, 0, r.stderr + r.stdout)
        return r

    def log(self):
        with open(os.path.join(self.raiz, LOG_REL)) as f:
            return [json.loads(l) for l in f if l.strip()]


class Notas(Base):
    def test_nota_cria_arquivo_e_linha_de_log(self):
        self.painel("nota", "--raiz", self.raiz, "--tema", "Pagamentos", "--de", "ceo", "Usar Stripe")
        self.painel("nota", "--raiz", self.raiz, "--tema", "pagamentos", "--decisao", "--de", "ceo", "Fechado: Stripe")
        with open(os.path.join(self.raiz, cmd_time.NOTAS_REL, "pagamentos.md")) as f:
            md = f.read()
        self.assertTrue(md.startswith("# pagamentos\n"))
        self.assertIn("Usar Stripe", md)
        self.assertIn("· ceo · Decisão · n-", md)
        ls = self.log()
        self.assertEqual([(l["tipo"], l["tema"], l["decisao"], l["de"]) for l in ls],
                         [("nota", "pagamentos", False, "ceo"), ("nota", "pagamentos", True, "ceo")])
        self.assertNotIn("para", ls[0])
        self.assertEqual(registro.verificar(self.raiz)["problemas"], [])

    def test_tema_malicioso_vira_slug_seguro(self):
        self.assertEqual(cmd_time.slug("../../etc"), "etc")
        self.assertEqual(cmd_time.slug("a/b"), "a-b")
        self.assertEqual(cmd_time.slug("Decisão de Arquitetura"), "decisao-de-arquitetura")
        self.assertEqual(len(cmd_time.slug("x" * 200)), 60)
        self.painel("nota", "--raiz", self.raiz, "--tema", "../../etc", "--de", "ceo", "oi")
        self.painel("nota", "--raiz", self.raiz, "--tema", "a/b", "--de", "ceo", "oi")
        pasta = os.path.join(self.raiz, cmd_time.NOTAS_REL)
        self.assertEqual(sorted(os.listdir(pasta)), ["a-b.md", "etc.md"])
        self.assertFalse(os.path.exists(os.path.join(self.tmp, "etc.md")))
        r = self.painel("nota", "--raiz", self.raiz, "--tema", "../..", "--de", "ceo", "oi", ok=False)
        self.assertNotEqual(r.returncode, 0)

    def test_autor_vem_do_cadastro_e_ignora_de(self):
        self.painel("nota", "--raiz", self.raiz, "--tema", "t", "--de", "alpha-master", "nota do manager", eu="term_g")
        self.assertEqual(self.log()[-1]["de"], "alpha-manager01-cc")

    def test_humano_sem_de_e_barrado(self):
        r = self.painel("nota", "--raiz", self.raiz, "--tema", "t", "oi", ok=False)
        self.assertIn("--de", r.stderr)

    def test_nota_nao_e_cobrada_nem_respondida(self):
        import hook_core
        self.painel("nota", "--raiz", self.raiz, "--tema", "t", "--de", "ceo", "oi")
        eu = ler_paineis()["term_g"]
        self.assertEqual(hook_core.pendentes_de(eu), [])
        self.assertEqual(cmd_time.pendentes(registro.ler_log(self.raiz)), [])

    def test_notas_lista_e_mostra(self):
        self.painel("nota", "--raiz", self.raiz, "--tema", "infra", "--de", "ceo", "linha 1")
        self.painel("nota", "--raiz", self.raiz, "--tema", "infra", "--decisao", "--de", "ceo", "linha 2")
        self.painel("nota", "--raiz", self.raiz, "--tema", "api", "--de", "ceo", "x")
        out = self.painel("notas", "--raiz", self.raiz).stdout
        self.assertTrue(out.startswith("temas[2]{tema,notas,decisoes,ultima}:"), out)
        self.assertIn("infra,2,1,", out)
        js = json.loads(self.painel("notas", "--raiz", self.raiz, "--tema", "infra", "--formato", "json").stdout)
        self.assertEqual([(b["texto"], b["decisao"]) for b in js], [("linha 1", False), ("linha 2", True)])
        md = self.painel("notas", "--raiz", self.raiz, "--tema", "infra", "--formato", "md").stdout
        self.assertIn("linha 2", md)
        self.assertNotEqual(self.painel("notas", "--raiz", self.raiz, "--tema", "nada", ok=False).returncode, 0)

    def test_historico_sobre_acha_a_nota(self):
        self.painel("nota", "--raiz", self.raiz, "--tema", "pagamentos", "--de", "ceo", "x")
        js = json.loads(self.painel("historico", "--raiz", self.raiz, "--sobre", "pagam", "--formato", "json").stdout)
        self.assertEqual(len(js), 1)
        self.assertEqual(js[0]["tipo"], "nota")


class Resumo(Base):
    def test_contagens_de_um_log_montado(self):
        agora = datetime.datetime.now().astimezone()

        def ts(horas):
            return (agora - datetime.timedelta(hours=horas)).isoformat(timespec="seconds")
        m = lambda cid, h, de, para, tipo, **x: dict(  # noqa: E731
            {"id": cid, "ts": ts(h), "de": de, "para": para, "tipo": tipo, "assunto": cid}, **x)
        M, G, R = "alpha-master", "alpha-manager01-cc", "alpha-researcher01-cc"
        for l in (m("c-velho", 48, M, G, "pedido"),  # fora do período, e ainda pendente
                  m("c-1", 3, M, G, "pedido", modo="executar"),
                  m("c-2", 2, G, M, "resposta", responde_a="c-1"),
                  m("c-3", 2, G, R, "pedido"),
                  m("c-4", 1, G, M, "entrega", issues=[7], branch="ab/alpha-manager01-cc"),
                  m("c-5", 1, R, M, "escalacao"),
                  {"id": "n-1", "ts": ts(1), "de": "ceo", "tipo": "nota", "tema": "api", "decisao": True}):
            registro.gravar_log(self.raiz, l)
        r = cmd_time.montar_resumo(registro.ler_tudo(self.raiz), agora - datetime.timedelta(hours=24), agora)
        self.assertEqual(r["periodo"]["eventos"], 6)
        self.assertEqual({t["tipo"]: t["n"] for t in r["por_tipo"]},
                         {"pedido": 2, "resposta": 1, "entrega": 1, "escalacao": 1, "nota": 1})
        ag = {c["agente"]: (c["enviou"], c["recebeu"]) for c in r["por_agente"]}
        self.assertEqual(ag, {M: (1, 3), G: (3, 1), R: (1, 1), "ceo": (1, 0)})
        pend = {p["agente"]: p["ids"] for p in r["pendentes"]}
        self.assertEqual(pend, {G: ["c-velho"], R: ["c-3"], M: ["c-4", "c-5"]})
        self.assertEqual([e["branch"] for e in r["entregas"]], ["ab/alpha-manager01-cc"])
        self.assertEqual([n["id"] for n in r["notas"]], ["n-1"])
        txt = self.painel("resumo", "--raiz", self.raiz, "--desde", "1d").stdout
        self.assertIn("6 evento(s)", txt)
        self.assertIn("DECISÃO", txt)
        tn = self.painel("resumo", "--raiz", self.raiz, "--desde", "90m", "--formato", "toon").stdout
        self.assertIn("eventos: 3", tn)
        self.assertIn("entregas[1]{id,ts,de,assunto,issues,branch}:", tn)
        self.assertNotEqual(self.painel("resumo", "--raiz", self.raiz, "--desde", "ontem", ok=False).returncode, 0)


@unittest.skipUnless(TEM_GIT, "sem git")
class Worktree(Base):
    def test_cadastrar_com_worktree_cria_e_grava(self):
        iniciar_git(self.raiz)
        r = self.painel("cadastrar", "--raiz", self.raiz, "--worktree", "term_m2=alpha-master",
                        "term_g2=alpha-manager01-cc")
        wt = os.path.join(self.tmp, "alpha-worktrees", "alpha-manager01-cc")
        self.assertIn("worktree de alpha-manager01-cc", r.stdout)
        cad = ler_paineis()
        self.assertEqual(cad["term_g2"]["worktree"], wt)
        self.assertNotIn("worktree", cad["term_m2"])  # só managers
        self.assertEqual(git(wt, "rev-parse", "--abbrev-ref", "HEAD"), "ab/alpha-manager01-cc")
        self.assertEqual(notificar.branch_de(wt), "ab/alpha-manager01-cc")
        # de novo (painel reaberto): reaproveita; sem --worktree, o worktree fica no cadastro
        self.painel("cadastrar", "--raiz", self.raiz, "--worktree", "term_g3=alpha-manager01-cc")
        self.painel("cadastrar", "--raiz", self.raiz, "term_g4=alpha-manager01-cc")
        self.assertEqual(ler_paineis()["term_g4"]["worktree"], wt)

    def test_sem_git_explica_e_nao_cadastra(self):
        antes = ler_paineis()
        r = self.painel("cadastrar", "--raiz", self.raiz, "--worktree", "term_g2=alpha-manager01-cc", ok=False)
        self.assertIn("não é um repositório git", r.stderr)
        self.assertEqual(ler_paineis(), antes)

    def test_caminho_ocupado_desfaz_e_nao_cadastra(self):
        iniciar_git(self.raiz)
        os.makedirs(os.path.join(self.tmp, "alpha-worktrees", "alpha-manager02-cc"))
        antes = ler_paineis()
        r = self.painel("cadastrar", "--raiz", self.raiz, "--worktree", "term_g2=alpha-manager01-cc",
                        "term_g5=alpha-manager02-cc", ok=False)
        self.assertIn("Nada foi cadastrado", r.stderr)
        self.assertEqual(ler_paineis(), antes)
        self.assertFalse(os.path.exists(os.path.join(self.tmp, "alpha-worktrees", "alpha-manager01-cc")))
        self.assertNotIn("ab/alpha-manager01-cc", git(self.raiz, "branch", "--list"))

    def test_entrega_leva_a_branch_no_log(self):
        iniciar_git(self.raiz)
        self.painel("cadastrar", "--raiz", self.raiz, "--worktree", "term_m=alpha-master", "term_g=alpha-manager01-cc")
        cmd = 'orca orchestration send --to alpha-master --type entrega --subject "Pronto" --issues 7'
        payload = {"hook_event_name": "PreToolUse", "tool_name": "Bash", "tool_input": {"command": cmd},
                   "tool_use_id": "tu-1"}
        env = dict(os.environ, AGENT_BOARD_HOME=HOME_TESTE, ORCA_TERMINAL_HANDLE="term_g", ORCA_BIN=self.orca)
        out = subprocess.run([sys.executable, CORE], input=json.dumps(payload), capture_output=True, text=True,
                             env=env, timeout=30)
        self.assertEqual(json.loads(out.stdout)["hookSpecificOutput"]["permissionDecision"], "allow", out.stderr)
        self.assertEqual(self.log()[-1]["branch"], "ab/alpha-manager01-cc")
        self.assertEqual(self.log()[-1]["issues"], [7])


class Coletor(http.server.BaseHTTPRequestHandler):
    recebidos = []

    def do_POST(self):
        corpo = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        Coletor.recebidos.append((self.headers.get("Content-Type"), json.loads(corpo)))
        self.send_response(200)
        self.end_headers()

    def log_message(self, *a):
        pass


class Notificacao(Base):
    def setUp(self):
        super().setUp()
        Coletor.recebidos = []
        self.srv = http.server.HTTPServer(("127.0.0.1", 0), Coletor)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.srv.server_address[1]}/hook"
        self.velho = {k: os.environ.get(k) for k in ("AGENT_BOARD_WEBHOOK", "AGENT_BOARD_WEBHOOK_TIPOS")}

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()
        for k, v in self.velho.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        super().tearDown()

    def envio(self, tipo="entrega", issues=(7,)):
        return {"id": "c-1", "tipo": tipo, "tipo_time": tipo, "de": "alpha-manager01-cc", "para": "alpha-master",
                "assunto": "Pronto", "issues": list(issues), "raiz": self.raiz, "branch": "ab/x"}

    def test_webhook_recebe_o_texto(self):
        os.environ["AGENT_BOARD_WEBHOOK"] = self.url
        os.environ.pop("AGENT_BOARD_WEBHOOK_TIPOS", None)
        notificar.notificar(self.envio())
        self.assertEqual(len(Coletor.recebidos), 1)
        tipo, corpo = Coletor.recebidos[0]
        self.assertEqual(tipo, "application/json")
        self.assertEqual(list(corpo), ["text"])
        self.assertIn("entrega c-1 de alpha-manager01-cc para alpha-master: Pronto", corpo["text"])
        self.assertIn("#7", corpo["text"])
        self.assertIn("ab/x", corpo["text"])

    def test_tipo_fora_da_lista_nao_envia(self):
        os.environ["AGENT_BOARD_WEBHOOK"] = self.url
        os.environ["AGENT_BOARD_WEBHOOK_TIPOS"] = "escalacao"
        notificar.notificar(self.envio())
        notificar.notificar(self.envio("pedido"))
        self.assertEqual(Coletor.recebidos, [])

    def test_webhook_fora_do_ar_so_registra(self):
        os.environ["AGENT_BOARD_WEBHOOK"] = "http://127.0.0.1:9/nada"
        self.assertFalse(notificar.enviar_webhook(os.environ["AGENT_BOARD_WEBHOOK"], "x"))
        self.assertFalse(notificar.enviar_webhook("file:///etc/passwd", "x"))
        with open(os.path.join(HOME_TESTE, "avisos.log")) as f:
            log = f.read()
        self.assertIn("webhook falhou", log)
        self.assertNotIn("127.0.0.1:9", log)  # a URL não vaza para o avisos.log

    def rodar_notificar(self, path, p):
        env = dict(os.environ, AGENT_BOARD_HOME=HOME_TESTE, PATH=path)
        env.pop("AGENT_BOARD_WEBHOOK", None)
        return subprocess.run([sys.executable, NOTIFICAR, json.dumps(p)], capture_output=True, text=True,
                              env=env, timeout=30)

    def test_github_sem_gh_nao_quebra(self):
        raiz = projeto(self.tmp, "beta", github=True)
        p = dict(self.envio(), raiz=raiz)
        vazio = os.path.join(self.tmp, "bin-vazio")
        os.makedirs(vazio)
        r = self.rodar_notificar(vazio, p)
        self.assertEqual(r.returncode, 0, r.stderr)
        with open(os.path.join(HOME_TESTE, "avisos.log")) as f:
            self.assertIn("sem gh no PATH", f.read())

    def test_github_comenta_cada_issue(self):
        raiz = projeto(self.tmp, "beta", github=True)
        pasta = os.path.join(self.tmp, "bin-gh")
        os.makedirs(pasta)
        chamadas = os.path.join(self.tmp, "gh-chamadas")
        with open(os.path.join(pasta, "gh"), "w") as f:
            f.write(f'#!/bin/sh\necho "$PWD|$1 $2 $3|$5" >> {chamadas}\n')
        os.chmod(os.path.join(pasta, "gh"), 0o755)
        r = self.rodar_notificar(pasta + os.pathsep + "/usr/bin:/bin", dict(self.envio(issues=(7, 8)), raiz=raiz))
        self.assertEqual(r.returncode, 0, r.stderr)
        with open(chamadas) as f:
            ls = f.read().splitlines()
        self.assertEqual([l.split("|")[1] for l in ls], ["issue comment 7", "issue comment 8"])
        self.assertEqual(os.path.realpath(ls[0].split("|")[0]), os.path.realpath(raiz))
        self.assertIn("Pronto", ls[0])

    def test_github_desligado_no_template(self):
        self.assertFalse(notificar.quer_github(self.envio()))  # projeto() grava comentar_entregas false

    def test_post_send_dispara_o_webhook(self):
        """Ponta a ponta: pre_send + post_send do hook, com o webhook no ambiente do hook."""
        cmd = 'orca orchestration send --to alpha-master --type entrega --subject "Feito"'
        env = dict(os.environ, AGENT_BOARD_HOME=HOME_TESTE, ORCA_TERMINAL_HANDLE="term_g", ORCA_BIN=self.orca,
                   AGENT_BOARD_WEBHOOK=self.url, AGENT_BOARD_JANELA_AVISO="0")
        for evento, extra in (("PreToolUse", {}), ("PostToolUse", {"tool_response": "Sent msg_1"})):
            payload = dict({"hook_event_name": evento, "tool_name": "Bash", "tool_input": {"command": cmd},
                            "tool_use_id": "tu-9"}, **extra)
            out = subprocess.run([sys.executable, CORE], input=json.dumps(payload), capture_output=True,
                                 text=True, env=env, timeout=30)
            self.assertEqual(out.returncode, 0, out.stderr)
        fim = time.time() + 10
        while not Coletor.recebidos and time.time() < fim:
            time.sleep(0.05)
        self.assertEqual(len(Coletor.recebidos), 1)
        self.assertIn("entrega c-", Coletor.recebidos[0][1]["text"])


if __name__ == "__main__":
    try:
        unittest.main(verbosity=1)
    finally:
        shutil.rmtree(HOME_TESTE, ignore_errors=True)
