"""
agent-board: envio de uma mensagem do time, pelo transporte do destino.

Usado pelo servidor MCP (board_send) e pela CLI board.py. A regra não mora aqui:
o envio monta o mesmo `orca orchestration send` que o agente escreveria e passa
por hook_core.decide() com eventos PreToolUse e PostToolUse sintéticos, como o
hook faria. Depois entrega pelo transporte do destino:
  - Orca: roda o comando traduzido;
  - Maestri: `maestri ask "<nome no canvas>" "<mensagem>"` (maestri.py).
"""
import os
import re
import secrets
import shlex
import subprocess

import hook_core
import maestri
import registro
from base import Barrado, achar_orca, carregar_paineis, eh_maestri, meu_handle, registrar_aviso

CID_RE = re.compile(r"\[(c-\d{8}-\d{6}-[0-9a-f]+) ")
CAMPOS = (("modo", "--modo"), ("responde_a", "--responde-a"), ("prazo", "--prazo"), ("veredito", "--veredito"))


def quem_sou():
    """(handle, cadastro) deste terminal. Sem cadastro, explica e para."""
    handle = meu_handle()
    eu = carregar_paineis().get(handle)
    if eu is None:
        raise Barrado(f"este painel ({handle or 'sem $ORCA_TERMINAL_HANDLE nem $MAESTRI_TERMINAL_ID'}) não está "
                      "cadastrado no agent-board. Peça ao master para cadastrar o painel com painel.py cadastrar")
    return handle, eu


def evento(nome, cmd, tid, resposta=None):
    """Evento do hook como o Claude Code mandaria para uma chamada do Bash, marcado como envio do agent-board."""
    p = {"hook_event_name": nome, "tool_name": "Bash", "tool_input": {"command": cmd}, "tool_use_id": tid,
         "agent_board_envio": True, "cwd": os.getcwd()}  # cwd: branch do floor na entrega
    if resposta is not None:
        p["tool_response"] = resposta
    return hook_core.normalize(p, "claude")


def comando(a):
    """Campos do envio -> o `orca orchestration send` equivalente (o que o hook sabe ler)."""
    argv = ["orca", "orchestration", "send", "--to", a["para"], "--type", a["tipo"], "--subject", a["assunto"]]
    if a.get("corpo"):
        argv += ["--body", a["corpo"]]
    for chave, flag in CAMPOS:
        if a.get(chave):
            argv += [flag, a[chave]]
    if a.get("issues"):
        argv += ["--issues", ",".join(str(i) for i in a["issues"])]
    return shlex.join(argv)


def _valor(argv, flag):
    return argv[argv.index(flag) + 1] if flag in argv else ""


def mensagem_maestri(argv, de):
    """O texto que aparece no terminal do destino (assunto com id, remetente, corpo com o rodapé)."""
    return f"[agent-board] {_valor(argv, '--subject')}\nDe: {de}\n\n{_valor(argv, '--body')}".rstrip()


def entregar(final, eu):
    """(saída, código) da entrega do comando traduzido, pelo transporte do destino."""
    para = _valor(final, "--to")
    if eh_maestri(para):
        dest = carregar_paineis().get(para) or {}
        nome = dest.get("nome_canvas") or dest.get("agente") or para
        m = CID_RE.search(_valor(final, "--subject"))
        ok, saida = maestri.ask_destacado(nome, mensagem_maestri(final, eu["agente"]), m.group(1) if m else "envio")
        return saida, 0 if ok else 1
    final = list(final)
    final[0] = achar_orca()
    try:
        r = subprocess.run(final, capture_output=True, text=True, timeout=60, stdin=subprocess.DEVNULL)
        return (r.stdout or "") + (r.stderr or ""), r.returncode
    except (OSError, subprocess.TimeoutExpired) as exc:
        return f"error: {exc}", -1


def enviar(a):
    """Envia uma mensagem do time. Devolve (texto para quem enviou, erro?)."""
    handle, eu = quem_sou()
    cmd = comando(a)
    tid = "ab_" + secrets.token_hex(8)
    try:
        d = hook_core.decide(evento("PreToolUse", cmd, tid))
    except Exception as exc:  # a política quebrou: barra, como o FAIL_CLOSED do hook
        return f"Barrado: o hook agent-board falhou ({exc!r}); avise o master.", True
    if d is None or d.get("action") != "allow":
        motivo = d["reason"] if d else f"{a['para']} não é um agente do time; este envio é só para o time"
        return motivo, True
    traduzido = d["updated_input"]["command"]
    saida, codigo = entregar(shlex.split(traduzido), eu)
    if codigo != 0 and not re.search(r"\berror\b", saida, re.I):
        saida += f"\nerror: a entrega saiu com código {codigo}"  # para o post_send marcar a falha no log
    try:  # aviso na tela do destino (Orca), webhook, ou a marca de falha no log
        hook_core.decide(evento("PostToolUse", traduzido, tid, saida))
    except Exception as exc:
        registrar_aviso(f"pós-envio falhou: {exc!r}")
    m = CID_RE.search(traduzido)
    cid = m.group(1) if m else "?"
    # quem decide se falhou é o post_send do hook: mensagem que falhou some do log ativo
    if codigo != 0 or cid not in {l["id"] for l in registro.ler_log(eu["raiz"])}:
        return f"{cid} NÃO entregue (o log marca como falhou; o master pode reenviar).\n{saida.strip()}", True
    return f"{cid} enviada para {a['para']} ({a['tipo']}).\n{saida.strip()}", False
