#!/usr/bin/env python3
"""
painel.py: cadastro de painéis e comandos do projeto no agent-board.
Cadastro, arquivar, reenviar, vigiar e maestri são do master; os demais servem a qualquer agente.

  painel.py init --raiz <project-path> --projeto <project-name> --prefixo <project-prefix>
                 [--transporte orca|maestri] [--atualizar-contrato]
      Cria docs/agent-board/ no projeto (config, CONTRATO.md, log vazio) e a linha
      merge=union no .gitattributes. Projeto novo precisa saber a interface do time:
      --transporte orca|maestri (sem a flag, usa a do terminal atual, se for uma só).
      O CONTRATO.md sai adaptado a ela. Num projeto que já existe, --transporte troca
      de interface e refaz o contrato. Não sobrescreve o que já existe; com
      --atualizar-contrato, refaz o CONTRATO.md pela versão atual da skill.
  painel.py listar [--formato toon]
      Mostra os terminais abertos no Orca, o cadastro de cada um e os pedidos de cadastro do Maestri.
  painel.py cadastrar --raiz <project-path> [--worktree] <term_...|maestri:<id>>=<agente> [...]
      Cadastra (ou recadastra) painéis do projeto. Só depois de o CEO confirmar a lista.
      --worktree: cada manager ganha um git worktree em <raiz>/../<projeto>-worktrees/<agente>
      na branch ab/<agente>. O log continua no checkout principal (a raiz).
  painel.py remover <term_...|maestri:<id>> [...]
      Tira painéis do cadastro.

Log do projeto (cada um aceita --help):
  painel.py historico --raiz <path> [--agente X] [--sobre texto] [--n 20] [--tudo] [--formato toon|json]
      Últimas mensagens, em TOON por padrão (economiza tokens no contexto do agente).
  painel.py verificar --raiz <path>
      Confere a cadeia de hash do log e do arquivo morto. Sai com 1 se achar adulteração.
  painel.py arquivar --raiz <path> [--dias 30]
      Move conversas fechadas e antigas para docs/agent-board/arquivo/AAAA-MM.jsonl.
  painel.py reenviar --raiz <path> <id>
      Reenvia uma mensagem (ex.: o painel fechou antes de ler) para o painel atual do destino,
      pelo transporte dele (Orca ou Maestri).

Pedidos e entregas (cada um aceita --help):
  painel.py tarefas --raiz <path> [--agente X] [--formato toon|json]
      Quadro com uma linha por pedido/entrega e o estado: aberto, em_andamento, concluido,
      atrasado, aguardando_revisao, aprovado, rejeitado.
  painel.py vigiar --raiz <path>
      Escala ao master os pedidos com prazo vencido e sem resposta (uma vez cada). Para cron ou /loop.
  painel.py simular --raiz <path> --config <novo.json> [--tudo] [--formato toon|json]
      Reexecuta o log contra uma config nova e lista o que seria barrado. Sai com 1 se algo seria.

Recursos do time (cada um aceita --help):
  painel.py nota --raiz <path> --tema <tema> [--decisao] [--de <autor>] "<texto>"
      Acrescenta uma nota (ou decisão) em docs/agent-board/notas/<tema>.md e registra no log.
  painel.py notas --raiz <path> [--tema X] [--formato toon|json|md]
      Lista os temas, ou mostra as notas de um tema.
  painel.py resumo --raiz <path> [--desde 2h|1d|30m] [--formato texto|toon]
      O que aconteceu no período: contagens, pendências, entregas, escalações e notas.

Painel web (só leitura, 127.0.0.1; ver docs/userguide/painel.md):
  painel.py servir [--raiz <path>] [--porta 8765]
  painel.py servico instalar|status|remover [--porta 8765] [--dry-run]
      Painel sempre ligado (systemd) e exposto só na tailnet (tailscale serve); ver docs/referencia/painel-api.md.

Maestri (canvas; cada um aceita --help; ver docs/adr/0006-maestri-como-transporte.md):
  painel.py eu [--formato texto|toon]            handle e nome no canvas deste terminal
  painel.py solicitar --raiz <path> --agente <nome>   o agente pede o próprio cadastro
  painel.py solicitacoes [--formato texto|toon]  o master vê os pedidos (cadastra depois do CEO)
  painel.py maestri conectar --raiz <path> [--aplicar]   cordas do canvas que a política exige
  painel.py maestri rotina --raiz <path> [--a-cada 10m] [--aplicar]   vigiar como routine

O cadastro fica em $AGENT_BOARD_HOME/paineis.json (padrão ~/.agent-hooks/agent-board).
"""
import datetime
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from base import CONFIG_REL, LOG_REL, PAINEIS, achar_orca, ler_json, papel_do_nome, trava  # noqa: E402
import cmd_log  # noqa: E402
import contrato  # noqa: E402
import cmd_maestri  # noqa: E402
import cmd_servico  # noqa: E402
import cmd_tarefas  # noqa: E402
import cmd_time  # noqa: E402
import cmd_web  # noqa: E402
import toon  # noqa: E402

