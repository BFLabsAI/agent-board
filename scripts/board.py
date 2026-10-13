#!/usr/bin/env python3
"""
board.py: mandar mensagem ao time pela linha de comando, em qualquer transporte.

  board.py send --to <agente> --type <tipo> --subject "..." [--body "..." | --body-file <arq|->]
                [--modo orquestrar|executar] [--issues 12,13] [--responde-a <id>[,<id>]]
                [--prazo 30m|2h|1d] [--veredito aprovado|rejeitado]

Mesmas flags e mesmas regras do `orca orchestration send` (passa pelo hook_core).
Entrega pelo transporte do destino: Orca ou Maestri (`maestri ask`). É o jeito de
falar com o time num terminal do Maestri; no Orca, o comando orca continua valendo.
Sai com 1 quando a mensagem é barrada ou não é entregue, com o motivo no stderr.
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import envio  # noqa: E402
from base import Barrado  # noqa: E402
from politica import MODOS, TIPOS  # noqa: E402


def send(args):
    p = argparse.ArgumentParser(prog="board.py send", description="Manda uma mensagem a outro agente do time.")
    p.add_argument("--to", required=True, help="agente do time (o nome curto vale) ou papel:<papel>")
    p.add_argument("--type", required=True, choices=TIPOS)
    p.add_argument("--subject", required=True)
    corpo = p.add_mutually_exclusive_group()
    corpo.add_argument("--body", help="texto da mensagem")
    corpo.add_argument("--body-file", help="lê o texto deste arquivo ('-' = entrada padrão)")
    p.add_argument("--modo", choices=MODOS)
    p.add_argument("--issues", help="números de Issue, separados por vírgula")
    p.add_argument("--responde-a", dest="responde_a", help="id(s) da mensagem respondida, separados por vírgula")
    p.add_argument("--prazo", help="só em pedido: 30m, 2h, 1d")
    p.add_argument("--veredito", choices=("aprovado", "rejeitado"))
    a = p.parse_args(args)
    texto = a.body
    if a.body_file:
        with (sys.stdin if a.body_file == "-" else open(a.body_file)) as f:
            texto = f.read()
    issues = [int(x) for x in (a.issues or "").replace(" ", "").split(",") if x.isdigit()]
    campos = {"para": a.to, "tipo": a.type, "assunto": a.subject, "corpo": texto, "modo": a.modo,
              "issues": issues, "responde_a": a.responde_a, "prazo": a.prazo, "veredito": a.veredito}
    try:
        saida, erro = envio.enviar(campos)
    except Barrado as exc:
        saida, erro = f"Barrado pelo agent-board: {exc}", True
    print(saida, file=sys.stderr if erro else sys.stdout)
    return 1 if erro else 0


def main():
    if len(sys.argv) < 2 or sys.argv[1] != "send":
        sys.exit(__doc__)
    sys.exit(send(sys.argv[2:]))


if __name__ == "__main__":
    main()
