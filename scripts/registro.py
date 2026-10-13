"""
agent-board: o log do projeto (docs/agent-board/comunicacoes.jsonl).

Uma linha JSON por evento. Só este módulo escreve no log, sempre sob trava.
"""
import hashlib
import json
import os

from base import HOME, LOG_REL, registrar_aviso, trava


def trava_do_log(raiz):
    """Trava fora do log (em $AGENT_BOARD_HOME), para o arquivar poder trocar o arquivo inteiro."""
    chave = hashlib.sha1(os.path.abspath(raiz).encode()).hexdigest()[:16]
    return trava(os.path.join(HOME, "travas", chave + ".lock"))


def gravar_log(raiz, linha):
    caminho = os.path.join(raiz, LOG_REL)
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with trava_do_log(raiz), open(caminho, "a") as f:
        f.write(json.dumps(linha, ensure_ascii=False) + "\n")


def ler_log(raiz):
    """Mensagens do log do projeto, sem as que falharam no envio.

    Linha ilegível (escrita cortada, merge ruim) é pulada e anotada em avisos.log,
    para não travar o time inteiro.
    """
    linhas, falhas = [], set()
    try:
        with open(os.path.join(raiz, LOG_REL)) as f:
            for n, texto in enumerate(f, 1):
                if not texto.strip():
                    continue
                try:
                    l = json.loads(texto)
                except ValueError:
                    registrar_aviso(f"{LOG_REL}:{n} linha ilegível ignorada")
                    continue
                if l.get("status") == "falhou":
                    falhas.add(l.get("id"))
                elif "id" in l:
                    linhas.append(l)
    except FileNotFoundError:
        pass
    return [l for l in linhas if l["id"] not in falhas]
