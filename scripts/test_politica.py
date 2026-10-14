#!/usr/bin/env python3
"""Testes das regras de envio (politica.validar_envio) e dos comandos tarefas, vigiar e simular.

  python3 scripts/test_politica.py
"""
import datetime
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
HOME_TESTE = tempfile.mkdtemp(prefix="agent-board-politica-")
os.environ["AGENT_BOARD_HOME"] = HOME_TESTE  # antes de importar base
sys.path.insert(0, AQUI)

import cmd_tarefas  # noqa: E402
import politica  # noqa: E402
import registro  # noqa: E402
from base import CONFIG_REL, Barrado  # noqa: E402

CONFIG = os.path.join(AQUI, "..", "templates", "agent-board.json")
PAINEL = os.path.join(AQUI, "painel.py")
CORE = os.path.join(AQUI, "hook_core.py")
AGORA = datetime.datetime(2026, 10, 12, 12, 0, tzinfo=datetime.timezone.utc)

M = {"agente": "alpha-master", "papel": "master"}
G1 = {"agente": "alpha-manager01-cc", "papel": "manager"}
G2 = {"agente": "alpha-manager02-cc", "papel": "manager"}
R = {"agente": "alpha-researcher01-cc", "papel": "researcher"}
R2 = {"agente": "alpha-researcher02-cc", "papel": "researcher"}


def config(**extra):
    with open(CONFIG) as f:
        cfg = json.load(f)
    cfg["projeto"], cfg["prefixo"] = "alpha", "alpha"
    cfg.update(extra)
    return cfg


def msg(cid, de, para, tipo, minutos=0, **extra):
    """Mensagem do log `minutos` antes de AGORA."""
    ts = (AGORA - datetime.timedelta(minutes=minutos)).isoformat(timespec="seconds")
    return dict({"id": cid, "ts": ts, "de": de["agente"], "para": para["agente"], "tipo": tipo, "assunto": "x"},
                **extra)


def validar(cfg, de, para, tipo, msgs, modo=None, responde_a=None, veredito=None, prazo=None):
    if modo is None and tipo == "pedido" and para["papel"] == "manager":
        modo = "executar"
    return politica.validar_envio(cfg, de, para, tipo, modo, responde_a, veredito, prazo, msgs, AGORA)


class Andamento(unittest.TestCase):
    def setUp(self):
        self.msgs = [msg("c-p", G1, R, "pedido", 30), msg("c-a", G1, R, "aviso", 20)]

    def test_andamento_a_pedido_recebido_passa_mesmo_fora_dos_tipos(self):
        cfg = config()
        cfg["papeis"]["researcher"]["tipos"] = ["resposta"]  # andamento é forma de resposta
        validar(cfg, R, G1, "andamento", self.msgs, responde_a="c-p")

    def test_andamento_exige_pedido_aberto_e_vai_para_quem_pediu(self):
        cfg = config()
        casos = [(None, G1, "--responde-a"), ("c-a", G1, "só vale para pedido"), ("c-x", G1, "não existe"),
                 ("c-p", M, "vai para quem fez o pedido")]
        for responde_a, para, trecho in casos:
            with self.assertRaises(Barrado) as e:
                validar(cfg, R, para, "andamento", self.msgs, responde_a=responde_a)
            self.assertIn(trecho, str(e.exception))
        fechado = self.msgs + [msg("c-r", R, G1, "resposta", 1, responde_a="c-p")]
        with self.assertRaisesRegex(Barrado, "já foi respondido"):
            validar(cfg, R, G1, "andamento", fechado, responde_a="c-p")

    def test_andamento_tira_da_cobranca_mas_pedido_segue_aberto(self):
        msgs = self.msgs + [msg("c-and", R, G1, "andamento", 5, responde_a="c-p")]
        self.assertEqual([l["id"] for l in politica.pendentes(R["agente"], msgs)], ["c-a"])
        self.assertEqual([l["id"] for l in politica.pendentes(G1["agente"], msgs)], [])  # andamento não se responde
        self.assertEqual([l["id"] for l in politica.pedidos_abertos(R["agente"], msgs)], ["c-p"])
        with self.assertRaisesRegex(Barrado, "é um andamento"):
            validar(config(), G1, R, "resposta", msgs, responde_a="c-and")


