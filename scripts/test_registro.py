#!/usr/bin/env python3
"""Testes do log (cadeia de hash, arquivo morto), do TOON e dos comandos de log do painel.py.

  python3 scripts/test_registro.py
"""
import datetime
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
HOME_TESTE = tempfile.mkdtemp(prefix="agent-board-registro-")
os.environ["AGENT_BOARD_HOME"] = HOME_TESTE  # antes de importar base
sys.path.insert(0, AQUI)

import registro  # noqa: E402
import toon  # noqa: E402
from base import LOG_REL  # noqa: E402

CONFIG = os.path.join(AQUI, "..", "templates", "agent-board.json")
PAINEL = os.path.join(AQUI, "painel.py")


def projeto(tmp, nome="alpha"):
    raiz = os.path.join(tmp, nome)
    os.makedirs(os.path.join(raiz, "docs/agent-board"))
    with open(CONFIG) as f:
        cfg = json.load(f)
    cfg["projeto"], cfg["prefixo"] = nome, nome
    with open(os.path.join(raiz, "docs/agent-board/agent-board.json"), "w") as f:
        json.dump(cfg, f)
    return raiz


def msg(cid, ts, de="alpha-master", para="alpha-manager01-cc", tipo="pedido", **extra):
    return dict({"id": cid, "ts": ts, "de": de, "para": para, "tipo": tipo, "assunto": "x"}, **extra)


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="agent-board-t-")
        self.raiz = projeto(self.tmp)
        self.log = os.path.join(self.raiz, LOG_REL)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def linhas(self):
        with open(self.log) as f:
            return f.read().splitlines()

    def reescrever(self, linhas):
        with open(self.log, "w") as f:
            f.write("\n".join(linhas) + "\n")


class Cadeia(Base):
    def test_cada_linha_aponta_para_a_anterior(self):
        for i in range(3):
            registro.gravar_log(self.raiz, msg(f"c-{i}", "2026-10-01T10:00:00-03:00"))
        ls = self.linhas()
        self.assertEqual(json.loads(ls[0])["prev"], "")
        self.assertEqual(json.loads(ls[2])["prev"], registro.hash_linha(ls[1]))
        self.assertEqual(registro.verificar(self.raiz)["problemas"], [])

    def test_editar_linha_do_meio_acusa(self):
        for i in range(3):
            registro.gravar_log(self.raiz, msg(f"c-{i}", "2026-10-01T10:00:00-03:00"))
        ls = self.linhas()
        ls[1] = ls[1].replace('"assunto": "x"', '"assunto": "adulterado"')
        self.reescrever(ls)
        probs = registro.verificar(self.raiz)["problemas"]
        self.assertEqual(len(probs), 1)
        self.assertIn("c-2", probs[0])

    def test_apagar_linha_do_meio_acusa(self):
        for i in range(3):
            registro.gravar_log(self.raiz, msg(f"c-{i}", "2026-10-01T10:00:00-03:00"))
        ls = self.linhas()
        self.reescrever([ls[0], ls[2]])
        self.assertTrue(registro.verificar(self.raiz)["problemas"])

    def test_apagar_o_log_e_recomecar_acusa(self):
        registro.gravar_log(self.raiz, msg("c-0", "2026-10-01T10:00:00-03:00"))
        antiga = self.linhas()[0]
        os.remove(self.log)
        registro.gravar_log(self.raiz, msg("c-1", "2026-10-01T10:00:00-03:00"))
        self.reescrever([antiga] + self.linhas())
        self.assertIn("recomeçado", " ".join(registro.verificar(self.raiz)["problemas"]))

    def test_merge_union_de_duas_branches_nao_e_adulteracao(self):
        registro.gravar_log(self.raiz, msg("c-0", "2026-10-01T10:00:00-03:00"))
        base = self.linhas()
        registro.gravar_log(self.raiz, msg("c-a", "2026-10-01T10:00:00-03:00"))
        ramo_a = self.linhas()[-1]
        self.reescrever(base)
        registro.gravar_log(self.raiz, msg("c-b", "2026-10-01T10:00:00-03:00"))
        self.reescrever(self.linhas() + [ramo_a])  # o que o merge=union produz
        r = registro.verificar(self.raiz)
        self.assertEqual(r["problemas"], [])
        self.assertEqual(r["bifurcacoes"], 1)

    def test_log_antigo_sem_prev_continua_valido(self):
        self.reescrever([json.dumps(msg("c-velha", "2026-01-01T10:00:00-03:00"))])
        registro.gravar_log(self.raiz, msg("c-nova", "2026-10-01T10:00:00-03:00"))
        self.assertEqual(registro.verificar(self.raiz)["problemas"], [])


