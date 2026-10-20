#!/usr/bin/env python3
"""Testes do coletor de sub-agents (subagentes.py + ganchos do hook_core + install.sh + adaptador OMP).

Tudo em pasta temporária: AGENT_BOARD_HOME, HOME e settings falsos. Nada toca a instalação viva.

  python3 scripts/test_subagentes.py
"""
import datetime
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
CORE = os.path.join(AQUI, "hook_core.py")
INSTALL = os.path.join(AQUI, "install.sh")
ADAPTADOR = os.path.join(AQUI, "omp-agent-board.ts")
BUN = shutil.which("bun")

G1 = "term_man01cc"
ORFAO = "term_sem_cadastro"
SESSAO = "sess-1"


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="agent-board-sub-")
        self.home = os.path.join(self.tmp, "ab")
        os.makedirs(self.home)
        with open(os.path.join(self.home, "paineis.json"), "w") as f:
            json.dump({"versao": 1, "paineis": {
                G1: {"projeto": "alpha", "agente": "alpha-manager01-cc", "papel": "manager", "raiz": self.tmp}}}, f)

    def tearDown(self):
        os.chmod(self.home, 0o755)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def rodar(self, payload, handle=G1):
        env = {k: v for k, v in os.environ.items() if not k.startswith(("ORCA_", "AGENT_BOARD_", "MAESTRI_"))}
        env["AGENT_BOARD_HOME"] = self.home
        if handle:
            env["ORCA_TERMINAL_HANDLE"] = handle
        r = subprocess.run([sys.executable, CORE, "--dialect", "claude"], input=json.dumps(payload),
                           capture_output=True, text=True, env=env, timeout=10)
        self.assertEqual(r.returncode, 0, r.stderr)
        return json.loads(r.stdout)

    def arquivos(self, projeto="alpha"):
        pasta = os.path.join(self.home, "subagentes", projeto)
        return sorted(os.listdir(pasta)) if os.path.isdir(pasta) else []

    def linhas(self, projeto="alpha"):
        out = []
        for nome in self.arquivos(projeto):
            with open(os.path.join(self.home, "subagentes", projeto, nome)) as f:
                out += [json.loads(l) for l in f if l.strip()]
        return out

    def hoje(self):
        return datetime.datetime.now().astimezone().date().isoformat()


def pre_agent(**entrada):
    return {"hook_event_name": "PreToolUse", "tool_name": "Agent", "session_id": SESSAO, "tool_input": entrada}


def bash_sub(cmd, **extra):
    p = {"hook_event_name": "PreToolUse", "tool_name": "Bash", "session_id": SESSAO,
         "agent_id": "agent-abc", "agent_type": "Explore", "tool_input": {"command": cmd}}
    p.update(extra)
    return p