class Veredito(unittest.TestCase):
    def setUp(self):
        self.msgs = [msg("c-e", G1, M, "entrega", 10), msg("c-v", G1, M, "aviso", 9)]

    def test_resposta_a_entrega_exige_veredito(self):
        with self.assertRaisesRegex(Barrado, "precisa de --veredito"):
            validar(config(), M, G1, "resposta", self.msgs, responde_a="c-e")
        r = validar(config(), M, G1, "resposta", self.msgs, responde_a="c-e,c-v", veredito="rejeitado")
        self.assertEqual(r["veredito"], "rejeitado")

    def test_veredito_fora_de_resposta_a_entrega_e_invalido(self):
        for tipo, responde_a, veredito, trecho in (("resposta", "c-v", "aprovado", "só vale em resposta a uma entrega"),
                                                   ("aviso", None, "aprovado", "só vale em resposta"),
                                                   ("resposta", "c-e", "talvez", "--veredito inválido"),
                                                   ("resposta", "c-e", True, "--veredito inválido")):
            with self.assertRaises(Barrado) as e:
                validar(config(), M, G1, tipo, self.msgs, responde_a=responde_a, veredito=veredito)
            self.assertIn(trecho, str(e.exception))


class Prazo(unittest.TestCase):
    def test_prazo_vira_iso_com_fuso(self):
        r = validar(config(), G1, R, "pedido", [], prazo="2h")
        self.assertEqual(r["prazo"], "2026-10-12T14:00:00+00:00")
        self.assertIsNone(validar(config(), G1, R, "pedido", [])["prazo"])

    def test_prazo_padrao_da_config(self):
        self.assertEqual(validar(config(prazo_padrao="1d"), G1, R, "pedido", [])["prazo"], "2026-10-13T12:00:00+00:00")
        self.assertIsNone(validar(config(prazo_padrao="1d"), G1, R, "aviso", [])["prazo"])
        with self.assertRaisesRegex(Barrado, "prazo_padrao de agent-board.json inválido"):
            validar(config(prazo_padrao="amanhã"), G1, R, "pedido", [])

    def test_prazo_invalido_ou_fora_de_pedido_barra(self):
        for prazo in ("amanhã", "0m", "2 semanas", True):
            with self.assertRaisesRegex(Barrado, "--prazo inválido"):
                validar(config(), G1, R, "pedido", [], prazo=prazo)
        with self.assertRaisesRegex(Barrado, "só vale em pedido"):
            validar(config(), G1, R, "aviso", [], prazo="2h")


