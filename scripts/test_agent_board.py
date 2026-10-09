#!/usr/bin/env python3
"""Testes a seco do agent-board: nenhum envio real, cadastro e log em pasta temporária.

  python3 scripts/test_agent_board.py
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
CORE = os.path.join(AQUI, "hook_core.py")
CONFIG = os.path.join(AQUI, "..", "templates", "agent-board.json")

M = "term_master"
G1 = "term_man01cc"
G2 = "term_man02cc"
R = "term_res01cc"
OUTRO = "term_beta_master"
ORFAO = "term_sem_cadastro"


def montar(tmp):
    raiz = os.path.join(tmp, "alpha")
    raiz2 = os.path.join(tmp, "beta")
    for r, proj, pref in ((raiz, "alpha", "alpha"), (raiz2, "beta", "beta")):
        os.makedirs(os.path.join(r, "docs/agent-board"))
        cfg = json.load(open(CONFIG))
        cfg["projeto"], cfg["prefixo"] = proj, pref
        json.dump(cfg, open(os.path.join(r, "docs/agent-board/agent-board.json"), "w"))
    p = lambda proj, ag, pap, r: {"projeto": proj, "agente": ag, "papel": pap, "raiz": r}
    paineis = {
        M: p("alpha", "alpha-master", "master", raiz),
        G1: p("alpha", "alpha-manager01-cc", "manager", raiz),
        G2: p("alpha", "alpha-manager02-cc", "manager", raiz),
        R: p("alpha", "alpha-researcher01-cc", "researcher", raiz),
        OUTRO: p("beta", "beta-master", "master", raiz2),
    }
    json.dump({"versao": 1, "paineis": paineis}, open(os.path.join(tmp, "paineis.json"), "w"))
    return raiz


def rodar(tmp, eu, cmd, evento="PreToolUse", extra=None):
    payload = {"hook_event_name": evento, "tool_name": "Bash", "tool_input": {"command": cmd}}
    if isinstance(cmd, dict):  # SendMessage, ou outra ferramenta com "tool"
        cmd = dict(cmd)
        payload = {"hook_event_name": evento, "tool_name": cmd.pop("tool", "SendMessage"), "tool_input": cmd}
    payload.update(extra or {})
    env = dict(os.environ, AGENT_BOARD_HOME=tmp, ORCA_TERMINAL_HANDLE=eu)
    out = subprocess.run([sys.executable, CORE, "--dialect", "claude"], input=json.dumps(payload),
                         capture_output=True, text=True, env=env, timeout=10)
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout).get("hookSpecificOutput", {})


CASOS = [
    # (descrição, remetente, comando, esperado: "deny" | "allow" | "pass", trecho do motivo/comando)
    ("manager pede ao researcher", G1,
     'orca orchestration send --to alpha-researcher01-cc --type pedido --subject "Analisar pagamentos" --issues 412,413',
     "allow", "--to term_res01cc"),
    ("master pede ao manager com modo", M,
     'orca orchestration send --to alpha-manager01-cc --type pedido --modo orquestrar --subject "Frente A"',
     "allow", "pedido·orquestrar"),
    ("caminho absoluto do orca", M,
     '/root/.orca-relay/bin/orca orchestration send --to alpha-manager01-cc --type pedido --modo executar --subject x',
     "allow", "--from term_master"),
    ("pedido a manager sem modo", M,
     'orca orchestration send --to alpha-manager02-cc --type pedido --subject "Frente B"', "deny", "--modo"),
    ("researcher não faz pedido", R,
     'orca orchestration send --to alpha-manager01-cc --type pedido --modo executar --subject x', "deny", "não envia 'pedido'"),
    ("resposta a mensagem que não existe", R,
     'orca orchestration send --to alpha-manager01-cc --type resposta --responde-a c-1 --subject "Feito"', "deny", "não existe"),
    ("resposta sem responde-a", R,
     'orca orchestration send --to alpha-manager01-cc --type resposta --subject "Feito"', "deny", "--responde-a"),
    ("escalação só para o master", G1,
     'orca orchestration send --to alpha-researcher01-cc --type escalacao --subject x', "deny", "só vai para o master"),
    ("escalação ao master", R,
     'orca orchestration send --to alpha-master --type escalacao --subject "Travado"', "allow", "escalacao"),
    ("tipo nativo do Orca recusado", G1,
     'orca orchestration send --to alpha-researcher01-cc --type status --subject x', "deny", "tipo do time"),
    ("sem assunto", G1, 'orca orchestration send --to alpha-researcher01-cc --type aviso', "deny", "--subject"),
    ("para si mesmo", G1,
     'orca orchestration send --to alpha-manager01-cc --type aviso --subject x', "deny", "si mesmo"),
    ("handle cru cadastrado também vale", G1,
     'orca orchestration send --to term_res01cc --type aviso --subject x', "allow", "[c-"),
    ("painel sem cadastro", ORFAO,
     'orca orchestration send --to alpha-master --type aviso --subject x', "deny", "não está cadastrado"),
    ("nome do time não cadastrado", G1,
     'orca orchestration send --to alpha-manager09-omp --type aviso --subject x', "deny", "não é um agente cadastrado"),
    ("agente cadastrado não fala com painel fora do time (term_)", G1,
     'orca orchestration send --to term_externo --type aviso --subject x', "deny", "Agentes válidos"),
    ("agente cadastrado não fala com nome fora do padrão", G1,
     'orca orchestration send --to alpha-omp-manager01 --type aviso --subject x', "deny", "não é um agente cadastrado"),
    ("nome curto sem prefixo é resolvido", G1,
     'orca orchestration send --to researcher01-cc --type aviso --subject x', "allow", "--to term_res01cc"),
    ("agente cadastrado não digita em painel fora do time", G1,
     'orca terminal send --terminal term_externo --text oi --enter', "deny", "não digite"),
    ("master não digita em painel fora do time", M,
     'orca terminal send --terminal term_externo --text oi --enter', "deny", "não digite"),
    ("outro projeto barrado", G1,
     'orca orchestration send --to beta-master --type aviso --subject x', "deny", "outro projeto"),
    ("handle de outro projeto barrado", G1,
     'orca orchestration send --to term_beta_master --type aviso --subject x', "deny", "outro projeto"),
    ("subagent barrado", G1,
     'orca orchestration send --to alpha-researcher01-cc --type aviso --subject x', "deny", "subagent"),
    ("corpo com várias linhas e ; entre aspas", G1,
     'orca orchestration send --to alpha-researcher01-cc --type aviso --subject x --body "linha 1;\nlinha 2 && fim"',
     "allow", "linha 2"),
    ("pipe depois do orca barrado", G1,
     'orca orchestration send --to alpha-researcher01-cc --type aviso --subject x | grep ok', "deny", "sozinho"),
    ("comando encadeado barrado", G1,
     'cd /tmp && orca orchestration send --to alpha-researcher01-cc --type aviso --subject x', "deny", "sozinho"),
    ("digitar no painel de outro agente", G1,
     'orca terminal send --terminal term_res01cc --text oi --enter', "deny", "não digite"),
    ("master pode digitar no painel", M, 'orca terminal send --terminal term_man01cc --text /clear --enter', "pass", ""),
    ("fora do time passa", ORFAO,
     'orca orchestration send --to term_qualquer --type status --subject x', "pass", ""),
    ("painel sem cadastro digitando em painel sem cadastro passa", ORFAO,
     'orca terminal send --terminal term_qualquer --text oi --enter', "pass", ""),
    ("fluxo interno do Orca (run:) passa", G1,
     'orca orchestration send --to run:abc --type status --subject x', "pass", ""),
    ("encadeado de quem não é do time passa", ORFAO,
     'cd /x && orca orchestration send --to term_qualquer --type status --subject x', "pass", ""),
    ("SendMessage para agente do time", G1, {"to": "alpha-master", "message": "oi"}, "deny", "não use SendMessage"),
    ("SendMessage com nome antigo do time", G1, {"to": "alpha-manager02", "message": "oi"}, "deny", "SendMessage"),
    ("SendMessage por endereço uds", G1, {"to": "uds:/run/user/0/cc-socks/1.sock", "message": "oi"}, "deny", "SendMessage"),
    ("SendMessage de painel sem cadastro para agente cadastrado", ORFAO,
     {"to": "alpha-researcher01-cc [ab12]", "message": "oi"}, "deny", "SendMessage"),
    ("agente real sem cadastro: SendMessage com nome do time passa", ORFAO,
     {"to": "alpha-manager07", "message": "oi"}, "pass", ""),
    ("agente real sem cadastro: orca encadeado citando nome do time passa", ORFAO,
     'orca orchestration send --to term_x --type status --subject "alpha-manager07 ok" | tail -1', "pass", ""),
    ("SendMessage para subagent próprio passa", G1, {"to": "researcher", "message": "oi"}, "pass", ""),
    ("agente do time não usa orchestration reply", R,
     'orca orchestration reply --id msg_123 --body ok', "deny", "não usa orchestration reply"),
    ("agente do time não usa orchestration ask", G1,
     'orca orchestration ask --question "?"', "deny", "não usa orchestration ask"),
    ("painel sem cadastro usa reply normalmente", ORFAO,
     'orca orchestration reply --id msg_123 --body ok', "pass", ""),
    ("agente não reescreve o log por shell", G1,
     'python3 -c "open(\'docs/agent-board/comunicacoes.jsonl\',\'w\').write(\'\')"', "deny", "não se edita à mão"),
    ("agente não acrescenta no log com >>", G1,
     'echo x >> docs/agent-board/comunicacoes.jsonl', "deny", "não se edita à mão"),
    ("agente não edita o cadastro com sed", M,
     "sed -i s/a/b/ ~/.agent-hooks/agent-board/paineis.json", "deny", "não se edita à mão"),
    ("agente não edita o log pela ferramenta de edição", G1,
     {"tool": "Edit", "file_path": "/x/docs/agent-board/comunicacoes.jsonl", "old_string": "a", "new_string": "b"},
     "deny", "não se edita à mão"),
    ("agente não escreve o log pelo OMP (tool write)", G1,
     {"tool": "write", "path": "/x/docs/agent-board/comunicacoes.jsonl", "content": ""}, "deny", "não se edita à mão"),
    ("agente lê o log com jq", G1,
     "jq -c 'select(.para==\"alpha-master\")' docs/agent-board/comunicacoes.jsonl", "pass", ""),
    ("agente lê o log com tail", G1, "tail -5 docs/agent-board/comunicacoes.jsonl", "pass", ""),
    ("leitura com '->' no texto passa", G1,
     """python3 -c "import json; [print(json.loads(l)['de'], '->', json.loads(l)['para']) for l in open('docs/agent-board/comunicacoes.jsonl')]" """,
     "pass", ""),
    ("jq com comparação > passa", G1,
     """jq -c 'select(.ts > "2026-10-07")' docs/agent-board/comunicacoes.jsonl""", "pass", ""),
    ("redirecionamento colado (x>>log) barrado", G1,
     "echo x>>docs/agent-board/comunicacoes.jsonl", "deny", "não se edita à mão"),
    ("redirecionamento de stderr para o log barrado", G1,
     "ls 2> docs/agent-board/comunicacoes.jsonl", "deny", "não se edita à mão"),
    ("leitura com 2>&1 passa", G1,
     "cat docs/agent-board/comunicacoes.jsonl 2>&1", "pass", ""),
    ("leitura com > /dev/null passa", G1,
     "grep -c x docs/agent-board/comunicacoes.jsonl > /dev/null", "pass", ""),
    ("jq do log com saída em /tmp passa", G1,
     "jq -c . docs/agent-board/comunicacoes.jsonl > /tmp/x", "pass", ""),
    ("rm de outro arquivo num comando que lê o log passa", G1,
     "rm /tmp/outro; tail -3 docs/agent-board/comunicacoes.jsonl", "pass", ""),
    ("python que lê o log e grava outro arquivo passa", G1,
     """python3 -c "import json; d=open('docs/agent-board/comunicacoes.jsonl').read(); open('/tmp/o.txt','w').write(d)" """,
     "pass", ""),
    ("echo >> log barra", G1,
     "echo x >> comunicacoes.jsonl", "deny", "não se edita à mão"),
    ("sed -i no cadastro barra", M,
     "sed -i s/a/b/ paineis.json", "deny", "não se edita à mão"),
    ("rm do log barra", G1,
     "rm comunicacoes.jsonl", "deny", "não se edita à mão"),
    ("cp para o log barra", G1,
     "cp a docs/agent-board/comunicacoes.jsonl", "deny", "não se edita à mão"),
    ("mv do log para outro lugar barra", G1,
     "mv docs/agent-board/comunicacoes.jsonl /tmp/x", "deny", "não se edita à mão"),
    ("tee no log barra", G1,
     "echo x | tee -a docs/agent-board/comunicacoes.jsonl", "deny", "não se edita à mão"),
    ("write_text no log barra", G1,
     """python3 -c "from pathlib import Path; Path('docs/agent-board/comunicacoes.jsonl').write_text('')" """,
     "deny", "não se edita à mão"),
    ("painel sem cadastro não é afetado pela proteção", ORFAO,
     'echo x >> docs/agent-board/comunicacoes.jsonl', "pass", ""),
    ("master cadastra pelo painel.py", M,
     "python3 ~/.agents/skills/agent-board/scripts/painel.py cadastrar --raiz /x term_a=alpha-manager03-cc", "pass", ""),
    ("outro comando passa", ORFAO, 'git status', "pass", ""),
    ("orca de leitura passa", G1, 'orca terminal list --json', "pass", ""),
]


def teste_aviso():
    """Throttle de 60 s (aqui 2 s) e checagem de 'não lido' do aviso digitado, com um orca falso."""
    import time
    tmp = tempfile.mkdtemp(prefix="agent-board-aviso-")
    try:
        bin_ = os.path.join(tmp, "bin")
        os.makedirs(bin_)
        falso = os.path.join(bin_, "orca")
        with open(falso, "w") as f:
            f.write("#!/bin/bash\n"
                    "case \"$*\" in\n"
                    "  *'orchestration inbox'*) cat \"$FAKE_INBOX\" ;;\n"
                    "  *'terminal read'*) echo ;;\n"
                    "  *'terminal send'*) echo x >> \"$FAKE_ENVIOS\" ;;\n"
                    "esac\n")
        os.chmod(falso, 0o755)
        inbox, envios = os.path.join(tmp, "inbox.json"), os.path.join(tmp, "envios")
        def caixa(lida):
            json.dump({"result": {"messages": [{"to_handle": "term_x", "read": lida}]}}, open(inbox, "w"))
        def avisar():
            env = dict(os.environ, AGENT_BOARD_HOME=tmp, AGENT_BOARD_JANELA_AVISO="2", ORCA_REMOTE_CLI_BIN_DIR=bin_,
                       FAKE_INBOX=inbox, FAKE_ENVIOS=envios)
            subprocess.run([sys.executable, CORE, "--avisar", "term_x", "c-1", "aviso"], env=env, timeout=20,
                           capture_output=True, text=True)
        def n():
            return len(open(envios).read().split()) if os.path.exists(envios) else 0
        ok_n, res = 0, []
        caixa(0)
        avisar()
        res.append(("1o aviso digita na hora", n() == 1))
        caixa(1)
        avisar()  # dentro da janela, espera fechar; tudo lido: não digita
        res.append(("2o aviso na janela, tudo lido: não digita", n() == 1))
        caixa(0)
        t0 = time.time()
        avisar()  # sobrou não lido (a janela do 1o ja fechou, então digita direto)
        res.append(("passada a janela, com não lido: digita", n() == 2))
        caixa(0)
        t0 = time.time()
        avisar()  # dentro da janela, com não lido: espera e digita um só
        res.append(("na janela com não lido: espera a janela e digita", n() == 3 and time.time() - t0 >= 1))
        caixa(0)
        env = dict(os.environ, AGENT_BOARD_HOME=tmp, AGENT_BOARD_JANELA_AVISO="2", ORCA_REMOTE_CLI_BIN_DIR=bin_,
                   FAKE_INBOX=inbox, FAKE_ENVIOS=envios)
        ps = [subprocess.Popen([sys.executable, CORE, "--avisar", "term_x", "c-%d" % i, "aviso"], env=env,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) for i in range(3)]
        for p in ps:
            p.wait(timeout=30)
        res.append(("3 avisos simultâneos: exatamente 1 digitado", n() - 3 == 1))
        for nome, ok in res:
            print(f"{'ok  ' if ok else 'FALHA'} aviso: {nome}")
        return sum(ok for _, ok in res), len(res)
    finally:
        shutil.rmtree(tmp)


def main():
    tmp = tempfile.mkdtemp(prefix="agent-board-test-")
    falhas = 0
    try:
        raiz = montar(tmp)
        for nome, eu, cmd, esperado, trecho in CASOS:
            extra = {"agent_id": "sub-1", "agent_type": "general-purpose"} if "subagent" in nome else None
            h = rodar(tmp, eu, cmd, extra=extra)
            obtido = h.get("permissionDecision", "pass")
            texto = h.get("permissionDecisionReason") or (h.get("updatedInput") or {}).get("command", "")
            ok = obtido == esperado and trecho in texto
            falhas += not ok
            print(f"{'ok  ' if ok else 'FALHA'} {nome}" + ("" if ok else f"\n      obtido={obtido} {texto}"))
        # Log: uma linha por envio liberado, com os campos combinados.
        log = [json.loads(l) for l in open(os.path.join(raiz, "docs/agent-board/comunicacoes.jsonl"))]
        liberados = sum(1 for c in CASOS if c[3] == "allow")
        ok = len(log) == liberados and log[0]["issues"] == [412, 413] and log[0]["para"] == "alpha-researcher01-cc"
        falhas += not ok
        print(f"{'ok  ' if ok else 'FALHA'} log com {len(log)} linhas (esperado {liberados})")
        # Resposta fecha a conversa.
        pedido = next(l for l in log if l["para"] == "alpha-researcher01-cc" and l["tipo"] == "pedido")
        h = rodar(tmp, R, f'orca orchestration send --to alpha-manager01-cc --type resposta --responde-a {pedido["id"]} --subject Feito')
        ok = h.get("permissionDecision") == "allow"
        falhas += not ok
        print(f"{'ok  ' if ok else 'FALHA'} resposta a um pedido recebido passa")
        log = [json.loads(l) for l in open(os.path.join(raiz, "docs/agent-board/comunicacoes.jsonl"))]
        resp = log[-1]
        h = rodar(tmp, G1, f'orca orchestration send --to alpha-researcher01-cc --type resposta --responde-a {resp["id"]} --subject Recebido')
        ok = h.get("permissionDecision") == "deny" and "não se responde" in h.get("permissionDecisionReason", "")
        falhas += not ok
        print(f"{'ok  ' if ok else 'FALHA'} resposta a uma resposta é barrada (sem ping-pong)")
        h = rodar(tmp, G2, f'orca orchestration send --to alpha-researcher01-cc --type resposta --responde-a {pedido["id"]} --subject x')
        ok = h.get("permissionDecision") == "deny" and "não foi enviada para você" in h.get("permissionDecisionReason", "")
        falhas += not ok
        print(f"{'ok  ' if ok else 'FALHA'} resposta a mensagem de outro agente é barrada")
        # Stop: quem recebeu e não respondeu é segurado; quem não deve nada encerra.
        def stop(eu, extra=None):
            payload = {"hook_event_name": "Stop", "stop_hook_active": False}
            payload.update(extra or {})
            env = dict(os.environ, AGENT_BOARD_HOME=tmp, ORCA_TERMINAL_HANDLE=eu)
            r = subprocess.run([sys.executable, CORE], input=json.dumps(payload), capture_output=True,
                               text=True, env=env, timeout=10)
            return json.loads(r.stdout)
        out = stop(R)
        ok = out.get("decision") == "block" and "--responde-a" in out.get("reason", "")
        falhas += not ok
        print(f"{'ok  ' if ok else 'FALHA'} Stop segura researcher com mensagem sem resposta")
        ids = ",".join(l["id"] for l in log if l["para"] == "alpha-researcher01-cc")
        rodar(tmp, R, f'orca orchestration send --to alpha-manager01-cc --type resposta --responde-a {ids} --subject ok')
        ok = stop(R) == {}
        falhas += not ok
        print(f"{'ok  ' if ok else 'FALHA'} Stop libera depois da resposta (uma resposta cobre várias)")
        ok = stop(G2) == {} and stop(R, {"agent_id": "sub"}) == {} and stop(ORFAO) == {}
        falhas += not ok
        print(f"{'ok  ' if ok else 'FALHA'} Stop não mexe em quem não deve, subagent ou painel sem cadastro")
        vezes = [stop(M).get("decision") for _ in range(4)]
        ok = vezes == ["block", "block", "block", None]
        falhas += not ok
        print(f"{'ok  ' if ok else 'FALHA'} Stop cobra no máximo 3 vezes ({vezes})")
        # Falha do próprio hook num envio do time: barra (fail-closed).
        json_quebrado = os.path.join(tmp, "paineis.json")
        open(json_quebrado, "w").write("{quebrado")
        h = rodar(tmp, G1, 'orca orchestration send --to alpha-master --type aviso --subject x')
        ok = h.get("permissionDecision") == "deny" and "falhou" in h.get("permissionDecisionReason", "")
        falhas += not ok
        print(f"{'ok  ' if ok else 'FALHA'} hook quebrado barra envio (fail-closed)")
        h = rodar(tmp, G1, "git status")
        ok = h == {}
        falhas += not ok
        print(f"{'ok  ' if ok else 'FALHA'} hook quebrado não atrapalha comando comum")
        extra_ok, extra_total = teste_aviso()
        falhas += extra_total - extra_ok
    finally:
        shutil.rmtree(tmp)
    total = len(CASOS) + 10 + extra_total
    print(f"\n{total - falhas}/{total} ok")
    sys.exit(1 if falhas else 0)


if __name__ == "__main__":
    main()
