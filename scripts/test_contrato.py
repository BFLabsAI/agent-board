#!/usr/bin/env python3
"""Testes da escolha de interface (Orca ou Maestri) no setup e do CONTRATO adaptado.

  python3 scripts/test_contrato.py
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
HOME_TESTE = tempfile.mkdtemp(prefix="agent-board-contrato-")
os.environ["AGENT_BOARD_HOME"] = HOME_TESTE  # antes de importar base
sys.path.insert(0, AQUI)

import contrato  # noqa: E402

TEMPLATE = os.path.join(AQUI, "..", "templates", "CONTRATO.md")
PAINEL = os.path.join(AQUI, "painel.py")


class Renderizar(unittest.TestCase):
    TEXTO = (
        "comum 1\n"
        "<!-- orca -->\n"
        "só orca A\n"
        "só orca B\n"
        "<!-- /orca -->\n"
        "<!-- maestri -->\n"
        "só maestri\n"
        "<!-- /maestri -->\n"
        "<!-- orca --> linha orca\n"
        "<!-- maestri --> linha maestri\n"
        "comum 2\n"
    )

    def test_orca(self):
        self.assertEqual(contrato.renderizar(self.TEXTO, "orca"), "comum 1\nsó orca A\nsó orca B\nlinha orca\ncomum 2\n")

    def test_maestri(self):
        self.assertEqual(contrato.renderizar(self.TEXTO, "maestri"), "comum 1\nsó maestri\nlinha maestri\ncomum 2\n")

    def test_sem_escolha_mantem_os_dois_como_antes(self):
        t = contrato.renderizar(self.TEXTO, None)
        for trecho in ("só orca A", "só maestri", "linha orca", "linha maestri", "comum 1", "comum 2"):
            self.assertIn(trecho, t)
        self.assertNotIn("<!--", t)

    def test_marcador_mal_formado_e_erro(self):
        for ruim in ("<!-- orca -->\nsem fechar\n", "sem abrir\n<!-- /orca -->\n",
                     "<!-- orca -->\n<!-- maestri -->\nx\n<!-- /maestri -->\n<!-- /orca -->\n"):
            with self.assertRaises(ValueError):
                contrato.renderizar(ruim, "orca")

    def test_transporte_invalido(self):
        with self.assertRaises(ValueError):
            contrato.renderizar("x\n", "telegrama")


class TemplateReal(unittest.TestCase):
    """O template de verdade: cada versão fala só da própria interface."""

    @classmethod
    def setUpClass(cls):
        with open(TEMPLATE) as f:
            cls.texto = f.read()

    def test_orca_nao_menciona_o_maestri(self):
        t = contrato.renderizar(self.texto, "orca")
        for proibido in ("maestri", "board.py", "corda", "canvas"):
            self.assertNotIn(proibido, t.lower(), proibido)
        self.assertIn("orca orchestration send --to", t)
        self.assertIn("$ORCA_TERMINAL_HANDLE", t)
        self.assertNotIn("<!--", t)

    def test_maestri_nao_menciona_o_orca(self):
        t = contrato.renderizar(self.texto, "maestri")
        self.assertNotIn("orca", t.lower())
        self.assertIn("board.py send --to", t)
        self.assertIn("maestri:<$MAESTRI_TERMINAL_ID>", t)
        self.assertIn("solicitar", t)
        self.assertNotIn("<!--", t)

    def test_manager_aprende_entrega_para_trabalho_e_resposta_para_pergunta(self):
        for t in ("orca", "maestri"):
            texto = contrato.renderizar(self.texto, t)
            self.assertIn("`--type entrega --responde-a <id do pedido>`", texto)
            self.assertIn("a entrega fecha o pedido", texto)
            self.assertIn("pergunta, bloqueio", texto)

    def test_as_duas_versoes_mantem_o_que_e_comum(self):
        for tr in ("orca", "maestri"):
            t = contrato.renderizar(self.texto, tr)
            for comum in ("andamento", "--veredito", "--prazo", "Papéis e quem pode pedir a quem", "board_send",
                          "Notas e decisões do time", "Resposta fecha a conversa"):
                self.assertIn(comum, t, f"{tr}: {comum}")

    def test_sem_escolha_continua_com_os_dois(self):
        t = contrato.renderizar(self.texto, None)
        self.assertIn("orca orchestration send --to", t)
        self.assertIn("board.py send --to", t)

    def test_a_versao_maestri_ensina_a_delegar_ao_time(self):
        t = contrato.renderizar(self.texto, "maestri")
        self.assertIn("subagent", t.lower())
        self.assertIn("recrutar", t.lower())


class Deteccao(unittest.TestCase):
    def test_detectar(self):
        self.assertEqual(contrato.detectar({"ORCA_TERMINAL_HANDLE": "term_x"}), "orca")
        self.assertEqual(contrato.detectar({"MAESTRI_TERMINAL_ID": "ABC"}), "maestri")
        self.assertIsNone(contrato.detectar({}))
        self.assertIsNone(contrato.detectar({"ORCA_TERMINAL_HANDLE": "x", "MAESTRI_TERMINAL_ID": "y"}))

    def test_handle_de_outra_interface_e_recusado(self):
        self.assertIsNone(contrato.checar_handle({"transporte": "orca"}, "term_1"))
        self.assertIsNone(contrato.checar_handle({"transporte": "maestri"}, "maestri:ABC"))
        self.assertIn("Maestri", contrato.checar_handle({"transporte": "orca"}, "maestri:ABC"))
        self.assertIn("Orca", contrato.checar_handle({"transporte": "maestri"}, "term_1"))
        self.assertIsNone(contrato.checar_handle({}, "maestri:ABC"))  # projeto antigo, sem escolha
        self.assertIsNone(contrato.checar_handle({"transporte": None}, "term_1"))


class Init(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="agent-board-init-")
        self.raiz = os.path.join(self.tmp, "proj")

    def tearDown(self):
        shutil.rmtree(self.tmp)
        shutil.rmtree(HOME_TESTE, ignore_errors=True)
        os.makedirs(HOME_TESTE, exist_ok=True)

    def init(self, *extra, env=None):
        e = {k: v for k, v in os.environ.items() if k not in ("ORCA_TERMINAL_HANDLE", "MAESTRI_TERMINAL_ID")}
        e.update(env or {}, AGENT_BOARD_HOME=HOME_TESTE)
        return subprocess.run([sys.executable, PAINEL, "init", "--raiz", self.raiz, "--projeto", "alpha",
                               "--prefixo", "alpha"] + list(extra), capture_output=True, text=True, env=e,
                              timeout=30, stdin=subprocess.DEVNULL)

    def cfg(self):
        with open(os.path.join(self.raiz, "docs/agent-board/agent-board.json")) as f:
            return json.load(f)

    def contrato(self):
        with open(os.path.join(self.raiz, "docs/agent-board/CONTRATO.md")) as f:
            return f.read()

    def test_escolha_explicita_grava_na_config_e_adapta_o_contrato(self):
        r = self.init("--transporte", "maestri")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self.cfg()["transporte"], "maestri")
        self.assertNotIn("orca", self.contrato().lower())
        self.assertIn("transporte: maestri", r.stdout)

    def test_orca(self):
        self.assertEqual(self.init("--transporte", "orca").returncode, 0)
        self.assertEqual(self.cfg()["transporte"], "orca")
        self.assertNotIn("maestri", self.contrato().lower())

    def test_sem_escolha_usa_o_ambiente_e_avisa(self):
        r = self.init(env={"MAESTRI_TERMINAL_ID": "ABC"})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self.cfg()["transporte"], "maestri")
        self.assertIn("detectado", r.stdout)

    def test_sem_escolha_e_sem_ambiente_pede_a_escolha(self):
        r = self.init()
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("--transporte orca|maestri", r.stderr)
        self.assertFalse(os.path.exists(os.path.join(self.raiz, "docs/agent-board/agent-board.json")))

    def test_ambiente_ambiguo_pede_a_escolha(self):
        r = self.init(env={"ORCA_TERMINAL_HANDLE": "term_x", "MAESTRI_TERMINAL_ID": "ABC"})
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("--transporte", r.stderr)

    def test_valor_invalido(self):
        r = self.init("--transporte", "slack")
        self.assertNotEqual(r.returncode, 0)

    def test_init_de_novo_sem_flag_mantem_a_escolha(self):
        self.init("--transporte", "maestri")
        r = self.init(env={"ORCA_TERMINAL_HANDLE": "term_x"})  # ambiente diferente não muda o projeto
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self.cfg()["transporte"], "maestri")

    def test_trocar_de_interface_atualiza_config_e_contrato(self):
        self.init("--transporte", "orca")
        r = self.init("--transporte", "maestri")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self.cfg()["transporte"], "maestri")
        self.assertNotIn("orca", self.contrato().lower())
        self.assertIn("orca → maestri", r.stdout)

    def test_atualizar_contrato_segue_a_escolha_do_projeto(self):
        self.init("--transporte", "orca")
        with open(os.path.join(self.raiz, "docs/agent-board/CONTRATO.md"), "w") as f:
            f.write("velho\n")
        self.assertEqual(self.init("--atualizar-contrato").returncode, 0)
        self.assertIn("orca orchestration send", self.contrato())
        self.assertNotIn("maestri", self.contrato().lower())

    def test_projeto_antigo_sem_escolha_atualiza_o_contrato_sem_exigir_flag(self):
        self.init("--transporte", "orca")
        c = self.cfg()
        c.pop("transporte")
        with open(os.path.join(self.raiz, "docs/agent-board/agent-board.json"), "w") as f:
            json.dump(c, f)
        r = self.init("--atualizar-contrato")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("board.py send --to", self.contrato())  # versão com as duas interfaces, como antes
        self.assertIn("orca orchestration send --to", self.contrato())


class Cadastrar(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="agent-board-cad-")
        self.raiz = os.path.join(self.tmp, "proj")

    def tearDown(self):
        shutil.rmtree(self.tmp)
        shutil.rmtree(HOME_TESTE, ignore_errors=True)
        os.makedirs(HOME_TESTE, exist_ok=True)

    def rodar(self, *args):
        e = {k: v for k, v in os.environ.items() if k not in ("ORCA_TERMINAL_HANDLE", "MAESTRI_TERMINAL_ID")}
        e["AGENT_BOARD_HOME"] = HOME_TESTE
        return subprocess.run([sys.executable, PAINEL] + list(args), capture_output=True, text=True, env=e, timeout=30,
                              stdin=subprocess.DEVNULL)

    def test_projeto_orca_recusa_terminal_do_maestri(self):
        self.rodar("init", "--raiz", self.raiz, "--projeto", "alpha", "--prefixo", "alpha", "--transporte", "orca")
        r = self.rodar("cadastrar", "--raiz", self.raiz, "maestri:ABC=alpha-manager01-cc")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("Orca", r.stderr)
        self.assertIn("--transporte", r.stderr)

    def test_projeto_maestri_recusa_terminal_do_orca(self):
        self.rodar("init", "--raiz", self.raiz, "--projeto", "alpha", "--prefixo", "alpha", "--transporte", "maestri")
        r = self.rodar("cadastrar", "--raiz", self.raiz, "term_x=alpha-manager01-cc")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("Maestri", r.stderr)

    def test_projeto_orca_aceita_terminal_do_orca(self):
        self.rodar("init", "--raiz", self.raiz, "--projeto", "alpha", "--prefixo", "alpha", "--transporte", "orca")
        r = self.rodar("cadastrar", "--raiz", self.raiz, "term_x=alpha-manager01-cc")
        self.assertEqual(r.returncode, 0, r.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=1)