class Limites(unittest.TestCase):
    def test_pedidos_abertos_max(self):
        msgs = [msg("c-1", G1, R, "pedido", 30), msg("c-2", G2, R, "pedido", 20)]
        cfg = config(limites={"pedidos_abertos_max": 2})
        with self.assertRaisesRegex(Barrado, "já tem 2 pedido"):
            validar(cfg, G1, R, "pedido", msgs)
        validar(cfg, G1, R, "aviso", msgs)  # o limite é só de pedido
        validar(config(limites={"pedidos_abertos_max": 3}), G1, R, "pedido", msgs)
        validar(config(), G1, R, "pedido", msgs)  # sem limite, como antes
        msgs.append(msg("c-r", R, G1, "resposta", 1, responde_a="c-1"))
        validar(cfg, G1, R, "pedido", msgs)

    def test_ping_pong_avisa_sem_barrar(self):
        cfg = config(limites={"ping_pong_max": 3, "ping_pong_janela_min": 10})
        msgs = [msg("c-1", G1, G2, "aviso", 8), msg("c-2", G2, G1, "aviso", 6), msg("c-3", G1, G2, "aviso", 4)]
        r = validar(cfg, G2, G1, "aviso", msgs)
        self.assertEqual(r["ping_pong"], {"par": [G1["agente"], G2["agente"]], "n": 4, "janela_min": 10})
        self.assertIsNone(validar(cfg, G2, G1, "aviso", msgs[1:])["ping_pong"])
        self.assertIsNone(validar(config(limites={"ping_pong_max": 3, "ping_pong_janela_min": 5}),
                                  G2, G1, "aviso", msgs)["ping_pong"])  # fora da janela
        self.assertIsNone(validar(config(), G2, G1, "aviso", msgs)["ping_pong"])

    def test_entrega_no_meio_zera_o_ping_pong(self):
        cfg = config(limites={"ping_pong_max": 2, "ping_pong_janela_min": 10})
        msgs = [msg("c-1", M, G1, "aviso", 8), msg("c-2", G1, M, "entrega", 6), msg("c-3", M, G1, "aviso", 4)]
        self.assertIsNone(validar(cfg, G1, M, "aviso", msgs)["ping_pong"])
        msgs.append(msg("c-4", G1, M, "aviso", 2))
        self.assertEqual(validar(cfg, M, G1, "aviso", msgs)["ping_pong"]["n"], 3)


class Ligacoes(unittest.TestCase):
    CFG = config(ligacoes=[["master", "manager"], ["manager", "researcher"],
                           ["alpha-manager01-cc", "alpha-manager02-cc"]])

    def test_pares_listados_passam_com_direcao(self):
        validar(self.CFG, M, G1, "pedido", [])
        validar(self.CFG, G1, R, "aviso", [])
        validar(self.CFG, G1, G2, "pedido", [])  # por nome
        for de, para in ((G2, G1), (M, R), (R, G1)):
            with self.assertRaisesRegex(Barrado, "não tem ligação"):
                validar(self.CFG, de, para, "aviso", [])

    def test_resposta_andamento_escalacao_e_entrega_sempre_passam(self):
        msgs = [msg("c-p", G1, R, "pedido", 5)]
        validar(self.CFG, R, G1, "andamento", msgs, responde_a="c-p")
        validar(self.CFG, R, G1, "resposta", msgs, responde_a="c-p")
        validar(self.CFG, R, M, "escalacao", [])
        validar(self.CFG, G2, M, "entrega", [])

    def test_mensagem_diz_para_quem_pode(self):
        with self.assertRaisesRegex(Barrado, "Pode mandar pedido/aviso para: researcher. Se precisa"):
            validar(self.CFG, G2, G1, "pedido", [])


class ConfigAntiga(unittest.TestCase):
    def test_sem_chaves_novas_nada_muda(self):
        cfg = config()
        for k in ("prazo_padrao", "limites"):
            cfg.pop(k)
        msgs = [msg(f"c-{i}", G1 if i % 2 else G2, R, "pedido", 9 - i) for i in range(6)]
        r = validar(cfg, G1, R, "pedido", msgs)
        self.assertEqual(r, {"prazo": None, "veredito": None, "ping_pong": None})
        validar(cfg, R, G1, "aviso", msgs)  # sem ligacoes, qualquer par do time
        with self.assertRaisesRegex(Barrado, "não envia 'pedido'"):
            validar(cfg, R, G1, "pedido", msgs)  # as regras antigas continuam


class Roteamento(unittest.TestCase):
    def test_menos_pedidos_abertos_e_desempate_por_nome(self):
        msgs = [msg("c-1", G1, R, "pedido", 5)]
        self.assertEqual(politica.escolher_por_papel([R["agente"], R2["agente"]], msgs), R2["agente"])
        self.assertEqual(politica.escolher_por_papel([R2["agente"], R["agente"]], []), R["agente"])
        self.assertIsNone(politica.escolher_por_papel([], msgs))


