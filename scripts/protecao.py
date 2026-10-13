"""
agent-board: detecção de escrita à mão no log e no cadastro.

Funções puras sobre o texto do comando de shell; quem decide barrar é o hook.
"""
import fnmatch
import os
import re
import shlex


PROTEGIDOS = ("comunicacoes.jsonl", "paineis.json")
ESCRITA_RE = re.compile(r"\bsed\s+-i|\btee\b|\brm\b|\bmv\b|\bcp\b|\btruncate\b|\bdd\b|"
                        r"\bperl\s+-\w*i|write|open\([^)]*['\"][wax+]|\bunlink\b|\breplace\b|\btouch\b|\bchmod\b")
OPEN_ESCRITA_RE = re.compile(r"""open\(\s*(?:(['"])(?P<p>[^'"]+)\1)?[^)]*?['"][wax+][^'"]*['"]""")
WRITE_TEXT_RE = re.compile(r"""(?:Path\(\s*(?:(['"])(?P<p>[^'"]+)\1)?[^)]*\)|\w+)\.write(?:_text|_bytes)?\(""")
CMDS_ALVO_TODOS = {"rm", "unlink", "tee", "truncate", "touch", "chmod", "mv", "shred"}
OPERADORES = set(";&|()")


def _protegido(caminho):
    base = os.path.basename(caminho.rstrip("/"))
    return base in PROTEGIDOS or (any(c in base for c in "*?[") and any(fnmatch.fnmatchcase(n, base) for n in PROTEGIDOS))


def _duvida(caminho):
    """Alvo que não dá para resolver ($var, crase) conta como possível log."""
    return "$" in caminho or "`" in caminho


def alvos_de_escrita(cmd):
    """Lista os alvos de escrita do comando de shell, ou None se não deu para ler (aspas quebradas)."""
    try:
        lex = shlex.shlex(cmd, posix=True, punctuation_chars=True)
        lex.whitespace_split = True
        tokens = list(lex)
    except ValueError:
        return None
    alvos = []
    segmentos, atual = [], []
    for i, t in enumerate(tokens):
        if t and set(t) <= OPERADORES:
            segmentos.append(atual)
            atual = []
        else:
            atual.append(t)
        # redirecionamento de saída: o alvo é o próximo token
        if t and ">" in t and set(t) <= set("<>&|;0123456789"):
            prox = tokens[i + 1] if i + 1 < len(tokens) else ""
            if t.endswith("&") and re.fullmatch(r"\d+|-", prox):
                continue  # 2>&1, >&2
            if prox == "/dev/null" or not prox:
                continue
            alvos.append(prox)
    segmentos.append(atual)
    for seg in segmentos:
        for j, t in enumerate(seg):
            nome = os.path.basename(t)
            resto = seg[j + 1:]
            args = [a for a in resto if not a.startswith("-") or a == "-"]
            if nome in CMDS_ALVO_TODOS:
                alvos += args
            elif nome == "cp":
                alvos += args[-1:]
            elif nome == "sed" and any(re.fullmatch(r"-\w*i\w*|--in-place.*", a) for a in resto):
                alvos += args
            elif nome == "perl" and any(re.fullmatch(r"-\w*i\w*", a) for a in resto):
                alvos += args
            elif nome == "dd":
                alvos += [a[3:] for a in resto if a.startswith("of=")]
    return alvos


def escreve_em_protegido(cmd):
    """True quando algum alvo de escrita é o log ou o cadastro; na dúvida (alvo ilegível), True."""
    alvos = alvos_de_escrita(cmd)
    if alvos is None:
        return bool(ESCRITA_RE.search(cmd)) or ">" in cmd
    for a in alvos:
        if _protegido(a) or (_duvida(a) and any(n in cmd for n in PROTEGIDOS)):
            return True
        if os.path.basename(a.rstrip("/")) == "agent-board":  # rm -r docs/agent-board leva o log junto
            return True
    # python -c / heredoc: open(...,'w'|'a') e write_text/write
    for rx in (OPEN_ESCRITA_RE, WRITE_TEXT_RE):
        for m in rx.finditer(cmd):
            p = m.group("p")
            if p is None:
                if any(n in cmd for n in PROTEGIDOS):
                    return True  # alvo não literal e o nome do log está no comando
            elif _protegido(p):
                return True
    return False