class Status(Base):
    def test_falhou_some_e_reenviado_volta(self):
        registro.gravar_log(self.raiz, msg("c-1", "2026-10-01T10:00:00-03:00"))
        registro.gravar_log(self.raiz, {"id": "c-1", "ts": "2026-10-01T10:00:01-03:00", "status": "falhou"})
        self.assertEqual(registro.ler_log(self.raiz), [])
        self.assertEqual(registro.achar(self.raiz, "c-1")["tipo"], "pedido")
        registro.gravar_log(self.raiz, {"id": "c-1", "ts": "2026-10-01T10:05:00-03:00", "status": "reenviado"})
        self.assertEqual([m["id"] for m in registro.ler_log(self.raiz)], ["c-1"])


class Arquivo(Base):
    AGORA = datetime.datetime(2026, 10, 12, 12, 0, tzinfo=datetime.timezone.utc)

    def test_move_so_o_que_esta_fechado_e_velho(self):
        velho, novo = "2026-08-01T10:00:00+00:00", "2026-10-11T10:00:00+00:00"
        registro.gravar_log(self.raiz, msg("c-respondido", velho))
        registro.gravar_log(self.raiz, msg("c-r", velho, de="alpha-manager01-cc", para="alpha-master",
                                           tipo="resposta", responde_a="c-respondido"))
        registro.gravar_log(self.raiz, msg("c-esperando", velho))
        registro.gravar_log(self.raiz, msg("c-falhou", velho))
        registro.gravar_log(self.raiz, {"id": "c-falhou", "ts": velho, "status": "falhou"})
        registro.gravar_log(self.raiz, msg("c-recente", novo))
        n = registro.arquivar(self.raiz, 30, agora=self.AGORA)
        ficaram = [json.loads(l)["id"] for l in self.linhas()]
        self.assertEqual(ficaram, ["c-esperando", "c-recente"])
        self.assertEqual(n, 4)
        self.assertTrue(os.path.exists(os.path.join(self.raiz, registro.ARQUIVO_REL, "2026-08.jsonl")))
        self.assertEqual(registro.verificar(self.raiz)["problemas"], [])
        self.assertEqual(len(registro.ler_tudo(self.raiz)), 4)  # c-falhou continua fora

    def test_status_acompanha_a_mensagem_que_fica(self):
        velho = "2026-08-01T10:00:00+00:00"
        registro.gravar_log(self.raiz, msg("c-1", "2026-10-11T10:00:00+00:00"))
        registro.gravar_log(self.raiz, {"id": "c-1", "ts": velho, "status": "falhou"})  # relógio torto
        registro.arquivar(self.raiz, 30, agora=self.AGORA)
        self.assertEqual(registro.ler_log(self.raiz), [])

    def test_nada_para_arquivar_nao_mexe_no_arquivo(self):
        registro.gravar_log(self.raiz, msg("c-1", "2026-10-11T10:00:00+00:00"))
        antes = os.stat(self.log).st_mtime_ns
        self.assertEqual(registro.arquivar(self.raiz, 30, agora=self.AGORA), 0)
        self.assertEqual(os.stat(self.log).st_mtime_ns, antes)


