"""
agent-board: a CLI `maestri` (canvas do Maestri) vista pelo agent-board.

Só chamadas com lista de argumentos e timeout (menos o `ask`, que roda destacado
e é conferido por ESPERA_FALHA s). Nenhuma função aqui decide
regra do time: quem decide é o hook (hook_core/politica).
"""
import os
import re
import shutil
import subprocess
import time

from base import HOME, agora, registrar_aviso

ESPERA_FALHA = 3.0  # segundos: um ask que falha (não conectado, nome errado) sai antes disso
# A CLI sai com código 0 mesmo quando recusa ("Terminal 'X' not found", "This terminal is not the
# Maestro", "Note 'X' not found"): o que vale é o texto do começo da saída.
FALHA_RE = re.compile(r"^(?:Terminal|Agent|Note|Portal|Routine|Floor|Role) '.*' (?:not found|is not connected)|"
                      r"not connected to you|^This terminal is not the Maestro|"
                      r"^Unknown command|read[- ]only|is locked|^error\b", re.I | re.M)


def falhou(codigo, saida):
    return codigo != 0 or bool(FALHA_RE.search((saida or "")[:500]))
ASKS = os.path.join(HOME, "maestri-ask")


def binario():
    for c in (os.environ.get("MAESTRI_CLI", ""), shutil.which("maestri") or "",
              os.path.expanduser("~/.maestri/bin/maestri")):
        if c and os.access(c, os.X_OK):
            return c
    return None


def disponivel():
    """Este terminal está num canvas do Maestri e a CLI existe."""
    return bool(os.environ.get("MAESTRI_TERMINAL_ID")) and binario() is not None


def rodar(args, timeout=30):
    """(código, saída) de `maestri <args>`. 1 quando a CLI recusou (mesmo saindo com 0); -1 sem CLI ou travou."""
    b = binario()
    if b is None:
        return -1, "a CLI maestri não está instalada neste terminal"
    try:
        r = subprocess.run([b] + list(args), capture_output=True, text=True, timeout=timeout,
                           stdin=subprocess.DEVNULL)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return -1, f"maestri {args[0] if args else ''}: {exc}"
    saida = (r.stdout or "") + (r.stderr or "")
    return (1 if falhou(r.returncode, saida) else 0), saida


def meu_nome():
    """Nome deste terminal no canvas (linha `name:` sob `You:` do `maestri list`), ou None."""
    codigo, saida = rodar(["list"], timeout=15)
    if codigo != 0:
        return None
    # `- name: "Shell #2", maestro: true`: o nome é o texto entre aspas; o que vem depois são atributos
    m = re.search(r'^You:\s*\n\s*-\s*name:\s*(?:"((?:[^"\\]|\\.)*)"|([^,\n]+))', saida, re.M)
    if not m:
        return None
    return (m.group(1).replace('\\"', '"') if m.group(1) is not None else m.group(2).strip()) or None


def texto_cru(texto):
    """O `maestri ask` decodifica \\n e \\t nos argumentos: barra invertida literal vai dobrada."""
    return texto.replace("\\", "\\\\")


def ask_destacado(nome, texto, rotulo):
    """Digita `texto` no terminal `nome` com `maestri ask`, sem esperar a resposta.

    O ask só termina quando o destino fica ocioso, o que pode levar minutos. Ele
    roda em processo separado; se sair com erro em até ESPERA_FALHA segundos
    (destino não conectado, nome errado), é falha de entrega. A saída fica em
    $AGENT_BOARD_HOME/maestri-ask/<rotulo>.log. Devolve (entregue, saída).
    """
    b = binario()
    if b is None:
        return False, "error: a CLI maestri não está instalada neste terminal"
    os.makedirs(ASKS, exist_ok=True)
    limpar_velhos(ASKS, 7 * 86400)
    caminho = os.path.join(ASKS, re.sub(r"[^A-Za-z0-9_.-]", "_", rotulo) + ".log")
    with open(caminho, "w") as saida:
        saida.write(f"{agora().isoformat(timespec='seconds')} ask {nome!r}\n")
        saida.flush()
        try:
            p = subprocess.Popen([b, "ask", nome, texto_cru(texto)], stdin=subprocess.DEVNULL,
                                 stdout=saida, stderr=subprocess.STDOUT, start_new_session=True)
        except OSError as exc:
            return False, f"error: maestri ask: {exc}"
    fim = time.time() + ESPERA_FALHA
    while time.time() < fim and p.poll() is None:
        time.sleep(0.05)
    if p.poll() is None:
        return True, f"entregue a {nome} pelo Maestri (log: {caminho})"
    with open(caminho, errors="replace") as f:
        erro = f.read().split("\n", 1)[-1].strip()
    if not falhou(p.returncode, erro):
        return True, f"entregue a {nome} pelo Maestri (log: {caminho})"
    registrar_aviso(f"{rotulo} maestri ask para {nome!r} falhou: {erro[:200]}")
    return False, f"error: maestri ask para {nome!r} falhou ({p.returncode}): {erro}"


FICHARIO = "agent-board"
MAX_NOTA = 60000  # caracteres: o fim do arquivo do tema, que é o que importa


def nome_da_nota(tema):
    return f"ab · {tema}"


def espelhar_nota(tema, conteudo):
    """Copia o arquivo do tema para a nota "ab · <tema>" do canvas (fichário agent-board).

    Tenta `note write` (a nota já existe e está ligada a este terminal); se não der,
    `note create` com nome fixo. Devolve (ok, mensagem). Nunca levanta exceção.
    """
    nome = nome_da_nota(tema)
    texto = texto_cru(conteudo[-MAX_NOTA:])
    codigo, saida = rodar(["note", "write", nome, texto])
    if codigo == 0:
        return True, f"nota do canvas {nome!r} atualizada"
    codigo, saida = rodar(["note", "create", texto, "--name", nome, "--stack", FICHARIO])
    if codigo == 0:
        return True, f"nota do canvas {nome!r} criada no fichário {FICHARIO}"
    return False, f"nota do canvas {nome!r} não espelhada: {saida.strip()[:200]}"


def limpar_velhos(pasta, segundos):
    try:
        for nome in os.listdir(pasta):
            c = os.path.join(pasta, nome)
            if time.time() - os.path.getmtime(c) > segundos:
                os.remove(c)
    except OSError:
        pass
