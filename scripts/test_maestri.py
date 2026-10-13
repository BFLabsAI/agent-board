#!/usr/bin/env python3
"""Testes do agent-board no Maestri, com uma CLI `maestri` falsa (MAESTRI_CLI).

  python3 scripts/test_maestri.py
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
HOME_TESTE = tempfile.mkdtemp(prefix="agent-board-maestri-")
os.environ["AGENT_BOARD_HOME"] = HOME_TESTE  # antes de importar base
os.environ.pop("ORCA_TERMINAL_HANDLE", None)
sys.path.insert(0, AQUI)

import notificar  # noqa: E402
import registro  # noqa: E402

CONFIG = os.path.join(AQUI, "..", "templates", "agent-board.json")
CORE, PAINEL, BOARD = (os.path.join(AQUI, n) for n in ("hook_core.py", "painel.py", "board.py"))
M_ID, G_ID, R_ID = "AAAA-1111", "BBBB-2222", "CCCC-3333"
M, G, R = "alpha-master", "alpha-manager01-cc", "alpha-researcher01-cc"

FALSO = r'''#!/bin/bash
printf '%s\n' "$*" >> "$FAKE_CHAMADAS"
case "$1" in
  list) printf 'You:\n  - name: "%s"%s\n\nNo connected agents, notes, or portals. Use the Connect button in the terminal toolbar to connect to another terminal, note, or portal.' "$FAKE_NOME" "$FAKE_ATRIBUTOS" ;;
  ask)
    case "$2" in
      Desconectado) echo "Agent 'Desconectado' is not connected to you." >&2; exit 1 ;;
      Sumido) echo "Terminal 'Sumido' not found"; exit 0 ;;
      Lento) sleep 8 ;;
    esac
    echo "ok" ;;
  note)
    if [ "$2" = write ] && [ ! -f "$FAKE_NOTA" ]; then echo "Note '$3' not found"; exit 0; fi
    if [ "$2" = create ]; then touch "$FAKE_NOTA"; fi
    echo "Note \"ab · x\"" ;;
  connect|routine) if [ -n "$FAKE_SEM_MAESTRO" ]; then echo "This terminal is not the Maestro. Toggle Maestro on the terminal in the canvas to unlock this command."; exit 0; fi; echo ok ;;
  *) echo ok ;;
esac
'''


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="agent-board-mt-")
        self.raiz = os.path.join(self.tmp, "alpha")
        os.makedirs(os.path.join(self.raiz, "docs/agent-board"))
        with open(CONFIG) as f:
            self.cfg = json.load(f)
        self.cfg["projeto"], self.cfg["prefixo"] = "alpha", "alpha"
        self.salvar_cfg()
        self.cli = os.path.join(self.tmp, "maestri")
        with open(self.cli, "w") as f:
            f.write(FALSO)
        os.chmod(self.cli, 0o755)
        self.orca = os.path.join(self.tmp, "orca")
        with open(self.orca, "w") as f:
            f.write(f'#!/bin/bash\nprintf "%s\\n" "$*" >> {self.tmp}/orca-chamadas\necho "Sent msg_1"\n')
        os.chmod(self.orca, 0o755)
        self.chamadas = os.path.join(self.tmp, "chamadas")
        p = lambda ag, papel, nome: {"projeto": "alpha", "agente": ag, "papel": papel, "raiz": self.raiz,
                                     "transporte": "maestri", "nome_canvas": nome,
                                     "cadastrado_em": "2026-01-01T00:00:00+00:00"}
        self.paineis = {f"maestri:{M_ID}": p(M, "master", "Maestro"), f"maestri:{G_ID}": p(G, "manager", "Forja"),
                        f"maestri:{R_ID}": p(R, "researcher", "Desconectado")}
        self.salvar_paineis()

    def tearDown(self):
        shutil.rmtree(self.tmp)
        for n in ("solicitacoes", "cobrancas", "pendentes", "envios", "maestri-ask", "paineis.json"):
            c = os.path.join(HOME_TESTE, n)
            shutil.rmtree(c, ignore_errors=True) if os.path.isdir(c) else (os.path.exists(c) and os.remove(c))

    def salvar_cfg(self):
        with open(os.path.join(self.raiz, "docs/agent-board/agent-board.json"), "w") as f:
            json.dump(self.cfg, f)

    def salvar_paineis(self):
        with open(os.path.join(HOME_TESTE, "paineis.json"), "w") as f:
            json.dump({"versao": 1, "paineis": self.paineis}, f)

    def env(self, terminal_id=M_ID, nome="Maestro"):
        e = dict(os.environ, AGENT_BOARD_HOME=HOME_TESTE, MAESTRI_CLI=self.cli, FAKE_CHAMADAS=self.chamadas,
                 FAKE_NOME=nome, FAKE_NOTA=os.path.join(self.tmp, "nota-existe"), ORCA_BIN=self.orca)
        e.pop("ORCA_TERMINAL_HANDLE", None)
        if terminal_id:
            e["MAESTRI_TERMINAL_ID"] = terminal_id
        else:
            e.pop("MAESTRI_TERMINAL_ID", None)
        return e

    def rodar(self, script, *args, terminal_id=M_ID, nome="Maestro", entrada=None):
        return subprocess.run([sys.executable, script] + list(args), capture_output=True, text=True,
                              env=self.env(terminal_id, nome), timeout=40, input=entrada)

    def hook(self, comando, terminal_id=M_ID, evento="PreToolUse", extra=None):
        payload = dict({"hook_event_name": evento, "tool_name": "Bash", "tool_input": {"command": comando}},
                       **(extra or {}))
        r = self.rodar(CORE, terminal_id=terminal_id, entrada=json.dumps(payload))
        return json.loads(r.stdout)

    def texto_das_chamadas(self):
        with open(self.chamadas) as f:
            return f.read()

    def cordas(self, saida):
        linhas = (l[len("maestri "):] if l.startswith("maestri ") else l for l in saida.splitlines())
        return {frozenset(l.split()[1:]) for l in linhas if l.startswith("connect ")}

    def feitas(self, nome="chamadas"):
        try:
            with open(os.path.join(self.tmp, nome)) as f:
                return f.read().splitlines()
        except FileNotFoundError:
            return []


class Cadastro(Base):
    def test_eu_mostra_handle_e_nome_no_canvas(self):
        r = self.rodar(PAINEL, "eu", terminal_id="ZZZZ-9999", nome="Pena Azul")
        self.assertIn("handle: maestri:ZZZZ-9999", r.stdout)
        self.assertIn("nome_canvas: Pena Azul", r.stdout)
        self.assertIn("painel.py solicitar", r.stdout)

    def test_nome_do_terminal_em_modo_maestro(self):
        e = self.env("ZZZZ-9999", 'Shell #2')
        e["FAKE_ATRIBUTOS"] = ", maestro: true"
        r = subprocess.run([sys.executable, PAINEL, "eu"], capture_output=True, text=True, env=e, timeout=30)
        self.assertIn("nome_canvas: Shell #2\n", r.stdout)

    def test_solicitar_listar_e_cadastrar(self):
        r = self.rodar(PAINEL, "solicitar", "--raiz", self.raiz, "--agente", "alpha-manager02-cc",
                       terminal_id="ZZZZ-9999", nome="Pena Azul")
        self.assertEqual(r.returncode, 0, r.stderr)
        r = self.rodar(PAINEL, "solicitacoes", terminal_id=None)
        self.assertIn("maestri:ZZZZ-9999", r.stdout)
        self.assertIn("maestri:ZZZZ-9999=alpha-manager02-cc", r.stdout)
        r = self.rodar(PAINEL, "listar", terminal_id=None)
        self.assertIn("pediu para ser alpha/alpha-manager02-cc", r.stdout)
        self.assertIn("Forja", r.stdout)
        r = self.rodar(PAINEL, "cadastrar", "--raiz", self.raiz, "maestri:ZZZZ-9999=alpha-manager02-cc", terminal_id=None)
        self.assertEqual(r.returncode, 0, r.stderr)
        with open(os.path.join(HOME_TESTE, "paineis.json")) as f:
            novo = json.load(f)["paineis"]["maestri:ZZZZ-9999"]
        self.assertEqual((novo["transporte"], novo["nome_canvas"], novo["papel"]), ("maestri", "Pena Azul", "manager"))
        self.assertIn("nenhum pedido", self.rodar(PAINEL, "solicitacoes", terminal_id=None).stdout)

    def test_cadastrar_maestri_sem_pedido_explica(self):
        r = self.rodar(PAINEL, "cadastrar", "--raiz", self.raiz, "maestri:NADA=alpha-manager03-cc", terminal_id=None)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("não pediu cadastro", r.stderr)


class Envio(Base):
    def test_board_send_entrega_pelo_maestri_com_nome_do_canvas(self):
        r = self.rodar(BOARD, "send", "--to", "manager01-cc", "--type", "pedido", "--modo", "executar",
                       "--subject", "Migrar login", "--body", "Use `make test` e $(pwd)\\nlinha")
        self.assertEqual(r.returncode, 0, r.stderr)
        time.sleep(0.3)
        asks = [c for c in self.feitas() if c.startswith("ask ")]
        self.assertEqual(len(asks), 1)
        self.assertTrue(asks[0].startswith("ask Forja [agent-board] [c-"), asks[0])
        self.assertIn("pedido·executar] Migrar login", asks[0])
        texto = self.texto_das_chamadas()
        self.assertIn("De: alpha-master", texto)
        self.assertIn("`make test` e $(pwd)\\\\nlinha", texto)  # barra invertida dobrada para o maestri
        self.assertIn("board.py send --to alpha-master --type resposta", texto)
        self.assertEqual(self.feitas("orca-chamadas"), [])  # nada de orca, nem aviso
        log = registro.ler_log(self.raiz)
        self.assertEqual((log[-1]["para"], log[-1]["tipo"]), (G, "pedido"))

    def test_destino_desconectado_marca_falhou_e_nao_cobra(self):
        r = self.rodar(BOARD, "send", "--to", "researcher01-cc", "--type", "aviso", "--subject", "x")
        self.assertEqual(r.returncode, 1)
        self.assertIn("NÃO entregue", r.stderr)
        self.assertIn("not connected", r.stderr)
        self.assertEqual(registro.ler_log(self.raiz), [])
        out = self.hook("", terminal_id=R_ID, evento="Stop")
        self.assertEqual(out, {})

    def test_cli_que_sai_com_zero_mas_nao_achou_o_destino_e_falha(self):
        self.paineis[f"maestri:{G_ID}"]["nome_canvas"] = "Sumido"  # a CLI real faz isso com código 0
        self.salvar_paineis()
        r = self.rodar(BOARD, "send", "--to", "manager01-cc", "--type", "aviso", "--subject", "x")
        self.assertEqual(r.returncode, 1)
        self.assertIn("not found", r.stderr)
        self.assertEqual(registro.ler_log(self.raiz), [])

    def test_destino_lento_nao_segura_quem_envia(self):
        self.paineis[f"maestri:{G_ID}"]["nome_canvas"] = "Lento"
        self.salvar_paineis()
        t0 = time.time()
        r = self.rodar(BOARD, "send", "--to", "manager01-cc", "--type", "aviso", "--subject", "x")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertLess(time.time() - t0, 7)

    def test_regras_do_time_valem_no_board_py(self):
        r = self.rodar(BOARD, "send", "--to", "manager01-cc", "--type", "pedido", "--subject", "x")
        self.assertEqual(r.returncode, 1)
        self.assertIn("--modo", r.stderr)
        r = self.rodar(BOARD, "send", "--to", "master", "--type", "pedido", "--subject", "x", terminal_id=R_ID)
        self.assertIn("não envia 'pedido'", r.stderr)
        r = self.rodar(BOARD, "send", "--to", "master", "--type", "aviso", "--subject", "x", terminal_id="NINGUEM")
        self.assertIn("não está cadastrado", r.stderr)

    def test_body_file_pela_entrada_padrao(self):
        r = self.rodar(BOARD, "send", "--to", "manager01-cc", "--type", "aviso", "--subject", "x",
                       "--body-file", "-", entrada="corpo vindo do stdin")
        self.assertEqual(r.returncode, 0, r.stderr)
        time.sleep(0.3)
        self.assertIn("corpo vindo do stdin", self.texto_das_chamadas())

    def test_stop_no_maestri_ensina_o_board_py(self):
        self.rodar(BOARD, "send", "--to", "manager01-cc", "--type", "aviso", "--subject", "x")
        out = self.hook("", terminal_id=G_ID, evento="Stop")
        self.assertEqual(out.get("decision"), "block")
        self.assertIn("board.py send --to alpha-master --type resposta", out["reason"])
        self.assertIn("chegou digitada neste terminal", out["reason"])


class Hook(Base):
    def decisao(self, comando, terminal_id=M_ID, extra=None):
        h = self.hook(comando, terminal_id, extra=extra).get("hookSpecificOutput", {})
        return h.get("permissionDecision", "pass"), h.get("permissionDecisionReason", "")

    def test_maestri_ask_direto_para_o_time_e_barrado(self):
        d, motivo = self.decisao('maestri ask "Forja" "faz isso"', terminal_id=R_ID)
        self.assertEqual(d, "deny")
        self.assertIn("board.py send", motivo)
        self.assertEqual(self.decisao('"$MAESTRI_CLI" ask Forja "x"', terminal_id=R_ID)[0], "deny")
        self.assertEqual(self.decisao("maestri ask --batch '{\"Ajudante\": \"a\", \"Forja @ Alpha\": \"b\"}'")[0], "deny")
        self.assertEqual(self.decisao('maestri ask "alpha-manager01-cc" "x"')[0], "deny")

    def test_raw_so_do_master_no_proprio_time(self):
        self.assertEqual(self.decisao('maestri ask Forja --raw "/clear\\n"')[0], "pass")
        d, motivo = self.decisao('maestri ask Forja --raw "/clear\\n"', terminal_id=R_ID)
        self.assertEqual(d, "deny")
        self.assertIn("não digite", motivo)
        self.assertEqual(self.decisao('maestri ask Forja --raw "x"', extra={"agent_id": "sub"})[0], "deny")

    def test_fora_do_time_e_leitura_passam(self):
        self.assertEqual(self.decisao('maestri ask "Ajudante" "revisa"', terminal_id=G_ID)[0], "pass")
        self.assertEqual(self.decisao('maestri check "Forja"', terminal_id=G_ID)[0], "pass")
        self.assertEqual(self.decisao("maestri list")[0], "pass")
        self.assertEqual(self.decisao('maestri ask Forja "x"', terminal_id="DESCONHECIDO")[0], "deny")

    def test_comando_ilegivel_de_agente_do_time_e_barrado(self):
        self.assertEqual(self.decisao("maestri ask 'Forja \"x\"", terminal_id=G_ID)[0], "deny")

    def test_orca_send_para_destino_no_maestri_aponta_o_board_py(self):
        d, motivo = self.decisao("orca orchestration send --to manager01-cc --type aviso --subject x")
        self.assertEqual(d, "deny")
        self.assertIn("está no Maestri", motivo)
        self.assertIn("board.py send", motivo)

    def test_crase_no_shell_continua_barrada(self):
        self.paineis["term_orca"] = {"projeto": "alpha", "agente": "alpha-manager02-cc", "papel": "manager",
                                     "raiz": self.raiz}
        self.salvar_paineis()
        d, motivo = self.decisao("orca orchestration send --to manager02-cc --type aviso --subject x --body '`ls`'")
        self.assertEqual(d, "deny")
        self.assertIn("não use `", motivo)


class Canvas(Base):
    def test_conectar_mostra_e_aplica_as_cordas(self):
        r = self.rodar(PAINEL, "maestri", "conectar", "--raiz", self.raiz)
        self.assertEqual(r.returncode, 0, r.stderr)
        esperadas = {frozenset(("Desconectado", "Forja")),  # manager pode pedir a researcher
                     frozenset(("Desconectado", "Maestro")), frozenset(("Forja", "Maestro"))}
        self.assertEqual(self.cordas(r.stdout), esperadas)
        self.assertEqual(self.feitas(), [])
        r = self.rodar(PAINEL, "maestri", "conectar", "--raiz", self.raiz, "--aplicar")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self.cordas("\n".join(self.feitas())), esperadas)

    def test_conectar_segue_as_ligacoes_quando_existem(self):
        self.cfg["ligacoes"] = [["master", "manager"]]
        self.salvar_cfg()
        r = self.rodar(PAINEL, "maestri", "conectar", "--raiz", self.raiz)
        self.assertEqual(self.cordas(r.stdout), {frozenset(("Desconectado", "Maestro")), frozenset(("Forja", "Maestro"))})

    def test_terminal_fora_do_modo_maestro_e_falha_mesmo_com_codigo_zero(self):
        e = self.env()
        e["FAKE_SEM_MAESTRO"] = "1"
        r = subprocess.run([sys.executable, PAINEL, "maestri", "conectar", "--raiz", self.raiz, "--aplicar"],
                           capture_output=True, text=True, env=e, timeout=40)
        self.assertEqual(r.returncode, 1)
        self.assertIn("FALHA", r.stdout)
        self.assertIn("not the Maestro", r.stdout)

    def test_so_o_master_mexe_no_canvas(self):
        r = self.rodar(PAINEL, "maestri", "conectar", "--raiz", self.raiz, "--aplicar", terminal_id=G_ID)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("só do master", r.stderr)

    def test_rotina_do_vigiar(self):
        r = self.rodar(PAINEL, "maestri", "rotina", "--raiz", self.raiz, "--a-cada", "15m")
        self.assertIn("maestri routine create 'agent-board vigiar alpha' --command", r.stdout)
        self.assertIn("vigiar --raiz", r.stdout)
        self.assertEqual(self.feitas(), [])
        r = self.rodar(PAINEL, "maestri", "rotina", "--raiz", self.raiz, "--aplicar")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(any(c.startswith("routine create agent-board vigiar alpha --command python3") and
                            c.endswith("--every 10m") for c in self.feitas()), self.feitas())

    def test_nota_espelhada_no_canvas(self):
        self.cfg["maestri"] = {"espelhar_notas": True}
        self.salvar_cfg()
        r = self.rodar(PAINEL, "nota", "--raiz", self.raiz, "--tema", "Auth", "JWT curto")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("criada no fichário agent-board", r.stdout)
        texto = self.texto_das_chamadas()
        self.assertIn("note write ab · auth # auth", texto)
        self.assertIn("note create # auth", texto)
        self.assertIn("JWT curto\n\n --name ab · auth --stack agent-board", texto)
        r = self.rodar(PAINEL, "nota", "--raiz", self.raiz, "--tema", "auth", "refresh rotativo")
        self.assertIn("atualizada", r.stdout)

    def test_nota_sem_a_opcao_nao_mexe_no_canvas(self):
        self.rodar(PAINEL, "nota", "--raiz", self.raiz, "--tema", "auth", "x")
        self.assertEqual([c for c in self.feitas() if c.startswith("note")], [])


class Floor(Base):
    def test_status_do_floor_na_entrega(self):
        self.cfg["maestri"] = {"status_do_floor": True}
        self.salvar_cfg()
        p = {"id": "c-1", "tipo_time": "entrega", "assunto": "Login pronto", "raiz": self.raiz}
        antes = dict(os.environ)
        os.environ.update(self.env(G_ID))
        try:
            self.assertTrue(notificar.quer_floor(p))
            notificar.notificar(p)
            self.assertFalse(notificar.quer_floor(dict(p, tipo_time="aviso")))
        finally:
            os.environ.clear()
            os.environ.update(antes)
        self.assertIn("floor status Entrega c-1: Login pronto --state review", self.feitas())

    @unittest.skipIf(shutil.which("git") is None, "sem git")
    def test_branch_do_floor_pelo_diretorio(self):
        git = ["git", "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"]
        subprocess.run(git + ["init", "-q", self.raiz], check=True)
        subprocess.run(git + ["-C", self.raiz, "commit", "-q", "--allow-empty", "-m", "x"], check=True)
        floor = os.path.join(self.tmp, "floor")
        subprocess.run(git + ["-C", self.raiz, "worktree", "add", "-q", "-b", "refactor-auth", floor], check=True)
        eu = {"raiz": self.raiz}
        self.assertEqual(notificar.extras_entrega("entrega", eu, floor), {"branch": "refactor-auth"})
        self.assertEqual(notificar.extras_entrega("entrega", eu, self.raiz), {})
        self.assertEqual(notificar.extras_entrega("aviso", eu, floor), {})


if __name__ == "__main__":
    try:
        unittest.main(verbosity=1)
    finally:
        shutil.rmtree(HOME_TESTE, ignore_errors=True)