class Eventos(Base):
    def test_spawn(self):
        saida = self.rodar(pre_agent(description="Mapear o módulo", subagent_type="Explore",
                                     run_in_background=True, prompt="PROMPT SECRETO ENORME"))
        self.assertEqual(saida, {})
        (l,) = self.linhas()
        self.assertEqual((l["ev"], l["agente"], l["sessao"], l["id"], l["tipo"], l["descricao"], l["fundo"]),
                         ("spawn", "alpha-manager01-cc", SESSAO, None, "Explore", "Mapear o módulo", True))
        self.assertRegex(l["ts"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$")
        self.assertNotIn("PROMPT", json.dumps(l))

    def test_spawn_com_tool_task_antiga_e_sem_fundo(self):
        p = pre_agent(description="x", subagent_type="general-purpose")
        p["tool_name"] = "Task"
        self.rodar(p)
        self.assertIs(self.linhas()[0]["fundo"], False)

    def test_inicio_e_fim(self):
        base = {"session_id": SESSAO, "agent_id": "agent-abc", "agent_type": "Explore"}
        self.assertEqual(self.rodar(dict(base, hook_event_name="SubagentStart")), {})
        self.assertEqual(self.rodar(dict(base, hook_event_name="SubagentStop", agent_transcript_path="/x/y.jsonl",
                                         last_assistant_message="resultado longo")), {})
        i, f = self.linhas()
        self.assertEqual((i["ev"], i["id"], i["tipo"], i["sessao"]), ("inicio", "agent-abc", "Explore", SESSAO))
        self.assertEqual((f["ev"], f["id"], f["tipo"]), ("fim", "agent-abc", "Explore"))
        self.assertNotIn("resultado longo", json.dumps(f))

    def test_retorno_ok_e_erro(self):
        def post(evento="PostToolUse", **extra):
            p = {"hook_event_name": evento, "tool_name": "Agent", "session_id": SESSAO,
                 "tool_input": {"subagent_type": "Explore"}}
            p.update(extra)
            self.rodar(p)
        post(tool_response={"status": "completed", "agentId": "agent-abc", "content": "ok"})
        post(tool_response={"status": "async_launched", "agentId": "agent-abc"})
        post("PostToolUseFailure", error="boom")
        post(tool_response={"status": "failed"})
        post(tool_response={"is_error": True})
        post(tool_response="Error: sem permissão")
        post(tool_response="feito, sem erros")
        self.assertEqual([l["ok"] for l in self.linhas()], [True, True, False, False, False, False, True])
        self.assertEqual({l["ev"] for l in self.linhas()}, {"retorno"})
        self.assertEqual(self.linhas()[0]["tipo"], "Explore")
        self.assertIsNone(self.linhas()[0]["id"])

    def test_atividade_so_com_agent_id(self):
        self.rodar(bash_sub("ls -la"))
        sem_id = bash_sub("ls")
        del sem_id["agent_id"], sem_id["agent_type"]
        self.rodar(sem_id)
        (l,) = self.linhas()
        self.assertEqual((l["ev"], l["id"], l["tipo"], l["ferramenta"], l["resumo"]),
                         ("atividade", "agent-abc", "Explore", "Bash", "ls -la"))

    def test_atividade_edit_e_write_usam_o_caminho(self):
        for nome in ("Edit", "Write"):
            self.rodar({"hook_event_name": "PreToolUse", "tool_name": nome, "session_id": SESSAO,
                        "agent_id": "a1", "agent_type": "x",
                        "tool_input": {"file_path": "/srv/app/main.py", "content": "SEGREDO DO ARQUIVO"}})
        self.assertEqual([(l["ferramenta"], l["resumo"]) for l in self.linhas()],
                         [("Edit", "/srv/app/main.py"), ("Write", "/srv/app/main.py")])

    def test_outras_ferramentas_de_sub_nao_geram_atividade(self):
        self.rodar({"hook_event_name": "PreToolUse", "tool_name": "Read", "agent_id": "a1",
                    "tool_input": {"file_path": "/x"}})
        self.rodar(dict(bash_sub("ls"), hook_event_name="PostToolUse"))
        self.assertEqual(self.linhas(), [])

    def test_terminal_sem_cadastro_nao_grava(self):
        self.rodar(pre_agent(description="x"), handle=ORFAO)
        self.rodar(bash_sub("ls"), handle=ORFAO)
        self.rodar(bash_sub("ls"), handle=None)
        self.assertFalse(os.path.exists(os.path.join(self.home, "subagentes")))

    def test_arquivo_600_e_pasta_do_projeto(self):
        self.rodar(bash_sub("ls"))
        self.assertEqual(self.arquivos(), [self.hoje() + ".jsonl"])
        modo = stat.S_IMODE(os.stat(os.path.join(self.home, "subagentes", "alpha", self.arquivos()[0])).st_mode)
        self.assertEqual(modo, 0o600)

    def test_projeto_com_caminho_malicioso_fica_dentro_da_pasta(self):
        with open(os.path.join(self.home, "paineis.json"), "w") as f:
            json.dump({"versao": 1, "paineis": {G1: {"projeto": "../../fora", "agente": "a-b"}}}, f)
        self.rodar(bash_sub("ls"))
        self.assertFalse(os.path.exists(os.path.join(self.tmp, "fora")))
        pastas = [d for d in os.listdir(os.path.join(self.home, "subagentes")) if not d.startswith(".")]
        self.assertEqual(len(pastas), 1)


class Conteudo(Base):
    def test_mascara_de_segredos_no_resumo_e_na_descricao(self):
        segredos = ["sk-abcdefghijklmnopqrstuvwx", "ghp_abcdefghijklmnopqrstuvwx", "github_pat_abcdefghijklmnopqrstuv",
                    "AKIAABCDEFGHIJKLMNOP", "AIza" + "a" * 35, "xoxb-1234567890-abcdef",
                    "eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.abcdefghijkl", "Bearer abcdef123456",
                    "password=hunter22", "senha=hunter22", "token=hunter22", "secret=hunter22", "api_key=hunter22"]
        for s in segredos:
            self.rodar(bash_sub(f"curl -H x {s} http://a"))
        self.rodar(pre_agent(description=f"usar {segredos[0]}"))
        texto = json.dumps(self.linhas())
        for s in segredos:
            self.assertNotIn(s.split("=")[-1].split(" ")[-1], texto, s)
        self.assertIn("[oculto]", texto)

    def test_truncamento(self):
        self.rodar(bash_sub("a" * 500))
        self.rodar(pre_agent(description="d " * 200))
        a, s = self.linhas()
        self.assertLessEqual(len(a["resumo"]), 160)
        self.assertLessEqual(len(s["descricao"]), 120)
        self.assertTrue(a["resumo"].endswith("…"))

    def test_quebra_de_linha_vira_espaco(self):
        self.rodar(bash_sub("echo a\n  echo b"))
        self.assertEqual(self.linhas()[0]["resumo"], "echo a echo b")


class Retencao(Base):
    def criar(self, dias_atras, projeto="alpha"):
        d = datetime.datetime.now().astimezone().date() - datetime.timedelta(days=dias_atras)
        pasta = os.path.join(self.home, "subagentes", projeto)
        os.makedirs(pasta, exist_ok=True)
        caminho = os.path.join(pasta, d.isoformat() + ".jsonl")
        with open(caminho, "w") as f:
            f.write("{}\n")
        return os.path.basename(caminho)

    def test_apaga_so_o_que_passou_de_14_dias_uma_vez_por_dia(self):
        velho, limite, novo = self.criar(15), self.criar(14), self.criar(2)
        self.criar(20, "beta")
        self.rodar(bash_sub("ls"))
        self.assertEqual(self.arquivos(), sorted([limite, novo, self.hoje() + ".jsonl"]))
        self.assertEqual(self.arquivos("beta"), [])
        self.assertNotIn(velho, self.arquivos())
        # segunda execução no mesmo dia não limpa de novo (marcador)
        velho2 = self.criar(30)
        self.rodar(bash_sub("ls"))
        self.assertIn(velho2, self.arquivos())

    def test_nao_apaga_o_que_nao_e_arquivo_de_dia(self):
        pasta = os.path.join(self.home, "subagentes", "alpha")
        os.makedirs(pasta)
        with open(os.path.join(pasta, "anotacao.txt"), "w") as f:
            f.write("x")
        self.rodar(bash_sub("ls"))
        self.assertIn("anotacao.txt", self.arquivos())


@unittest.skipIf(os.geteuid() == 0, "root ignora permissão de diretório")
class FalhaDeIO(Base):
    def test_diretorio_sem_permissao_nao_quebra_nem_muda_a_decisao(self):
        os.makedirs(os.path.join(self.home, "subagentes", "alpha"))
        os.chmod(os.path.join(self.home, "subagentes", "alpha"), 0o500)
        self.assertEqual(self.rodar(pre_agent(description="x")), {})
        self.assertEqual(self.rodar(bash_sub("ls")), {})


class FalhaDeIOComoRoot(Base):
    """Como root não há diretório sem permissão: força o erro com um arquivo no lugar da pasta."""

    def test_pasta_do_projeto_e_um_arquivo(self):
        os.makedirs(os.path.join(self.home, "subagentes"))
        with open(os.path.join(self.home, "subagentes", "alpha"), "w") as f:
            f.write("não sou pasta")
        self.assertEqual(self.rodar(pre_agent(description="x")), {})
        self.assertEqual(self.rodar(bash_sub("ls")), {})

    def test_decisao_do_bash_nao_muda_com_gravacao_quebrada(self):
        os.makedirs(os.path.join(self.home, "subagentes"))
        with open(os.path.join(self.home, "subagentes", "alpha"), "w") as f:
            f.write("x")
        # sub-agent mandando mensagem: a política barra, com ou sem coleta funcionando
        saida = self.rodar(bash_sub("python3 /x/board.py send --para alpha-researcher01-cc"))
        self.assertEqual(saida["hookSpecificOutput"]["permissionDecision"], "deny")
        self.assertIn("subagent", saida["hookSpecificOutput"]["permissionDecisionReason"])
        # o que foi barrado não aconteceu: não vira atividade
        self.assertFalse(os.path.isdir(os.path.join(self.home, "subagentes", "alpha")))


class Coletor(unittest.TestCase):
    def test_coletar_nunca_levanta(self):
        import subagentes
        subagentes.coletar({"native_event": "PreToolUse"})  # evento malformado
        subagentes.coletar(None)

    def test_indica_erro(self):
        import subagentes
        for ok in (None, {}, {"status": "completed"}, "tudo certo", {"error": ""}):
            self.assertFalse(subagentes.indica_erro(ok), ok)
        for ruim in ({"error": "x"}, {"isError": True}, {"status": "FAILED"}, "Erro: x"):
            self.assertTrue(subagentes.indica_erro(ruim), ruim)


class Instalacao(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="agent-board-inst-")
        self.home = os.path.join(self.tmp, "home")
        os.makedirs(os.path.join(self.home, ".claude"))
        self.settings = os.path.join(self.home, ".claude", "settings.json")
        # PATH sem o `claude` real: o install.sh não pode mexer no MCP de ninguém
        self.bin = os.path.join(self.tmp, "bin")
        os.makedirs(self.bin)
        for ferramenta in ("python3", "sed", "cp", "date", "cat", "mkdir", "chmod", "dirname", "grep"):
            alvo = shutil.which(ferramenta)
            if alvo:
                os.symlink(alvo, os.path.join(self.bin, ferramenta))

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def instalar(self):
        env = {"HOME": self.home, "PATH": self.bin, "AGENT_BOARD_HOME": os.path.join(self.tmp, "estado")}
        r = subprocess.run(["/bin/bash", INSTALL], capture_output=True, text=True, env=env, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr)
        with open(self.settings) as f:
            return json.load(f)

    @staticmethod
    def entradas(s, evento):
        return [(e.get("matcher"), len(e["hooks"])) for e in s["hooks"].get(evento, []) if "agent-board" in json.dumps(e)]

    def test_registra_os_hooks_novos_sem_pre_tool_use_curinga(self):
        s = self.instalar()
        self.assertEqual(self.entradas(s, "SubagentStart"), [(None, 1)])
        self.assertEqual(self.entradas(s, "SubagentStop"), [(None, 1)])
        self.assertIn(("Agent|Task", 1), self.entradas(s, "PreToolUse"))
        self.assertIn(("Agent|Task", 1), self.entradas(s, "PostToolUse"))
        self.assertEqual(self.entradas(s, "PostToolUseFailure"), [("Agent|Task", 1)])
        for e in s["hooks"]["PreToolUse"]:
            self.assertNotIn(e.get("matcher"), (None, "", "*"))
        for evento in ("SubagentStart", "SubagentStop", "PostToolUseFailure"):
            self.assertEqual(s["hooks"][evento][0]["hooks"][0]["timeout"], 10)

    def test_idempotente_e_migra_da_1_11_preservando_hooks_alheios(self):
        antigo = {"hooks": {
            "PreToolUse": [{"matcher": "Bash", "hooks": [{"type": "command", "command": "python3 /x/agent-board/hook_core.py"}]},
                           {"matcher": "Bash", "hooks": [{"type": "command", "command": "meu-hook"}]}],
            "Stop": [{"hooks": [{"type": "command", "command": "python3 /x/agent-board/hook_core.py"}]}]},
            "model": "opus"}
        with open(self.settings, "w") as f:
            json.dump(antigo, f)
        primeira = self.instalar()
        segunda = self.instalar()
        self.assertEqual(primeira, segunda)
        self.assertEqual(segunda["model"], "opus")
        self.assertIn("meu-hook", json.dumps(segunda))
        self.assertEqual(json.dumps(segunda).count("/x/agent-board/hook_core.py"), 0)
        self.assertEqual(len(self.entradas(segunda, "SubagentStart")), 1)
        self.assertEqual(len(self.entradas(segunda, "Stop")), 1)


SUB1 = {"kind": "sub", "id": "0-Explore", "name": "explore", "depth": 1, "parentId": "Main"}
SUB2 = {"kind": "sub", "id": "1-Task", "name": "task", "depth": 1, "parentId": "Main"}


def passo(evento, agent=None, **event):
    p = {"evento": evento, "event": dict(event, type=evento)}
    if agent:
        p["agent"] = agent
    return p


def tool_call(nome, entrada, agent=None):
    return passo("tool_call", agent, toolName=nome, toolCallId="c1", input=entrada)


@unittest.skipUnless(BUN, "bun não está instalado: o OMP roda em bun, sem ele não há como executar o adaptador")
class AdaptadorOmp(Base):
    def omp(self, passos, **env_extra):
        from test_omp import HARNESS
        harness = os.path.join(self.tmp, "harness.ts")
        with open(harness, "w") as f:
            f.write(HARNESS)
        env = {k: v for k, v in os.environ.items() if not k.startswith(("ORCA_", "AGENT_BOARD_", "MAESTRI_"))}
        env.update(dict(AGENT_BOARD_HOME=self.home, AGENT_BOARD_CORE=CORE, ORCA_TERMINAL_HANDLE=G1), **env_extra)
        r = subprocess.run([BUN, "run", harness, ADAPTADOR], input=json.dumps(passos), capture_output=True,
                           text=True, env=env, timeout=60, cwd=self.tmp)
        self.assertEqual(r.returncode, 0, r.stderr)
        return json.loads(r.stdout.strip().splitlines()[-1])

    def test_ciclo_de_vida_e_atividade_do_sub(self):
        saidas = self.omp([
            passo("agent_start", SUB1),
            passo("agent_start", SUB1),  # repetido: não duplica o inicio
            tool_call("bash", {"command": "ls -la token=abc12345"}, SUB1),
            tool_call("edit", {"path": "/srv/app/x.py", "edits": []}, SUB1),
            tool_call("write", {"path": "/srv/app/y.py", "content": "SEGREDO"}, SUB1),
            tool_call("bash", {"command": "pwd"}, SUB2),  # sem agent_start: o inicio vem da primeira ação
            passo("agent_end", SUB1, willContinue=False),
            passo("agent_end", SUB1, willContinue=False),  # repetido
            passo("tool_result", None, toolName="task", toolCallId="t1", input={}, content=[], isError=False,
                  details={"results": [{"id": "0-Explore", "agent": "Explore"}, {"id": "1-Task", "agent": "Task"}]}),
        ])
        self.assertTrue(all(s is None for s in saidas), saidas)  # a coleta nunca bloqueia nem reescreve
        ls = self.linhas()
        self.assertEqual([(l["ev"], l["id"]) for l in ls],
                         [("inicio", "0-Explore"), ("atividade", "0-Explore"), ("atividade", "0-Explore"),
                          ("atividade", "0-Explore"), ("inicio", "1-Task"), ("atividade", "1-Task"),
                          ("fim", "0-Explore"), ("fim", "1-Task")])
        self.assertEqual(ls[0]["tipo"], "explore")
        self.assertEqual([l["resumo"] for l in ls if l["ev"] == "atividade"],
                         ["ls -la [oculto]", "/srv/app/x.py", "/srv/app/y.py", "pwd"])
        self.assertEqual({l["agente"] for l in ls}, {"alpha-manager01-cc"})
        self.assertNotIn("SEGREDO", json.dumps(ls))

    def test_agente_principal_e_advisor_nao_geram_nada(self):
        self.omp([passo("agent_start"), tool_call("bash", {"command": "ls"}),
                  tool_call("bash", {"command": "ls"}, {"kind": "sub", "id": "advisor", "name": "advisor"}),
                  passo("agent_end", None, willContinue=False)])
        self.assertEqual(self.linhas(), [])

    def test_core_quebrado_nao_bloqueia_o_sub(self):
        quebrado = os.path.join(self.tmp, "quebrado.py")
        with open(quebrado, "w") as f:
            f.write("import sys; sys.exit(3)\n")
        saidas = self.omp([passo("agent_start", SUB1), tool_call("bash", {"command": "ls"}, SUB1)],
                          AGENT_BOARD_CORE=quebrado)
        self.assertEqual(saidas, [None, None])


if __name__ == "__main__":
    unittest.main()
