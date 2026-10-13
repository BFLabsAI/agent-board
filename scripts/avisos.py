"""
agent-board: aviso digitado na tela do destino quando chega mensagem.

Roda num processo separado (hook_core.py --avisar). No máximo 1 aviso por destino
a cada JANELA_AVISO s, e nunca por cima de um diálogo aberto na tela.
disparar() abre esse processo; o hook, o ping-pong e o painel.py vigiar usam.
"""
import json
import os
import re
import subprocess
import sys
import time

from base import HOME, achar_orca, carregar_paineis, eh_maestri, ler_json, registrar_aviso, trava


DIALOGO = re.compile(r"Enter to confirm|Esc to cancel|Do you want to|\(y/n\)|Press Enter", re.I)


JANELA_AVISO = float(os.environ.get("AGENT_BOARD_JANELA_AVISO", "60"))  # segundos entre avisos digitados por destino
ESTADO_AVISO = os.path.join(HOME, "avisos-estado.json")
ESTADO_ALERTAS = os.path.join(HOME, "alertas-estado.json")
HOOK_CORE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hook_core.py")


def disparar(handle, cid, texto):
    """Digita `texto` na tela de `handle` num processo separado (hook_core.py --avisar), sem esperar."""
    try:
        with open(os.path.join(HOME, "avisos.log"), "a") as erros:
            subprocess.Popen([sys.executable, HOOK_CORE, "--avisar", handle, cid, texto],
                             stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                             stderr=erros, start_new_session=True)
    except OSError as exc:
        registrar_aviso(f"{cid} aviso não enviado: {exc}")


def uma_vez(chave, segundos):
    """True na primeira chamada com `chave` dentro de `segundos`; False nas seguintes (estado sob trava)."""
    with trava(ESTADO_ALERTAS + ".lock"):
        estado = ler_json(ESTADO_ALERTAS, {})
        agora = time.time()
        if agora - estado.get(chave, 0) < segundos:
            return False
        estado = {k: v for k, v in estado.items() if agora - v < 7 * 86400}  # não cresce para sempre
        estado[chave] = agora
        tmp = ESTADO_ALERTAS + ".tmp"
        with open(tmp, "w") as f:
            json.dump(estado, f)
        os.replace(tmp, ESTADO_ALERTAS)
        return True


def com_estado(fn):
    """Lê, altera e grava o estado dos avisos sob trava de arquivo. fn(dict) -> resultado."""
    with trava(ESTADO_AVISO + ".lock"):
        estado = ler_json(ESTADO_AVISO, {})
        r = fn(estado)
        tmp = ESTADO_AVISO + ".tmp"
        with open(tmp, "w") as f:
            json.dump(estado, f)
        os.replace(tmp, ESTADO_AVISO)
        return r


def reservar_aviso(handle):
    """Reserva o direito de digitar em `handle`. Devolve 0 se reservou, ou os segundos que faltam para a janela fechar."""
    def f(estado):
        falta = estado.get(handle, 0) + JANELA_AVISO - time.time()
        if falta > 0:
            return falta
        estado[handle] = time.time()
        return 0
    return com_estado(f)


def tem_nao_lida(handle, orca):
    """True se o destino ainda tem mensagem não lida no correio. Na dúvida (erro do orca), True."""
    try:
        r = subprocess.run([orca, "orchestration", "inbox", "--terminal", handle, "--json", "--limit", "50"],
                           capture_output=True, text=True, timeout=30)
        msgs = json.loads(r.stdout[r.stdout.index("{"):])["result"]["messages"]
    except (subprocess.TimeoutExpired, ValueError, KeyError, OSError):
        return True
    return any(m.get("to_handle") == handle and not m.get("read") for m in msgs)


def avisar(handle, cid, texto):
    """Processo separado. No máximo 1 aviso digitado por destino a cada JANELA_AVISO s.
    Dentro da janela, espera ela fechar e só digita se ainda houver mensagem não lida (a mensagem fica sempre no correio).
    Também não digita se o destino estiver com uma pergunta aberta na tela.
    Painel do Maestri: o aviso vai pelo `maestri ask` (o Maestri digita quando o terminal fica livre)."""
    if eh_maestri(handle):
        import maestri
        dest = carregar_paineis().get(handle) or {}
        nome = dest.get("nome_canvas") or dest.get("agente") or handle
        ok, saida = maestri.ask_destacado(nome, texto, f"aviso-{cid}")
        registrar_aviso(f"{cid} aviso {'digitado' if ok else 'NÃO digitado'} em {nome} pelo Maestri"
                        + ("" if ok else f": {saida[:200]}"))
        return
    orca = achar_orca()
    falta = reservar_aviso(handle)
    if falta:
        time.sleep(falta)
        if not tem_nao_lida(handle, orca):
            registrar_aviso(f"{cid} aviso NÃO digitado em {handle}: janela de {JANELA_AVISO:g}s e nada não lido; a mensagem está no correio")
            return
        if reservar_aviso(handle):
            registrar_aviso(f"{cid} aviso NÃO digitado em {handle}: outro aviso já saiu nesta janela; a mensagem está no correio")
            return
    try:
        tela = subprocess.run([orca, "terminal", "read", "--terminal", handle, "--screen"],
                              capture_output=True, text=True, timeout=30).stdout
    except subprocess.TimeoutExpired:
        tela = ""
    fim = "\n".join(tela.strip().splitlines()[-15:])
    if DIALOGO.search(fim):
        registrar_aviso(f"{cid} aviso NÃO digitado em {handle}: tela com pergunta aberta; a mensagem está no correio")
        return
    try:
        r = subprocess.run([orca, "terminal", "send", "--terminal", handle, "--text", texto, "--enter",
                            "--wait-submit", "15"], capture_output=True, text=True, timeout=60)
        registrar_aviso(f"{cid} aviso digitado em {handle} (saída {r.returncode})")
    except subprocess.TimeoutExpired:
        registrar_aviso(f"{cid} aviso enviado a {handle}, sem confirmação em 60s (destino ocupado?)")
