#!/usr/bin/env python3
"""Testes do adaptador do OMP (omp-agent-board.ts) rodando o arquivo de verdade no bun.

Um harness pequeno importa o módulo com um objeto `pi` falso e dispara eventos com o formato do OMP
(tool_call, tool_result, session_stop). O core roda de verdade, com cadastro, log e orca falsos em
pasta temporária. Sem o bun no PATH, a suíte é pulada.

  python3 scripts/test_omp.py
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
ADAPTADOR = os.path.join(AQUI, "omp-agent-board.ts")
CORE = os.path.join(AQUI, "hook_core.py")
CONFIG = os.path.join(AQUI, "..", "templates", "agent-board.json")
BUN = shutil.which("bun")

HARNESS = """
const mod = await import(process.argv[2]);
const handlers: Record<string, Function> = {};
mod.default({ on: (nome: string, h: Function) => { handlers[nome] = h; } });
const passos = JSON.parse(await Bun.stdin.text());
const saidas: any[] = [];
for (const p of passos) {
  const ctx = { cwd: p.cwd ?? process.cwd(), agent: p.agent ?? { kind: "main", id: "Main", name: "main", depth: 0 } };
  saidas.push((await handlers[p.evento](p.event, ctx)) ?? null);
}
console.log(JSON.stringify(saidas));
"""

MASTER, G1, R = "term_m", "term_g1", "term_r"
SUB = {"kind": "sub", "id": "0-Explore", "name": "explore", "depth": 1, "parentId": "Main"}


def tool_call(nome, entrada, tid="call_1"):
    return {"evento": "tool_call", "event": {"type": "tool_call", "toolName": nome, "toolCallId": tid, "input": entrada}}


def bash(cmd, tid="call_1", **extra):
    return tool_call("bash", dict({"command": cmd}, **extra), tid)


@unittest.skipUnless(BUN, "bun não está instalado: o OMP roda em bun, sem ele não há como executar o adaptador")
class AdaptadorOmp(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="agent-board-omp-")
        self.home = os.path.join(self.tmp, "ab")
        self.raiz = os.path.join(self.tmp, "alpha")
        os.makedirs(self.home)
        os.makedirs(os.path.join(self.raiz, "docs/agent-board"))
        with open(CONFIG) as f:
            cfg = json.load(f)
        cfg["projeto"], cfg["prefixo"] = "alpha", "alpha"
        with open(os.path.join(self.raiz, "docs/agent-board/agent-board.json"), "w") as f:
            json.dump(cfg, f)
        p = lambda ag, pap: {"projeto": "alpha", "agente": ag, "papel": pap, "raiz": self.raiz}
        paineis = {MASTER: p("alpha-master", "master"), G1: p("alpha-manager01-omp", "manager"),
                   R: p("alpha-researcher01-omp", "researcher")}
        with open(os.path.join(self.home, "paineis.json"), "w") as f:
            json.dump({"versao": 1, "paineis": paineis}, f)
        self.chamadas = os.path.join(self.tmp, "orca-chamadas.txt")
        self.orca = os.path.join(self.tmp, "orca")
        with open(self.orca, "w") as f:
            f.write(f'#!/bin/bash\nprintf "%s\\n" "$*" >> {self.chamadas}\n')
        os.chmod(self.orca, 0o755)
        self.harness = os.path.join(self.tmp, "harness.ts")
        with open(self.harness, "w") as f:
            f.write(HARNESS)
        self.log = os.path.join(self.raiz, "docs/agent-board/comunicacoes.jsonl")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def rodar(self, handle, passos, **env_extra):
        env = {k: v for k, v in os.environ.items() if not k.startswith(("ORCA_", "AGENT_BOARD_", "MAESTRI_"))}
        env.update(dict(AGENT_BOARD_HOME=self.home, AGENT_BOARD_CORE=CORE, ORCA_BIN=self.orca,
                        AGENT_BOARD_JANELA_AVISO="0"), **env_extra)
        if handle:
            env["ORCA_TERMINAL_HANDLE"] = handle
        r = subprocess.run([BUN, "run", self.harness, ADAPTADOR], input=json.dumps(passos), capture_output=True,
                           text=True, env=env, timeout=60, cwd=self.raiz)
        self.assertEqual(r.returncode, 0, r.stderr)
        return json.loads(r.stdout.strip().splitlines()[-1])

    def um(self, handle, passo, **env_extra):
        return self.rodar(handle, [passo], **env_extra)[0]

    def esperar_chamada(self, trecho, segundos=8):
        fim = time.time() + segundos
        while time.time() < fim:
            if os.path.exists(self.chamadas):
                with open(self.chamadas) as f:
                    if trecho in f.read():
                        return True
            time.sleep(0.1)
        return False

    def avisos(self):
        try:
            with open(os.path.join(self.home, "avisos.log")) as f:
                return f.read()
        except FileNotFoundError:
            return ""

    PEDIDO = ('orca orchestration send --to alpha-researcher01-omp --type pedido --modo executar '
              '--subject "Analisar" --body "texto"')

    # --- envio -----------------------------------------------------------------------------------
    def test_envio_por_nome_vira_handle_e_devolve_argumentos_completos(self):
        saida = self.um(G1, bash(self.PEDIDO, timeout=30, cwd="/tmp"))
        self.assertNotIn("block", saida)
        entrada = saida["input"]
        self.assertIn("--to term_r ", entrada["command"])
        self.assertIn("--from term_g1 ", entrada["command"])
        # o OMP troca TODOS os argumentos: o que não é command tem que voltar junto
        self.assertEqual((entrada["timeout"], entrada["cwd"]), (30, "/tmp"))
        self.assertEqual(sorted(entrada), ["command", "cwd", "timeout"])
        with open(self.log) as f:
            self.assertIn('"para": "alpha-researcher01-omp"', f.read())

    def test_envio_para_fora_do_time_e_barrado(self):
        saida = self.um(G1, bash("orca orchestration send --to alpha-manager09-omp --type aviso --subject x"))
        self.assertIs(saida["block"], True)
        self.assertIn("não é um agente cadastrado", saida["reason"])
        saida = self.um(G1, bash("orca orchestration send --to term_externo --type aviso --subject x"))
        self.assertIs(saida["block"], True)

    def test_comando_sem_relacao_com_o_time_passa_sem_chamar_o_core(self):
        quebrado = os.path.join(self.tmp, "quebrado.py")
        with open(quebrado, "w") as f:
            f.write("import sys; sys.exit(3)\n")
        self.assertIsNone(self.um(G1, bash("ls -la"), AGENT_BOARD_CORE=quebrado))
        self.assertIsNone(self.um(G1, tool_call("read", {"path": "docs/agent-board/comunicacoes.jsonl"}),
                                  AGENT_BOARD_CORE=quebrado))

    def test_core_quebrado_num_envio_barra(self):
        quebrado = os.path.join(self.tmp, "quebrado.py")
        with open(quebrado, "w") as f:
            f.write("import sys; sys.exit(3)\n")
        saida = self.um(G1, bash(self.PEDIDO), AGENT_BOARD_CORE=quebrado)
        self.assertIs(saida["block"], True)
        self.assertIn("hook agent-board falhou", saida["reason"])
        saida = self.um(G1, bash(self.PEDIDO), AGENT_BOARD_PYTHON="/nao/existe/python3")
        self.assertIs(saida["block"], True)

    def test_core_que_responde_lixo_num_envio_barra(self):
        lixo = os.path.join(self.tmp, "lixo.py")
        with open(lixo, "w") as f:
            f.write("print('não é json')\n")
        self.assertIs(self.um(G1, bash(self.PEDIDO), AGENT_BOARD_CORE=lixo)["block"], True)

    # --- log e cadastro --------------------------------------------------------------------------
    def test_edicao_a_mao_do_log_e_do_cadastro_e_barrada(self):
        casos = [
            tool_call("edit", {"path": self.log, "edits": []}),
            tool_call("write", {"path": os.path.join(self.home, "paineis.json"), "content": "{}"}),
            # modo hashline: o OMP entrega o alvo em path e paths (derivados do cabeçalho do patch)
            tool_call("edit", {"input": f"[{self.log}#ab12]\n+x", "path": self.log, "paths": [self.log]}),
            # vários arquivos: só paths[], sem path
            tool_call("edit", {"input": "x", "paths": ["README.md", self.log]}),
            tool_call("ast_edit", {"paths": [self.log], "ops": []}),
            tool_call("eval", {"input": f"open('{self.log}', 'a').write('{{}}')", "language": "py"}),
        ]
        for passo in casos:
            for handle in (G1, MASTER):
                saida = self.um(handle, passo)
                self.assertIs(saida and saida.get("block"), True, passo)
                self.assertIn("não se edita à mão", saida["reason"])

    def test_edicao_de_outros_arquivos_e_leitura_do_log_passam(self):
        self.assertIsNone(self.um(G1, tool_call("write", {"path": "/tmp/x/notas.md", "content": "cita comunicacoes.jsonl"})))
        self.assertIsNone(self.um(G1, tool_call("edit", {"path": "src/app.py", "edits": []})))
        self.assertIsNone(self.um(G1, tool_call("read", {"path": self.log})))
        self.assertIsNone(self.um(G1, bash(f"cat {self.log} | tail -3")))

    def test_bash_escrevendo_no_log_e_barrado(self):
        saida = self.um(G1, bash(f"echo '{{}}' >> {self.log}"))
        self.assertIs(saida["block"], True)

    def test_painel_fora_do_time_pode_editar(self):
        self.assertIsNone(self.um("term_orfao", tool_call("write", {"path": self.log, "content": "x"})))

    # --- subagent --------------------------------------------------------------------------------
    def test_subagent_nao_envia_pelo_shell_nem_pelo_mcp(self):
        passo = dict(bash(self.PEDIDO), agent=SUB)
        saida = self.um(G1, passo)
        self.assertIs(saida["block"], True)
        self.assertIn("subagent", saida["reason"])
        mcp = dict(tool_call("mcp__agent-board_board_send", {"para": "alpha-researcher01-omp"}), agent=SUB)
        self.assertIs(self.um(G1, mcp)["block"], True)
        # a sessão principal passa (a regra do envio vive no envio.py)
        self.assertIsNone(self.um(G1, tool_call("mcp__agent-board_board_send", {"para": "alpha-researcher01-omp"})))

    # --- tool_result: aviso digitado no destino --------------------------------------------------
    def resultado(self, texto, erro=False, tid="call_7"):
        return {"evento": "tool_result", "event": {
            "type": "tool_result", "toolName": "bash", "toolCallId": tid, "isError": erro,
            "input": {"command": self.PEDIDO}, "content": [{"type": "text", "text": texto}], "details": None}}

    def test_resultado_do_envio_digita_o_aviso_no_destino(self):
        self.rodar(G1, [bash(self.PEDIDO, tid="call_7"), self.resultado("Sent msg_9 to term_r")])
        self.assertTrue(self.esperar_chamada("terminal send --terminal term_r"), self.avisos())
        with open(self.chamadas) as f:
            self.assertIn("Nova mensagem c-", f.read())

    def test_envio_que_falhou_nao_digita_aviso(self):
        self.rodar(G1, [bash(self.PEDIDO, tid="call_8"), self.resultado("boom", erro=True, tid="call_8")])
        fim = time.time() + 8
        while time.time() < fim and "envio falhou" not in self.avisos():
            time.sleep(0.1)
        self.assertIn("envio falhou", self.avisos())
        self.assertFalse(os.path.exists(self.chamadas))

    # --- session_stop ----------------------------------------------------------------------------
    def stop(self, ativo=False):
        return {"evento": "session_stop", "event": {"type": "session_stop", "stop_hook_active": ativo,
                                                      "session_id": "s1", "turn_id": 0, "messages": []}}

    def test_stop_cobra_resposta_e_o_laco_para(self):
        self.um(G1, bash(self.PEDIDO))  # o pedido entra no log; o researcher não respondeu
        primeira = self.um(R, self.stop())
        self.assertEqual(primeira["decision"], "block")
        self.assertIn("alpha-manager01-omp", primeira["reason"])
        self.assertIn("--responde-a", primeira["reason"])
        # as 3 cobranças seguram; a 4a deixa encerrar (o OMP não limita o block: o teto é do core)
        saidas = [self.um(R, self.stop(ativo=True)) for _ in range(3)]
        self.assertEqual([s and s["decision"] for s in saidas], ["block", "block", None])
        self.assertIn("sem resposta", self.avisos())

    def test_stop_sem_pendencia_ou_fora_do_time_encerra(self):
        self.assertIsNone(self.um(R, self.stop()))
        self.assertIsNone(self.um("term_orfao", self.stop()))
        self.um(G1, bash(self.PEDIDO))
        self.assertIsNone(self.um(R, dict(self.stop(), agent=SUB)))


if __name__ == "__main__":
    unittest.main(verbosity=1)
