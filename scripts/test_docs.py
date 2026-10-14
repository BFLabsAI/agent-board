#!/usr/bin/env python3
"""Testes da documentação: todo link relativo e toda âncora (#…) apontam para algo que existe.

  python3 scripts/test_docs.py
"""
import os
import re
import unittest

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
LINK_RE = re.compile(r"(?<!!)\[[^\]]*\]\(([^)\s]+)\)")
IGNORAR = {".git", ".claude", "node_modules"}


def arquivos_md():
    for pasta, subpastas, nomes in os.walk(RAIZ):
        subpastas[:] = [s for s in subpastas if s not in IGNORAR]
        for n in nomes:
            if n.endswith(".md") and not n.startswith("."):
                yield os.path.join(pasta, n)


def sem_codigo(texto):
    """Tira blocos ``` e `código` em linha (links ali dentro são exemplo, não link)."""
    texto = re.sub(r"```.*?```", "", texto, flags=re.S)
    return re.sub(r"`[^`\n]*`", "", texto)


def ancora(titulo):
    """Âncora no padrão do GitHub: minúsculas, sem pontuação, espaço vira hífen."""
    t = re.sub(r"[`*_\[\]()]", "", titulo.strip().lower())
    t = re.sub(r"[^\w\- ]", "", t, flags=re.U)
    return t.replace(" ", "-")


def ancoras_de(caminho):
    with open(caminho, encoding="utf-8") as f:
        texto = re.sub(r"```.*?```", "", f.read(), flags=re.S)
    vistos, out = {}, set()
    for m in re.finditer(r"^#{1,6}\s+(.+?)\s*#*\s*$", texto, re.M):
        a = ancora(m.group(1))
        n = vistos.get(a, 0)
        out.add(a if n == 0 else f"{a}-{n}")
        vistos[a] = n + 1
    return out


class Links(unittest.TestCase):
    def test_links_e_ancoras_existem(self):
        quebrados = []
        for md in arquivos_md():
            with open(md, encoding="utf-8") as f:
                texto = sem_codigo(f.read())
            for alvo in LINK_RE.findall(texto):
                if re.match(r"^[a-z]+:", alvo):  # http:, https:, mailto:
                    continue
                caminho, _, frag = alvo.partition("#")
                destino = os.path.normpath(os.path.join(os.path.dirname(md), caminho)) if caminho else md
                rel = os.path.relpath(md, RAIZ)
                if not os.path.exists(destino):
                    quebrados.append(f"{rel}: {alvo} (arquivo não existe)")
                elif frag and destino.endswith(".md") and frag not in ancoras_de(destino):
                    quebrados.append(f"{rel}: {alvo} (âncora não existe)")
        self.assertEqual(quebrados, [], "\n" + "\n".join(quebrados))


class Ancora(unittest.TestCase):
    def test_padrao_do_github(self):
        self.assertEqual(ancora("O que mudou desde o fork"), "o-que-mudou-desde-o-fork")
        self.assertEqual(ancora("Instalação"), "instalação")
        self.assertEqual(ancora("`painel.py` e o `board.py`"), "painelpy-e-o-boardpy")
        self.assertEqual(ancora("2. Montar o time (Orca)"), "2-montar-o-time-orca")


if __name__ == "__main__":
    unittest.main(verbosity=1)