ORCA = achar_orca()
TEMPLATES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "templates")


def com_trava(alterar):
    with trava(PAINEIS + ".lock"):
        try:
            with open(PAINEIS) as f:
                dados = json.load(f)
        except FileNotFoundError:
            dados = {"versao": 1, "paineis": {}}
        alterar(dados["paineis"])
        tmp = PAINEIS + ".tmp"
        with open(tmp, "w") as f:
            json.dump(dados, f, ensure_ascii=False, indent=2)
        os.replace(tmp, PAINEIS)


def terminais():
    """Terminais abertos no Orca, ou None quando o orca não está disponível (ex.: só Maestri)."""
    try:
        out = subprocess.run([ORCA, "terminal", "list", "--json"], capture_output=True, text=True, timeout=30)
        d = json.loads(out.stdout)
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return None
    t = d.get("result", d)
    return t.get("terminals", t) if isinstance(t, dict) else t


def listar(args=()):
    formato = args[args.index("--formato") + 1] if "--formato" in args else "texto"
    try:
        with open(PAINEIS) as f:
            cad = json.load(f)["paineis"]
    except FileNotFoundError:
        cad = {}
    vistos, linhas = set(), []
    abertos = terminais()
    for t in abertos or []:
        h = t.get("handle") or t.get("id")
        vistos.add(h)
        c = cad.get(h) or {}
        linhas.append({"handle": h, "titulo": str(t.get("title", "")), "projeto": c.get("projeto"),
                       "agente": c.get("agente"), "situacao": "cadastrado" if c else "sem cadastro"})
    for h, c in cad.items():
        if h in vistos:
            continue
        if c.get("transporte") == "maestri":  # o Maestri não lista terminais por ID: vale o cadastro
            linhas.append({"handle": h, "titulo": c.get("nome_canvas", ""), "projeto": c["projeto"],
                           "agente": c["agente"], "situacao": "maestri"})
        elif abertos is not None:
            linhas.append({"handle": h, "titulo": "", "projeto": c["projeto"], "agente": c["agente"],
                           "situacao": "fechado: recadastrar"})
    for s in cmd_maestri.pendentes_de_cadastro():
        linhas.append({"handle": s["handle"], "titulo": s["nome_canvas"], "projeto": s.get("projeto"),
                       "agente": s["agente"], "situacao": "pediu cadastro"})
    if formato == "toon":
        print(toon.tabela("paineis", linhas, ["handle", "titulo", "projeto", "agente", "situacao"]))
        return
    if abertos is None:
        print("(orca indisponível: mostrando só o cadastro e os pedidos do Maestri)")
    for l in linhas:
        marca = f"{l['projeto']}/{l['agente']}" if l["agente"] else "(sem cadastro)"
        if l["situacao"] == "pediu cadastro":
            marca = f"pediu para ser {l['projeto']}/{l['agente']}"
        if l["situacao"].startswith("fechado"):
            print(f"{l['handle']}  (painel fechado ou reaberto)  {marca}  -> recadastrar")
        else:
            print(f"{l['handle']}  {l['titulo']:40.40}  {marca}")