class Toon(unittest.TestCase):
    def test_tabela(self):
        t = toon.tabela("m", [{"id": "c-1", "de": "a", "n": 2}, {"id": "c-2", "de": "b", "n": None}])
        self.assertEqual(t, "m[2]{id,de,n}:\n  c-1,a,2\n  c-2,b,null")

    def test_aspas_onde_a_especificacao_pede(self):
        casos = {"": '""', " x": '" x"', "a,b": '"a,b"', "a:b": '"a:b"', 'di"z': '"di\\"z"',
                 "l1\nl2": '"l1\\nl2"', "true": '"true"', "42": '"42"', "-x": '"-x"', "[a]": '"[a]"',
                 "Analisar pagamentos": "Analisar pagamentos", "c-20261012-1": "c-20261012-1"}
        for entrada, esperado in casos.items():
            self.assertEqual(toon.valor(entrada), esperado, entrada)

    def test_lista_na_celula_e_tabela_vazia(self):
        self.assertEqual(toon.valor([412, 413]), "412 413")
        self.assertEqual(toon.tabela("m", []), "m[0]:")

    def test_objeto_aninhado(self):
        o = toon.objeto({"projeto": "alpha", "tarefas": [{"id": "c-1", "estado": "aberto"}], "ids": ["a", "b"]})
        self.assertEqual(o, "projeto: alpha\ntarefas[1]{id,estado}:\n  c-1,aberto\nids[2]: a,b")


class Comandos(Base):
    """painel.py historico / verificar / arquivar / reenviar, com um orca falso."""

    def painel(self, *args, ok=True):
        env = dict(os.environ, AGENT_BOARD_HOME=HOME_TESTE, ORCA_BIN=self.orca)
        env.pop("ORCA_TERMINAL_HANDLE", None)
        r = subprocess.run([sys.executable, PAINEL] + list(args), capture_output=True, text=True, env=env, timeout=30)
        if ok:
            self.assertEqual(r.returncode, 0, r.stderr)
        return r

    def setUp(self):
        super().setUp()
        self.orca = os.path.join(self.tmp, "orca")
        self.chamadas = os.path.join(self.tmp, "chamadas")
        with open(self.orca, "w") as f:
            f.write(f'#!/bin/bash\nprintf "%s\\n" "$*" >> {self.chamadas}\n')
        os.chmod(self.orca, 0o755)
        paineis = {"term_m2": {"projeto": "alpha", "agente": "alpha-master", "papel": "master", "raiz": self.raiz},
                   "term_g2": {"projeto": "alpha", "agente": "alpha-manager01-cc", "papel": "manager", "raiz": self.raiz}}
        with open(os.path.join(HOME_TESTE, "paineis.json"), "w") as f:
            json.dump({"versao": 1, "paineis": paineis}, f)

    def test_historico_em_toon_filtrado(self):
        registro.gravar_log(self.raiz, msg("c-1", "2026-10-01T10:00:00-03:00", issues=[1, 2]))
        registro.gravar_log(self.raiz, msg("c-2", "2026-10-01T10:00:00-03:00", de="alpha-researcher01-cc",
                                           para="alpha-master", tipo="aviso"))
        out = self.painel("historico", "--raiz", self.raiz, "--agente", "alpha-manager01-cc").stdout
        self.assertTrue(out.startswith("mensagens[1]{id,ts,de,para,tipo,modo,assunto,responde_a,issues}:"), out)
        self.assertIn("c-1,", out)
        self.assertIn(",1 2", out)
        js = json.loads(self.painel("historico", "--raiz", self.raiz, "--formato", "json").stdout)
        self.assertEqual([m["id"] for m in js], ["c-1", "c-2"])

    def test_verificar_sai_com_1_quando_adulterado(self):
        registro.gravar_log(self.raiz, msg("c-1", "2026-10-01T10:00:00-03:00"))
        registro.gravar_log(self.raiz, msg("c-2", "2026-10-01T10:00:00-03:00"))
        self.assertIn("cadeia íntegra", self.painel("verificar", "--raiz", self.raiz).stdout)
        ls = self.linhas()
        self.reescrever([ls[0].replace('"x"', '"y"'), ls[1]])
        r = self.painel("verificar", "--raiz", self.raiz, ok=False)
        self.assertEqual(r.returncode, 1)
        self.assertIn("PROBLEMA", r.stdout)

    def test_arquivar_cria_gitattributes(self):
        registro.gravar_log(self.raiz, msg("c-1", "2020-01-01T10:00:00-03:00", tipo="nota"))
        self.assertIn("1 linha(s)", self.painel("arquivar", "--raiz", self.raiz).stdout)
        with open(os.path.join(self.raiz, ".gitattributes")) as f:
            self.assertIn("docs/agent-board/arquivo/*.jsonl merge=union", f.read())

    def test_reenviar_usa_o_painel_atual_e_marca_no_log(self):
        registro.gravar_log(self.raiz, msg("c-9", "2026-10-01T10:00:00-03:00"))
        registro.gravar_log(self.raiz, {"id": "c-9", "ts": "2026-10-01T10:00:01-03:00", "status": "falhou"})
        os.makedirs(os.path.join(HOME_TESTE, "envios"), exist_ok=True)
        argv = ["orca", "orchestration", "send", "--to", "term_velho_g", "--from", "term_velho_m",
                "--type", "handoff", "--subject", "[c-9 pedido] x", "--body", "--- corpo"]
        with open(os.path.join(HOME_TESTE, "envios", "c-9.json"), "w") as f:
            json.dump({"argv": argv}, f)
        self.assertIn("reenviado", self.painel("reenviar", "--raiz", self.raiz, "c-9").stdout)
        with open(self.chamadas) as f:
            chamada = f.read()
        self.assertIn("--to term_g2 --from term_m2", chamada)
        self.assertIn("--body --- corpo", chamada)
        self.assertEqual([m["id"] for m in registro.ler_log(self.raiz)], ["c-9"])

    def test_so_o_master_arquiva_e_reenvia(self):
        env = dict(os.environ, AGENT_BOARD_HOME=HOME_TESTE, ORCA_BIN=self.orca, ORCA_TERMINAL_HANDLE="term_g2")
        for cmd in (["arquivar", "--raiz", self.raiz], ["reenviar", "--raiz", self.raiz, "c-1"]):
            r = subprocess.run([sys.executable, PAINEL] + cmd, capture_output=True, text=True, env=env, timeout=30)
            self.assertEqual(r.returncode, 1)
            self.assertIn("só do master", r.stderr)

    def test_reenviar_sem_comando_guardado_explica(self):
        registro.gravar_log(self.raiz, msg("c-sem", "2026-10-01T10:00:00-03:00"))
        r = self.painel("reenviar", "--raiz", self.raiz, "c-sem", ok=False)
        self.assertIn("não está mais guardado", r.stderr)