class Base(unittest.TestCase):
    """Projeto em pasta temporária, cadastro e orca falso, para o hook e o painel.py."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="agent-board-p-")
        self.raiz = os.path.join(self.tmp, "alpha")
        os.makedirs(os.path.join(self.raiz, "docs/agent-board"))
        self.gravar_config(config())
        self.orca = os.path.join(self.tmp, "orca")
        self.chamadas = os.path.join(self.tmp, "chamadas")
        with open(self.orca, "w") as f:
            f.write(f'#!/bin/bash\nprintf "%s\\n" "$*" >> {self.chamadas}\n')
        os.chmod(self.orca, 0o755)
        p = lambda ag, pap: {"projeto": "alpha", "agente": ag["agente"], "papel": pap, "raiz": self.raiz}
        self.paineis = {"term_m": p(M, "master"), "term_g1": p(G1, "manager"), "term_g2": p(G2, "manager"),
                        "term_r": p(R, "researcher"), "term_r2": p(R2, "researcher")}
        with open(os.path.join(HOME_TESTE, "paineis.json"), "w") as f:
            json.dump({"versao": 1, "paineis": self.paineis}, f)
        for nome in ("avisos.log", "alertas-estado.json", "avisos-estado.json"):
            if os.path.exists(os.path.join(HOME_TESTE, nome)):
                os.remove(os.path.join(HOME_TESTE, nome))

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def gravar_config(self, cfg):
        with open(os.path.join(self.raiz, CONFIG_REL), "w") as f:
            json.dump(cfg, f)

    def env(self, eu=None):
        env = dict(os.environ, AGENT_BOARD_HOME=HOME_TESTE, ORCA_BIN=self.orca, AGENT_BOARD_JANELA_AVISO="0")
        env.pop("ORCA_TERMINAL_HANDLE", None)
        if eu:
            env["ORCA_TERMINAL_HANDLE"] = eu
        return env

    def hook(self, eu, cmd):
        payload = {"hook_event_name": "PreToolUse", "tool_name": "Bash", "tool_input": {"command": cmd}}
        r = subprocess.run([sys.executable, CORE], input=json.dumps(payload), capture_output=True, text=True,
                           env=self.env(eu), timeout=10)
        return json.loads(r.stdout).get("hookSpecificOutput", {})

    def painel(self, *args, eu=None, ok=True):
        r = subprocess.run([sys.executable, PAINEL] + list(args), capture_output=True, text=True,
                           env=self.env(eu), timeout=30)
        if ok:
            self.assertEqual(r.returncode, 0, r.stderr)
        return r

    def avisos(self):
        try:
            with open(os.path.join(HOME_TESTE, "avisos.log")) as f:
                return f.read()
        except FileNotFoundError:
            return ""

    def esperar_chamada(self, trecho, segundos=5):
        fim = time.time() + segundos
        while time.time() < fim:
            if os.path.exists(self.chamadas):
                with open(self.chamadas) as f:
                    if trecho in f.read():
                        return True
            time.sleep(0.1)
        return False


class Hook(Base):
    def test_limite_de_pedidos_abertos_barra_no_hook(self):
        self.gravar_config(config(limites={"pedidos_abertos_max": 1}))
        cmd = "orca orchestration send --to alpha-researcher01-cc --type pedido --subject x"
        self.assertEqual(self.hook("term_g1", cmd).get("permissionDecision"), "allow")
        h = self.hook("term_g1", cmd)
        self.assertEqual(h.get("permissionDecision"), "deny")
        self.assertIn("papel:", h["permissionDecisionReason"])

    def test_papel_roteia_para_o_menos_ocupado(self):
        cmd = "orca orchestration send --to papel:researcher --type pedido --subject x"
        primeiro = self.hook("term_g1", cmd)["updatedInput"]["command"]
        segundo = self.hook("term_g1", cmd)["updatedInput"]["command"]
        self.assertIn("--to term_r ", primeiro)  # empate: ordem alfabética
        self.assertIn("--to term_r2 ", segundo)  # o outro já tem um pedido aberto
        h = self.hook("term_r", "orca orchestration send --to papel:researcher --type aviso --subject x")
        self.assertIn("--to term_r2 ", h["updatedInput"]["command"])  # nunca o próprio remetente
        h = self.hook("term_g1", "orca orchestration send --to papel:designer --type aviso --subject x")
        self.assertIn("Agentes válidos", h.get("permissionDecisionReason", ""))

    def test_ligacoes_barram_no_hook(self):
        self.gravar_config(config(ligacoes=[["manager", "master"]]))
        h = self.hook("term_g1", "orca orchestration send --to alpha-researcher01-cc --type aviso --subject x")
        self.assertEqual(h.get("permissionDecision"), "deny")
        h = self.hook("term_g1", "orca orchestration send --to alpha-master --type aviso --subject x")
        self.assertEqual(h.get("permissionDecision"), "allow")

    def test_ping_pong_avisa_o_master_uma_vez_por_janela(self):
        self.gravar_config(config(limites={"ping_pong_max": 2, "ping_pong_janela_min": 30}))
        for eu, para in (("term_g1", "alpha-manager02-cc"), ("term_g2", "alpha-manager01-cc")) * 3:
            h = self.hook(eu, f"orca orchestration send --to {para} --type aviso --subject x")
            self.assertEqual(h.get("permissionDecision"), "allow")  # ping-pong não barra
        self.assertEqual(self.avisos().count("Ping-pong"), 1)
        self.assertTrue(self.esperar_chamada("--terminal term_m"))

    def test_flags_do_time_nao_vao_ao_orca_e_ficam_no_log(self):
        h = self.hook("term_g1", "orca orchestration send --to alpha-researcher01-cc --type pedido --prazo 30m --subject x")
        cmd = h["updatedInput"]["command"]
        self.assertNotIn("--prazo", cmd)
        self.assertIn("Prazo: ", cmd)
        pedido = registro.ler_log(self.raiz)[-1]
        self.assertIn("prazo", pedido)
        h = self.hook("term_r", f"orca orchestration send --to alpha-manager01-cc --type andamento "
                                f"--responde-a {pedido['id']} --subject metade")
        self.assertIn("--type status", h["updatedInput"]["command"])
        self.assertNotIn("veredito", registro.ler_log(self.raiz)[-1])  # campo novo só quando usado


class Tarefas(Base):
    def montar(self):
        fora = (AGORA - datetime.timedelta(days=1)).isoformat(timespec="seconds")
        dentro = "2999-01-01T00:00:00+00:00"
        for l in (msg("c-aberto", G1, R, "pedido", 60, prazo=dentro),
                  msg("c-andando", G1, R, "pedido", 50),
                  msg("c-and", R, G1, "andamento", 40, responde_a="c-andando"),
                  msg("c-feito", G1, R2, "pedido", 30, prazo=fora),
                  msg("c-r", R2, G1, "resposta", 20, responde_a="c-feito"),
                  msg("c-atrasado", M, G1, "pedido", 15, prazo=fora, modo="executar"),
                  msg("c-e1", G1, M, "entrega", 10), msg("c-e2", G2, M, "entrega", 9), msg("c-e3", G2, M, "entrega", 8),
                  msg("c-v", M, G2, "resposta", 5, responde_a="c-e2", veredito="aprovado"),
                  msg("c-w", M, G2, "resposta", 4, responde_a="c-e3", veredito="rejeitado")):
            registro.gravar_log(self.raiz, l)

    def test_estados(self):
        self.montar()
        js = json.loads(self.painel("tarefas", "--raiz", self.raiz, "--formato", "json").stdout)
        estados = {l["id"]: l["estado"] for l in js}
        self.assertEqual(estados, {"c-aberto": "aberto", "c-andando": "em_andamento", "c-feito": "concluido",
                                   "c-atrasado": "atrasado", "c-e1": "aguardando_revisao", "c-e2": "aprovado",
                                   "c-e3": "rejeitado"})
        out = self.painel("tarefas", "--raiz", self.raiz, "--agente", G2["agente"]).stdout
        self.assertTrue(out.startswith("tarefas[2]{id,de,para,assunto,estado,prazo}:"), out)

    def test_vigiar_escala_uma_vez_e_avisa_o_master(self):
        self.montar()
        out = self.painel("vigiar", "--raiz", self.raiz).stdout
        self.assertIn("c-atrasado atrasado", out)
        self.assertNotIn("c-feito", out)  # respondido não é escalado
        self.assertEqual(registro.status(self.raiz), {"c-atrasado": ["atrasado"]})
        self.assertIn("c-atrasado", [l["id"] for l in registro.ler_log(self.raiz)])  # status não é mensagem
        self.assertTrue(self.esperar_chamada("--terminal term_m"))
        self.assertIn("nenhum pedido atrasado", self.painel("vigiar", "--raiz", self.raiz).stdout)
        self.assertEqual(registro.verificar(self.raiz)["problemas"], [])

    def test_vigiar_e_so_do_master(self):
        r = self.painel("vigiar", "--raiz", self.raiz, eu="term_g1", ok=False)
        self.assertEqual(r.returncode, 1)
        self.assertIn("só do master", r.stderr)


class EntregaFechaPedido(Base):
    """Bug 1.10.1: entrega com --responde-a fecha o pedido que cumpre, e mantém o ciclo próprio."""

    def log_do_teste(self, veredito="aprovado"):
        fim = (AGORA + datetime.timedelta(minutes=-5)).isoformat(timespec="seconds")  # prazo de 20m já vencido
        for l in (msg("c-1", M, G1, "pedido", 40, modo="orquestrar", prazo=fim, assunto="Inventário de páginas"),
                  msg("c-and", G1, M, "andamento", 30, responde_a="c-1"),
                  msg("c-ent", G1, M, "entrega", 20, responde_a="c-1"),
                  msg("c-2", M, G2, "pedido", 40, modo="executar", prazo=fim),
                  msg("c-ent2", G2, M, "entrega", 20, responde_a="c-2"),
                  msg("c-v", M, G1, "resposta", 10, responde_a="c-ent", veredito=veredito)):
            registro.gravar_log(self.raiz, l)

    def estados(self):
        js = json.loads(self.painel("tarefas", "--raiz", self.raiz, "--formato", "json").stdout)
        return {l["id"]: l["estado"] for l in js}

    def test_quadro_pedido_fechado_pela_entrega_e_entrega_com_ciclo_proprio(self):
        self.log_do_teste()
        self.assertEqual(self.estados(), {"c-1": "concluido", "c-ent": "aprovado", "c-2": "concluido",
                                          "c-ent2": "aguardando_revisao"})

    def test_entrega_rejeitada_nao_reabre_o_pedido(self):
        self.log_do_teste("rejeitado")
        e = self.estados()
        self.assertEqual((e["c-1"], e["c-ent"]), ("concluido", "rejeitado"))

    def test_vigiar_nao_escala_pedido_entregue(self):
        self.log_do_teste()
        self.assertIn("nenhum pedido atrasado", self.painel("vigiar", "--raiz", self.raiz).stdout)
        self.assertEqual(registro.status(self.raiz), {})

    def test_pedidos_abertos_e_cobranca_do_stop(self):
        self.log_do_teste()
        msgs = registro.ler_log(self.raiz)
        self.assertEqual(politica.pedidos_abertos(G1["agente"], msgs), [])
        self.assertEqual(politica.pedidos_abertos(G2["agente"], msgs), [])
        self.assertEqual(politica.pendentes(G1["agente"], msgs), [])
        self.assertEqual([l["id"] for l in politica.pendentes(M["agente"], msgs)], ["c-ent2"])  # a entrega é do master

    def test_andamento_depois_da_entrega_e_barrado(self):
        msgs = [msg("c-1", M, G1, "pedido", 5, modo="executar"), msg("c-e", G1, M, "entrega", 3, responde_a="c-1")]
        with self.assertRaises(Barrado):
            validar(config(), G1, M, "andamento", msgs, responde_a="c-1")

    def test_responde_a_da_entrega_e_validado_e_continua_opcional(self):
        msgs = [msg("c-1", M, G1, "pedido", 5, modo="executar"), msg("c-x", M, G2, "pedido", 5, modo="executar")]
        validar(config(), G1, M, "entrega", msgs)  # sem --responde-a, como antes
        validar(config(), G1, M, "entrega", msgs, responde_a="c-1")
        for ruim in ("c-nao-existe", "c-x"):  # inexistente; pedido que outro recebeu
            with self.assertRaises(Barrado):
                validar(config(), G1, M, "entrega", msgs, responde_a=ruim)

    def test_hook_grava_responde_a_da_entrega_e_fecha_o_pedido(self):
        h = self.hook("term_m", "orca orchestration send --to alpha-manager01-cc --type pedido --modo executar "
                                "--prazo 20m --subject x")
        self.assertIn("--type entrega --responde-a", h["updatedInput"]["command"])  # rodapé: os dois caminhos
        self.assertIn("--type resposta --responde-a", h["updatedInput"]["command"])
        cid = registro.ler_log(self.raiz)[-1]["id"]
        self.hook("term_g1", f"orca orchestration send --to alpha-master --type entrega --responde-a {cid} --subject y")
        self.assertEqual(registro.ler_log(self.raiz)[-1]["responde_a"], cid)
        self.assertEqual(self.estados()[cid], "concluido")

    def test_rodape_de_pedido_para_researcher_continua_so_resposta(self):
        h = self.hook("term_g1", "orca orchestration send --to alpha-researcher01-cc --type pedido --subject x")
        cmd = h["updatedInput"]["command"]
        self.assertIn("--type resposta --responde-a", cmd)
        self.assertNotIn("--type entrega", cmd)


class Simular(Base):
    def setUp(self):
        super().setUp()
        for l in (msg("c-1", G1, R, "pedido", 10), msg("c-2", R, G1, "resposta", 5, responde_a="c-1"),
                  msg("c-3", R, M, "escalacao", 4), {"id": "c-1", "ts": "x", "status": "reenviado"}):
            registro.gravar_log(self.raiz, l)
        self.nova = os.path.join(self.tmp, "nova.json")

    def test_config_igual_nao_barra_nada(self):
        with open(self.nova, "w") as f:
            json.dump(config(), f)
        out = self.painel("simular", "--raiz", self.raiz, "--config", self.nova).stdout
        self.assertIn("0 de 3", out)

    def test_config_nova_lista_o_que_seria_barrado(self):
        with open(self.nova, "w") as f:
            json.dump(config(ligacoes=[["master", "manager"]]), f)
        r = self.painel("simular", "--raiz", self.raiz, "--config", self.nova, ok=False)
        self.assertEqual(r.returncode, 1)
        self.assertIn("barradas[1]{id,de,para,tipo,motivo,config_atual}:", r.stdout)
        self.assertIn("c-1,", r.stdout)
        self.assertIn("não tem ligação", r.stdout)
        self.assertIn(",passa", r.stdout)

    def test_simular_log_puro(self):
        msgs = [msg("c-e", G1, M, "entrega", 3), msg("c-r", M, G1, "resposta", 2, responde_a="c-e")]
        barradas, _ = cmd_tarefas.simular_log(msgs, config(), config())
        self.assertEqual([b["id"] for b in barradas], ["c-r"])  # resposta a entrega sem veredito
        self.assertEqual(barradas[0]["config_atual"], "barrada")


if __name__ == "__main__":
    try:
        unittest.main(verbosity=1)
    finally:
        shutil.rmtree(HOME_TESTE, ignore_errors=True)