def cadastrar(args):
    if "--raiz" not in args:
        sys.exit("informe --raiz <project-path>")
    com_worktree = "--worktree" in args
    args = [a for a in args if a != "--worktree"]
    i = args.index("--raiz")
    raiz = os.path.abspath(args[i + 1])
    pares = args[:i] + args[i + 2:]
    with open(os.path.join(raiz, CONFIG_REL)) as f:
        cfg = json.load(f)
    projeto, prefixo = cfg["projeto"], cfg["prefixo"]
    novos, canvas = {}, {}
    for par in pares:
        h, _, agente = par.partition("=")
        if not h.startswith(("term_", "maestri:")) or not agente:
            sys.exit(f"formato esperado term_...=<agente> ou maestri:<id>=<agente>, recebi: {par}")
        erro = contrato.checar_handle(cfg, h)
        if erro:
            sys.exit(erro)
        if h.startswith("maestri:"):  # o nome no canvas vem do pedido que o próprio terminal fez
            s = cmd_maestri.solicitacao(h)
            if not s or not s.get("nome_canvas"):
                sys.exit(f"{h} não pediu cadastro: no terminal do agente, rode painel.py solicitar --raiz {raiz} "
                         f"--agente {agente}")
            canvas[h] = s["nome_canvas"]
        if not agente.startswith(prefixo + "-") or not papel_do_nome(agente):
            sys.exit(f"nome fora do padrão {prefixo}-master | {prefixo}-<manager|researcher><NN>-<runtime>: {agente}")
        novos[h] = agente
    if len(set(novos.values())) != len(novos):
        sys.exit("o mesmo agente apareceu em dois painéis")
    wts = cmd_time.worktrees(raiz, novos) if com_worktree else {}
    ts = datetime.datetime.now().astimezone().isoformat(timespec="seconds")

    def alterar(paineis):
        for h, agente in novos.items():
            wt = wts.get(h)
            for velho in [k for k, v in paineis.items() if v["projeto"] == projeto and v["agente"] == agente]:
                wt = wt or paineis[velho].get("worktree")  # recadastro sem --worktree mantém o worktree
                del paineis[velho]  # recadastro: o painel antigo daquele agente sai
            if h in paineis and paineis[h]["projeto"] != projeto:
                sys.exit(f"{h} já está cadastrado no projeto {paineis[h]['projeto']}")
            paineis[h] = {"projeto": projeto, "agente": agente, "papel": papel_do_nome(agente),
                          "raiz": raiz, "cadastrado_em": ts}
            if h in canvas:
                paineis[h].update(transporte="maestri", nome_canvas=canvas[h])
            if wt:
                paineis[h]["worktree"] = wt
    com_trava(alterar)
    for h, a in novos.items():
        print(f"cadastrado {h} = {projeto}/{a}")


def remover(handles):
    if not handles or any(h in ("-h", "--help") for h in handles):
        sys.exit("uso: painel.py remover <term_...|maestri:<id>> [...]\n"
                 "Tira painéis do cadastro (o handle aparece no painel.py listar).")
    ruins = [h for h in handles if not h.startswith(("term_", "maestri:"))]
    if ruins:
        sys.exit(f"não parece um painel (esperado term_... ou maestri:<id>): {' '.join(ruins)}")
    saiu = []

    def alterar(paineis):
        for h in handles:
            if paineis.pop(h, None) is not None:
                saiu.append(h)
    com_trava(alterar)
    print("removidos:", " ".join(saiu) if saiu else "nenhum")
    faltou = [h for h in handles if h not in saiu]
    if faltou:
        print("não estavam no cadastro:", " ".join(faltou))


