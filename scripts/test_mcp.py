#!/usr/bin/env python3
"""Testes do servidor MCP: sobe o mcp_server.py e conversa por stdin/stdout, com um orca falso.

  python3 scripts/test_mcp.py
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
HOME_TESTE = tempfile.mkdtemp(prefix="agent-board-mcp-")
os.environ["AGENT_BOARD_HOME"] = HOME_TESTE  # antes de importar base
sys.path.insert(0, AQUI)

import hook_core  # noqa: E402
import registro  # noqa: E402

CONFIG = os.path.join(AQUI, "..", "templates", "agent-board.json")
SERVIDOR = os.path.join(AQUI, "mcp_server.py")
M, G, R = "term_m1", "term_g1", "term_r1"


class Servidor(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="agent-board-mcp-t-")
        self.raiz = os.path.join(self.tmp, "alpha")
        os.makedirs(os.path.join(self.raiz, "docs/agent-board"))
        with open(CONFIG) as f:
            cfg = json.load(f)
        cfg["projeto"], cfg["prefixo"] = "alpha", "alpha"
        with open(os.path.join(self.raiz, "docs/agent-board/agent-board.json"), "w") as f:
            json.dump(cfg, f)
        p = lambda ag, pap: {"projeto": "alpha", "agente": ag, "papel": pap, "raiz": self.raiz}  # noqa: E731
        paineis = {M: p("alpha-master", "master"), G: p("alpha-manager01-cc", "manager"),
                   R: p("alpha-researcher01-cc", "researcher")}
        with open(os.path.join(HOME_TESTE, "paineis.json"), "w") as f:
            json.dump({"versao": 1, "paineis": paineis}, f)
        self.chamadas = os.path.join(self.tmp, "chamadas")
        self.orca = self.orca_falso("orca", 'echo "Sent msg_1"')

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def orca_falso(self, nome, envio):
        """Grava cada chamada; `check` imprime a caixa, o resto roda `envio`."""
        caminho = os.path.join(self.tmp, nome)
        with open(caminho, "w") as f:
            f.write(f'#!/bin/bash\nprintf "%s\\n" "$*" >> {self.chamadas}\n'
                    f'if [ "$2" = check ]; then echo "caixa de $4: 1 mensagem"; exit 0; fi\n{envio}\n')
        os.chmod(caminho, 0o755)
        return caminho

    def conversar(self, eu, *msgs, orca=None):
        """Manda as mensagens numa sessão só e devolve {id: resposta} (e as linhas cruas)."""
        env = dict(os.environ, AGENT_BOARD_HOME=HOME_TESTE, ORCA_BIN=orca or self.orca,
                   AGENT_BOARD_JANELA_AVISO="0")
        env.pop("ORCA_TERMINAL_HANDLE", None)
        if eu:
            env["ORCA_TERMINAL_HANDLE"] = eu
        entrada = "".join(json.dumps(m) + "\n" for m in msgs)
        r = subprocess.run([sys.executable, SERVIDOR], input=entrada, capture_output=True, text=True,
                           env=env, timeout=30)
        self.assertEqual(r.returncode, 0, r.stderr)
        linhas = [json.loads(l) for l in r.stdout.splitlines()]  # stdout só com protocolo
        return {l.get("id"): l for l in linhas}, linhas

    def chamar(self, eu, nome, args=None, orca=None):
        resp, _ = self.conversar(eu, {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                                      "params": {"name": nome, "arguments": args or {}}}, orca=orca)
        return resp[1]

    def texto(self, resp):
        self.assertIn("result", resp, resp)
        return resp["result"]["content"][0]["text"]

    def envios(self):
        try:
            with open(self.chamadas) as f:
                return [l for l in f.read().splitlines() if l.startswith("orchestration send")]
        except FileNotFoundError:
            return []


class Protocolo(Servidor):
    def test_initialize_negocia_versao_e_ignora_notificacao(self):
        resp, linhas = self.conversar(
            M,
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05"}},
            {"jsonrpc": "2.0", "method": "notifications/initialized"},
            {"jsonrpc": "2.0", "id": 2, "method": "initialize", "params": {"protocolVersion": "1999-01-01"}},
            {"jsonrpc": "2.0", "id": 3, "method": "ping"})
        self.assertEqual(len(linhas), 3)  # notificação não tem resposta
        self.assertEqual(resp[1]["result"]["protocolVersion"], "2024-11-05")
        self.assertEqual(resp[1]["result"]["serverInfo"]["name"], "agent-board")
        self.assertIn("tools", resp[1]["result"]["capabilities"])
        self.assertEqual(resp[2]["result"]["protocolVersion"], "2025-06-18")
        self.assertEqual(resp[3]["result"], {})

    def test_tools_list_com_schema(self):
        resp, _ = self.conversar(M, {"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
        tools = {t["name"]: t for t in resp[1]["result"]["tools"]}
        self.assertEqual(set(tools), {"board_send", "board_inbox", "board_pendentes", "board_historico",
                                      "board_status"})
        send = tools["board_send"]["inputSchema"]
        self.assertEqual(send["required"], ["para", "tipo", "assunto"])
        self.assertEqual(send["properties"]["tipo"]["enum"], list(hook_core.TIPOS))
        self.assertEqual(send["properties"]["modo"]["enum"], ["orquestrar", "executar"])
        self.assertEqual(send["properties"]["veredito"]["enum"], ["aprovado", "rejeitado"])
        self.assertIn("responde_a", tools["board_send"]["description"])
        for t in tools.values():
            self.assertEqual(t["inputSchema"]["type"], "object")
            self.assertTrue(t["description"])

    def test_metodo_desconhecido_e_parametros_invalidos(self):
        resp, _ = self.conversar(
            M,
            {"jsonrpc": "2.0", "id": 1, "method": "resources/list"},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "board_nada"}},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call",
             "params": {"name": "board_send", "arguments": {"para": "alpha-master"}}},
            {"jsonrpc": "2.0", "id": 4, "method": "tools/call",
             "params": {"name": "board_send", "arguments": {"para": "x", "tipo": "fofoca", "assunto": "y"}}},
            {"jsonrpc": "2.0", "id": 5, "method": "tools/call",
             "params": {"name": "board_historico", "arguments": {"n": "dez"}}})
        self.assertEqual(resp[1]["error"]["code"], -32601)
        for i in (2, 3, 4, 5):
            self.assertEqual(resp[i]["error"]["code"], -32602, resp[i])
        self.assertIn("tipo", resp[3]["error"]["message"])
        self.assertIn("fofoca", resp[4]["error"]["message"])

    def test_json_ilegivel(self):
        env = dict(os.environ, AGENT_BOARD_HOME=HOME_TESTE)
        r = subprocess.run([sys.executable, SERVIDOR], input="{nada\n", capture_output=True, text=True, env=env,
                           timeout=30)
        self.assertEqual(json.loads(r.stdout)["error"]["code"], -32700)


class Envio(Servidor):
    def test_send_permitido_chega_ao_orca_e_ao_log(self):
        r = self.chamar(G, "board_send", {"para": "researcher01-cc", "tipo": "pedido", "assunto": "Analisar",
                                          "corpo": "texto com 'aspas' e \"duplas\" e --- traço",
                                          "issues": [412, 413]})
        self.assertFalse(r["result"]["isError"], r)
        envios = self.envios()
        self.assertEqual(len(envios), 1)
        self.assertIn("--to term_r1 --from term_g1 --type handoff", envios[0])
        log = registro.ler_log(self.raiz)
        self.assertEqual(len(log), 1)
        self.assertEqual(log[0]["issues"], [412, 413])
        self.assertTrue(self.texto(r).startswith(log[0]["id"] + " enviada"))

    def test_send_barrado_nao_chega_ao_orca(self):
        r = self.chamar(R, "board_send", {"para": "alpha-manager01-cc", "tipo": "pedido", "modo": "executar",
                                          "assunto": "x"})
        self.assertTrue(r["result"]["isError"])
        self.assertIn("não envia 'pedido'", self.texto(r))
        self.assertEqual(self.envios(), [])
        self.assertEqual(registro.ler_log(self.raiz), [])

    def test_pedido_a_manager_sem_modo_barrado(self):
        r = self.chamar(M, "board_send", {"para": "alpha-manager01-cc", "tipo": "pedido", "assunto": "x"})
        self.assertTrue(r["result"]["isError"])
        self.assertIn("--modo", self.texto(r))

    def test_resposta_sem_responde_a_barrada_e_com_responde_a_passa(self):
        r = self.chamar(R, "board_send", {"para": "alpha-master", "tipo": "resposta", "assunto": "Feito"})
        self.assertTrue(r["result"]["isError"])
        self.assertIn("--responde-a", self.texto(r))
        registro.gravar_log(self.raiz, {"id": "c-1", "ts": "2026-10-01T10:00:00-03:00", "de": "alpha-master",
                                        "para": "alpha-researcher01-cc", "tipo": "pedido", "assunto": "x"})
        r = self.chamar(R, "board_send", {"para": "alpha-master", "tipo": "resposta", "assunto": "Feito",
                                          "responde_a": "c-1"})
        self.assertFalse(r["result"]["isError"], r)
        self.assertEqual(len(self.envios()), 1)
        self.assertEqual(registro.ler_log(self.raiz)[-1]["responde_a"], "c-1")

    def test_prazo_e_veredito_so_quando_preenchidos(self):
        self.chamar(G, "board_send", {"para": "alpha-master", "tipo": "entrega", "assunto": "Pronto"})
        self.assertNotIn("--prazo", self.envios()[0])
        self.chamar(G, "board_send", {"para": "alpha-master", "tipo": "entrega", "assunto": "Pronto",
                                      "prazo": "2026-10-20", "veredito": "aprovado"})
        self.assertIn("--prazo 2026-10-20", self.envios()[1])
        self.assertIn("--veredito aprovado", self.envios()[1])

    def test_envio_que_falhou_sai_do_log_ativo(self):
        ruim = self.orca_falso("orca-ruim", 'echo "error: terminal not found" >&2; exit 1')
        r = self.chamar(M, "board_send", {"para": "alpha-researcher01-cc", "tipo": "aviso", "assunto": "x"},
                        orca=ruim)
        self.assertTrue(r["result"]["isError"])
        self.assertIn("NÃO entregue", self.texto(r))
        self.assertEqual(registro.ler_log(self.raiz), [])


class Leitura(Servidor):
    def setUp(self):
        super().setUp()
        registro.gravar_log(self.raiz, {"id": "c-1", "ts": "2026-10-01T10:00:00-03:00", "de": "alpha-master",
                                        "para": "alpha-manager01-cc", "tipo": "pedido", "modo": "executar",
                                        "assunto": "Frente A", "issues": [7]})
        registro.gravar_log(self.raiz, {"id": "c-2", "ts": "2026-10-01T10:05:00-03:00", "de": "alpha-master",
                                        "para": "alpha-researcher01-cc", "tipo": "aviso", "assunto": "Pagamentos"})

    def test_historico_em_toon(self):
        t = self.texto(self.chamar(M, "board_historico"))
        self.assertTrue(t.startswith("mensagens[2]{id,ts,de,para,tipo,modo,assunto,responde_a,issues}:"), t)
        t = self.texto(self.chamar(M, "board_historico", {"sobre": "pagam", "n": 5}))
        self.assertTrue(t.startswith("mensagens[1]"), t)
        self.assertIn("c-2,", t)
        t = self.texto(self.chamar(M, "board_historico", {"agente": "alpha-manager01-cc"}))
        self.assertIn("c-1,", t)
        self.assertNotIn("c-2,", t)

    def test_pendentes(self):
        t = self.texto(self.chamar(G, "board_pendentes"))
        self.assertTrue(t.startswith("pendentes[1]{id,ts,de,tipo,modo,assunto,issues}:"), t)
        self.assertIn("c-1,", t)
        self.assertEqual(self.texto(self.chamar(M, "board_pendentes")), "pendentes[0]:")

    def test_status(self):
        t = self.texto(self.chamar(G, "board_status"))
        self.assertIn("agente: alpha-manager01-cc", t)
        self.assertIn("papel: manager", t)
        self.assertIn("projeto: alpha", t)
        self.assertIn("pendentes: 1", t)
        self.assertIn("versao: ", t)
        self.assertIn("agentes[3]{agente,papel,handle}:", t)

    def test_inbox(self):
        r = self.chamar(G, "board_inbox")
        self.assertFalse(r["result"]["isError"])
        self.assertIn("caixa de term_g1", self.texto(r))
        with open(self.chamadas) as f:
            self.assertIn("orchestration check --terminal term_g1 --format", f.read())

    def test_painel_sem_cadastro(self):
        for nome in ("board_status", "board_pendentes", "board_inbox", "board_historico"):
            r = self.chamar("term_orfao", nome)
            self.assertTrue(r["result"]["isError"], nome)
            self.assertIn("master", self.texto(r))
            self.assertIn("cadastr", self.texto(r))
        r = self.chamar("term_orfao", "board_send", {"para": "alpha-master", "tipo": "aviso", "assunto": "x"})
        self.assertTrue(r["result"]["isError"])
        self.assertEqual(self.envios(), [])


if __name__ == "__main__":
    try:
        unittest.main(verbosity=1)
    finally:
        shutil.rmtree(HOME_TESTE, ignore_errors=True)
