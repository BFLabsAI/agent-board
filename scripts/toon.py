"""
agent-board: TOON (Token-Oriented Object Notation), só a parte de escrever.

Usado na saída que vai para o contexto de um agente (histórico, tarefas,
listagem): a mesma tabela em JSON gasta bem mais tokens. O log continua em JSONL.

    mensagens[2]{id,de,tipo}:
      c-1,alpha-master,pedido
      c-2,alpha-manager01-cc,resposta

Regras de aspas seguem a especificação TOON: texto vazio, com espaço nas
pontas, com o delimitador, ':', aspas, '\\', quebra de linha, que comece com
'-' ou que pareça número/true/false/null vai entre aspas, com escape.
"""
import json
import re

_NUMERO = re.compile(r"^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$")
_ESCAPES = {"\\": "\\\\", '"': '\\"', "\n": "\\n", "\r": "\\r", "\t": "\\t"}


def valor(v, delim=","):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return json.dumps(v)
    if isinstance(v, (list, tuple)):  # lista dentro da célula vira texto separado por espaço
        v = " ".join(str(x) for x in v)
    s = str(v)
    precisa = (s == "" or s != s.strip() or s in ("true", "false", "null") or _NUMERO.match(s)
               or s.startswith("-") or any(c in s for c in (delim, ":", '"', "\\", "\n", "\r", "\t", "[", "]", "{", "}")))
    if not precisa:
        return s
    return '"' + "".join(_ESCAPES.get(c, c) for c in s) + '"'


def chave(k):
    return k if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.]*", k) else valor(k)


def tabela(nome, linhas, campos=None):
    """Lista de dicts -> bloco TOON tabular. `campos` fixa a ordem das colunas."""
    if campos is None:
        campos = []
        for l in linhas:
            campos += [k for k in l if k not in campos]
    cab = f"{chave(nome)}[{len(linhas)}]"
    if not linhas:
        return cab + ":"
    out = [f"{cab}{{{','.join(chave(c) for c in campos)}}}:"]
    for l in linhas:
        out.append("  " + ",".join(valor(l.get(c)) for c in campos))
    return "\n".join(out)


def objeto(d, indent=0):
    """Dict de primitivos e listas de dicts -> TOON aninhado."""
    pad = "  " * indent
    out = []
    for k, v in d.items():
        if isinstance(v, dict):
            out.append(f"{pad}{chave(k)}:")
            out.append(objeto(v, indent + 1))
        elif isinstance(v, list) and v and all(isinstance(x, dict) for x in v):
            out.append("\n".join(pad + l for l in tabela(k, v).split("\n")))
        elif isinstance(v, list) and not v:
            out.append(f"{pad}{chave(k)}[0]:")
        elif isinstance(v, list):
            out.append(f"{pad}{chave(k)}[{len(v)}]: " + ",".join(valor(x) for x in v))
        else:
            out.append(f"{pad}{chave(k)}: {valor(v)}")
    return "\n".join(out)