def init(args):
    def valor(flag, obrigatorio=True):
        if flag not in args:
            if obrigatorio:
                sys.exit(f"informe {flag}")
            return None
        i = args.index(flag)
        if i + 1 >= len(args) or args[i + 1].startswith("--"):
            sys.exit(f"{flag} precisa de um valor")
        return args[i + 1]
    raiz, projeto, prefixo = os.path.abspath(valor("--raiz")), valor("--projeto"), valor("--prefixo")
    pedido = valor("--transporte", obrigatorio=False)
    if not re.fullmatch(r"[a-z0-9]+", prefixo):
        sys.exit("prefixo: só letras minúsculas e números, sem hífen (ex.: <project-prefix>)")
    if pedido is not None and pedido not in contrato.TRANSPORTES:
        sys.exit(f"--transporte: use orca ou maestri (recebi {pedido!r})")
    cfg = os.path.join(raiz, CONFIG_REL)
    dados = ler_json(cfg, None)
    transporte, mudou = contrato.transporte_de(dados), False
    if dados is None:  # projeto novo: a interface precisa estar clara antes de criar qualquer coisa
        try:
            transporte, como = contrato.escolher(pedido)
        except ValueError as exc:
            sys.exit(str(exc))
        with open(os.path.join(TEMPLATES, "agent-board.json")) as f:
            dados = json.load(f)
        dados["projeto"], dados["prefixo"], dados["transporte"] = projeto, prefixo, transporte
        mudou = True
        aviso = f"transporte: {transporte}" + (" (detectado neste terminal; use --transporte para mudar)"
                                               if como == "detectado" else "")
    elif pedido is not None and pedido != transporte:  # trocar de interface num projeto que já existe
        aviso = f"transporte: {transporte or 'sem escolha'} → {pedido}"
        transporte, dados["transporte"], mudou = pedido, pedido, True
    else:
        aviso = f"transporte: {transporte}" if transporte else "transporte: sem escolha (contrato com as duas interfaces)"
    pasta = os.path.join(raiz, "docs", "agent-board")
    os.makedirs(pasta, exist_ok=True)
    if mudou:
        existia = os.path.exists(cfg)
        with open(cfg, "w") as f:
            json.dump(dados, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print("atualizado" if existia else "criado", cfg)
    print(aviso)
    arq_contrato = os.path.join(pasta, "CONTRATO.md")
    if not os.path.exists(arq_contrato) or "--atualizar-contrato" in args or (mudou and pedido is not None):
        with open(os.path.join(TEMPLATES, "CONTRATO.md")) as f:
            texto = contrato.renderizar(f.read(), transporte)
        with open(arq_contrato, "w") as f:
            f.write(texto)
        print("criado", arq_contrato)
    log = os.path.join(raiz, LOG_REL)
    if not os.path.exists(log):
        open(log, "a").close()
        print("criado", log)
    cmd_log.garantir_gitattributes(raiz)


COMANDOS = {"historico": cmd_log.historico, "verificar": cmd_log.verificar,
            "arquivar": cmd_log.arquivar, "reenviar": cmd_log.reenviar,
            "nota": cmd_time.nota, "notas": cmd_time.notas, "resumo": cmd_time.resumo,
            "servir": cmd_web.servir, "servico": cmd_servico.servico,
            "tarefas": cmd_tarefas.tarefas, "vigiar": cmd_tarefas.vigiar, "simular": cmd_tarefas.simular,
            "eu": cmd_maestri.eu, "solicitar": cmd_maestri.solicitar, "solicitacoes": cmd_maestri.solicitacoes,
            "maestri": cmd_maestri.maestri_cmd}


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == "init":
        init(args)
    elif cmd == "listar":
        listar(args)
    elif cmd in COMANDOS:
        COMANDOS[cmd](args)
    elif cmd == "cadastrar":
        cadastrar(args)
    elif cmd == "remover":
        remover(args)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