class AcharOrca(unittest.TestCase):
    """Terminal aberto por um Orca server nunca usa o relay SSH (outro runtime)."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="agent-board-orca-")
        self.antes = {k: os.environ.get(k) for k in ("ORCA_BIN", "ORCA_CLI_BIN_DIR", "ORCA_REMOTE_CLI_BIN_DIR")}
        for k in self.antes:
            os.environ.pop(k, None)

    def tearDown(self):
        for k, v in self.antes.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        shutil.rmtree(self.tmp, ignore_errors=True)

    def orca_em(self, nome):
        d = os.path.join(self.tmp, nome)
        os.makedirs(d)
        f = os.path.join(d, "orca")
        with open(f, "w") as fh:
            fh.write("#!/bin/sh\n")
        os.chmod(f, 0o755)
        return d

    def test_servidor_antes_do_ssh(self):
        import base
        servidor, ssh = self.orca_em("servidor"), self.orca_em("ssh")
        os.environ["ORCA_CLI_BIN_DIR"] = servidor
        os.environ["ORCA_REMOTE_CLI_BIN_DIR"] = ssh
        self.assertEqual(base.achar_orca(), os.path.join(servidor, "orca"))

    def test_orca_bin_vence(self):
        import base
        os.environ["ORCA_CLI_BIN_DIR"] = self.orca_em("servidor")
        os.environ["ORCA_BIN"] = os.path.join(self.orca_em("explicito"), "orca")
        self.assertEqual(base.achar_orca(), os.environ["ORCA_BIN"])

    def test_variavel_vazia_e_ignorada(self):
        import base
        os.environ["ORCA_CLI_BIN_DIR"] = ""
        ssh = self.orca_em("ssh")
        os.environ["ORCA_REMOTE_CLI_BIN_DIR"] = ssh
        self.assertEqual(base.achar_orca(), os.path.join(ssh, "orca"))


if __name__ == "__main__":
    try:
        unittest.main(verbosity=1)
    finally:
        shutil.rmtree(HOME_TESTE, ignore_errors=True)
