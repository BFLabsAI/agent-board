"""
painel.py: recursos do time (nota, notas, resumo) e o worktree por agente do cadastrar.

  - nota: memória compartilhada do time em docs/agent-board/notas/<tema>.md, uma
    linha {"tipo": "nota"} no log para cada uma (sem "para": ninguém é cobrado).
  - resumo: o que aconteceu no período, contado direto do log (sem LLM).
  - worktrees(): git worktree por manager, chamado pelo painel.py cadastrar --worktree.
"""
import argparse
import datetime
import hashlib
import json
import os
import re
import secrets
import subprocess
import sys
import unicodedata

import maestri
import registro
import toon
from base import HOME, agora, carregar_config, carregar_paineis, meu_handle, papel_do_nome, registrar_aviso, trava
from cmd_log import raiz_de

NOTAS_REL = "docs/agent-board/notas"
AUTOR_RE = re.compile(r"^[\w.@-]{1,60}$")
CABECALHO_RE = re.compile(r"^## (?P<ts>\S+) · (?P<de>\S+)(?P<decisao> · Decisão)? · (?P<id>n-\S+)$")
TIMEOUT_GIT = 60


# ---------------------------------------------------------------------------
# Notas
# ---------------------------------------------------------------------------
def slug(texto, maximo=60):
    """Texto livre -> [a-z0-9-]. Sem ponto nem barra, então não sai da pasta (../../etc vira etc)."""
    s = unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:maximo].strip("-")


def arquivo_do_tema(raiz, tema):
    return os.path.join(raiz, NOTAS_REL, tema + ".md")


def trava_da_nota(caminho):
    """Trava em $AGENT_BOARD_HOME, para não deixar .lock dentro do repositório."""
    chave = hashlib.sha1(os.path.abspath(caminho).encode()).hexdigest()[:16]
    return trava(os.path.join(HOME, "travas", "nota-" + chave + ".lock"))


def autor_da_nota(raiz, de):
    """Agente cadastrado é sempre ele mesmo (--de é ignorado); fora do cadastro (humano), --de é obrigatório."""
    eu = carregar_paineis().get(meu_handle())
    if eu is not None:
        if eu.get("projeto") != carregar_config(raiz).get("projeto"):
            sys.exit(f"{eu['agente']} é do projeto {eu.get('projeto')}; não escreve notas em {raiz}")
        return eu["agente"]
    if not de:
        sys.exit("fora de um painel cadastrado, informe --de <seu nome>")
    if not AUTOR_RE.match(de):
        sys.exit("--de: até 60 letras, números, '.', '_', '@' ou '-', sem espaço")
    return de


def nota(args):
    p = argparse.ArgumentParser(prog="painel.py nota")
    p.add_argument("--raiz", required=True)
    p.add_argument("--tema", required=True, help="vira nome de arquivo: só [a-z0-9-], até 60")
    p.add_argument("--decisao", action="store_true", help="marca a nota como decisão do time")
    p.add_argument("--de", help="autor, só para quem não está num painel cadastrado")
    p.add_argument("texto", nargs="+")
    a = p.parse_args(args)
    raiz = raiz_de(a.raiz)
    tema = slug(a.tema)
    if not tema:
        sys.exit("--tema precisa ter letras ou números")
    texto = " ".join(a.texto).strip()
    if not texto:
        sys.exit("a nota está vazia")
    autor = autor_da_nota(raiz, a.de)
    ts = agora().isoformat(timespec="seconds")
    nid = f"n-{agora():%Y%m%d-%H%M%S}-{secrets.token_hex(2)}"
    caminho = arquivo_do_tema(raiz, tema)
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    cab = f"## {ts} · {autor}" + (" · Decisão" if a.decisao else "") + f" · {nid}"
    with trava_da_nota(caminho):
        novo = not os.path.exists(caminho)
        with open(caminho, "a") as f:
            f.write((f"# {tema}\n\n" if novo else "") + f"{cab}\n\n{texto}\n\n")
        registro.gravar_log(raiz, {"id": nid, "ts": ts, "de": autor, "tipo": "nota",
                                   "tema": tema, "decisao": bool(a.decisao)})
    print(f"{nid} gravada em {os.path.relpath(caminho, raiz)}")
    espelhar_no_canvas(raiz, tema, caminho)


def espelhar_no_canvas(raiz, tema, caminho):
    """Com "maestri": {"espelhar_notas": true}, o tema também aparece como nota no canvas do Maestri."""
    if not carregar_config(raiz).get("maestri", {}).get("espelhar_notas") or not maestri.disponivel():
        return
    with open(caminho) as f:
        ok, msg = maestri.espelhar_nota(tema, f.read())
    print(msg)
    if not ok:
        registrar_aviso(msg)


def blocos(caminho):
    """Notas de um arquivo de tema: [{id, ts, de, decisao, texto}], na ordem em que foram escritas."""
    out = []
    try:
        with open(caminho) as f:
            linhas = f.read().splitlines()
    except FileNotFoundError:
        return out
    for l in linhas:
        m = CABECALHO_RE.match(l)
        if m:
            out.append({"id": m.group("id"), "ts": m.group("ts"), "de": m.group("de"),
                        "decisao": bool(m.group("decisao")), "texto": []})
        elif out:
            out[-1]["texto"].append(l)
    for b in out:
        b["texto"] = "\n".join(b["texto"]).strip()
    return out


def notas(args):
    p = argparse.ArgumentParser(prog="painel.py notas")
    p.add_argument("--raiz", required=True)
    p.add_argument("--tema", help="mostra as notas deste tema; sem ele, lista os temas")
    p.add_argument("--formato", choices=("toon", "json", "md"), default="toon")
    a = p.parse_args(args)
    raiz = raiz_de(a.raiz)
    if a.tema:
        tema = slug(a.tema)
        caminho = arquivo_do_tema(raiz, tema)
        if not tema or not os.path.exists(caminho):
            sys.exit(f"não há notas sobre {a.tema!r}; veja os temas com painel.py notas --raiz {a.raiz}")
        if a.formato == "md":
            with open(caminho) as f:
                sys.stdout.write(f.read())
            return
        bs = blocos(caminho)
        if a.formato == "json":
            print(json.dumps(bs, ensure_ascii=False, indent=2))
        else:
            print(toon.tabela("notas", bs, ["id", "ts", "de", "decisao", "texto"]))
        return
    pasta = os.path.join(raiz, NOTAS_REL)
    temas = []
    for nome in sorted(os.listdir(pasta)) if os.path.isdir(pasta) else []:
        if nome.endswith(".md"):
            bs = blocos(os.path.join(pasta, nome))
            temas.append({"tema": nome[:-3], "notas": len(bs), "decisoes": sum(b["decisao"] for b in bs),
                          "ultima": bs[-1]["ts"] if bs else None})
    if a.formato == "json":
        print(json.dumps(temas, ensure_ascii=False, indent=2))
    elif a.formato == "md":
        print("\n".join(f"- **{t['tema']}**: {t['notas']} nota(s), {t['decisoes']} decisão(ões), "
                        f"última em {t['ultima']}" for t in temas) or "(sem notas)")
    else:
        print(toon.tabela("temas", temas, ["tema", "notas", "decisoes", "ultima"]))


# ---------------------------------------------------------------------------
# Resumo
# ---------------------------------------------------------------------------
def periodo(texto):
    m = re.fullmatch(r"(\d+)([mhd])", texto or "")
    if not m or int(m.group(1)) == 0:
        raise argparse.ArgumentTypeError("use um número com m, h ou d (ex.: 30m, 2h, 1d)")
    return datetime.timedelta(**{{"m": "minutes", "h": "hours", "d": "days"}[m.group(2)]: int(m.group(1))})


def _ts(l):
    try:
        t = datetime.datetime.fromisoformat(str(l.get("ts", "")))
    except ValueError:
        return None
    return t if t.tzinfo else t.astimezone()  # sem fuso: hora local


def pendentes(msgs):
    """Mensagens que esperam resposta do destino (mesma regra da cobrança do Stop, sem o corte do cadastro)."""
    respondidas = set()
    for l in msgs:
        if l.get("tipo") == "resposta" and l.get("responde_a"):
            respondidas.update((l.get("de"), x.strip()) for x in str(l["responde_a"]).split(","))
    return [l for l in msgs if l.get("para") and l.get("tipo") not in ("resposta", "nota")
            and (l["para"], l["id"]) not in respondidas]


def montar_resumo(msgs, desde, ate, ultimas=5):
    """Digest do período [desde, ate]: tudo contado do log, sem interpretação."""
    no_periodo = [l for l in msgs if (_ts(l) or desde) >= desde]
    por_tipo, por_agente = {}, {}
    for l in no_periodo:
        por_tipo[l.get("tipo")] = por_tipo.get(l.get("tipo"), 0) + 1
        for campo, chave in (("de", "enviou"), ("para", "recebeu")):
            if l.get(campo):
                c = por_agente.setdefault(l[campo], {"agente": l[campo], "enviou": 0, "recebeu": 0})
                c[chave] += 1
    pend = {}
    for l in pendentes(msgs):
        pend.setdefault(l["para"], []).append(l)
    return {
        "periodo": {"desde": desde.isoformat(timespec="seconds"), "ate": ate.isoformat(timespec="seconds"),
                    "eventos": len(no_periodo)},
        "por_tipo": [{"tipo": t, "n": n} for t, n in sorted(por_tipo.items(), key=lambda x: (-x[1], str(x[0])))],
        "por_agente": sorted(por_agente.values(), key=lambda c: c["agente"]),
        "pendentes": [{"agente": a, "n": len(ls), "ids": [l["id"] for l in ls],
                       "mais_antiga": min(str(l.get("ts", "")) for l in ls)} for a, ls in sorted(pend.items())],
        "entregas": [{c: l.get(c) for c in ("id", "ts", "de", "assunto", "issues", "branch")}
                     for l in no_periodo if l.get("tipo") == "entrega"][-ultimas:],
        "escalacoes": [{c: l.get(c) for c in ("id", "ts", "de", "assunto")}
                       for l in no_periodo if l.get("tipo") == "escalacao"][-ultimas:],
        "notas": [{c: l.get(c) for c in ("id", "ts", "de", "tema", "decisao")}
                  for l in no_periodo if l.get("tipo") == "nota"],
    }


def resumo_em_texto(r):
    p = r["periodo"]
    out = [f"Resumo de {p['desde']} até {p['ate']}: {p['eventos']} evento(s) no log", ""]
    out.append("Por tipo: " + (", ".join(f"{t['tipo']} {t['n']}" for t in r["por_tipo"]) or "nada"))
    out.append("")
    out.append("Por agente (enviou / recebeu):")
    out += [f"  {c['agente']}: {c['enviou']} / {c['recebeu']}" for c in r["por_agente"]] or ["  ninguém"]
    out.append("")
    out.append("Esperando resposta (todo o log):")
    out += [f"  {x['agente']}: {x['n']} ({', '.join(x['ids'])}), a mais antiga de {x['mais_antiga']}"
            for x in r["pendentes"]] or ["  nada pendente"]
    for titulo, chave in (("Entregas", "entregas"), ("Escalações", "escalacoes")):
        out.append("")
        out.append(f"{titulo}:")
        for e in r[chave] or []:
            extra = ""
            if e.get("issues"):
                extra += " issues " + " ".join(f"#{n}" for n in e["issues"])
            if e.get("branch"):
                extra += f" branch {e['branch']}"
            out.append(f"  {e['ts']} {e['id']} {e['de']}: {e['assunto']}{extra}")
        if not r[chave]:
            out.append("  nenhuma")
    out.append("")
    out.append("Notas e decisões:")
    out += [f"  {n['ts']} {n['id']} {n['de']} [{n['tema']}]" + (" DECISÃO" if n["decisao"] else "")
            for n in r["notas"]] or ["  nenhuma"]
    return "\n".join(out)


def resumo(args):
    p = argparse.ArgumentParser(prog="painel.py resumo")
    p.add_argument("--raiz", required=True)
    p.add_argument("--desde", type=periodo, default="1d", help="janela: 30m, 2h, 1d (padrão 1d)")
    p.add_argument("--formato", choices=("texto", "toon"), default="texto")
    a = p.parse_args(args)
    raiz = raiz_de(a.raiz)
    ate = agora()
    r = montar_resumo(registro.ler_tudo(raiz), ate - a.desde, ate)
    print(toon.objeto({"resumo": r["periodo"], **{k: v for k, v in r.items() if k != "periodo"}})
          if a.formato == "toon" else resumo_em_texto(r))


# ---------------------------------------------------------------------------
# Worktree por agente (painel.py cadastrar --worktree)
# ---------------------------------------------------------------------------
def _git(raiz, *args):
    try:
        r = subprocess.run(["git", "-C", raiz] + list(args), capture_output=True, text=True, timeout=TIMEOUT_GIT)
    except (OSError, subprocess.SubprocessError) as exc:
        return 1, str(exc)
    return r.returncode, (r.stdout if r.returncode == 0 else (r.stderr or r.stdout)).strip()


def _worktrees_existentes(raiz):
    cod, out = _git(raiz, "worktree", "list", "--porcelain")
    return {os.path.realpath(l[len("worktree "):]) for l in out.splitlines() if l.startswith("worktree ")} \
        if cod == 0 else set()


def worktrees(raiz, novos):
    """{handle: agente} -> {handle: caminho do worktree}, só para managers.

    Cria <raiz>/../<projeto>-worktrees/<agente> na branch ab/<agente>, a partir do HEAD
    da raiz; o que já existe é reaproveitado. Se algum falhar, desfaz os criados agora
    e sai com a mensagem do git: o cadastro só é gravado depois disto.
    """
    cod, out = _git(raiz, "rev-parse", "--verify", "HEAD")
    if cod != 0:
        sys.exit(f"--worktree: {raiz} não é um repositório git com commit ({out})")
    projeto = slug(carregar_config(raiz).get("projeto", "")) or "projeto"
    base_wt = os.path.join(os.path.dirname(os.path.abspath(raiz)), f"{projeto}-worktrees")
    existentes = _worktrees_existentes(raiz)
    feitos, criados = {}, []
    for h, agente in novos.items():
        if papel_do_nome(agente) != "manager":
            continue
        caminho = os.path.join(base_wt, agente)
        if os.path.realpath(caminho) in existentes:
            feitos[h] = caminho
            continue
        if os.path.exists(caminho):
            erro = f"{caminho} já existe e não é worktree deste repositório"
        else:
            branch = "ab/" + agente
            tem_branch = _git(raiz, "rev-parse", "--verify", "--quiet", "refs/heads/" + branch)[0] == 0
            cod, erro = _git(raiz, "worktree", "add", caminho, branch) if tem_branch else \
                _git(raiz, "worktree", "add", "-b", branch, caminho, "HEAD")
            if cod == 0:
                feitos[h] = caminho
                criados.append((caminho, None if tem_branch else branch))
                continue
        for c, b in criados:  # desfaz: nada pela metade
            _git(raiz, "worktree", "remove", "--force", c)
            if b:
                _git(raiz, "branch", "-D", b)
        sys.exit(f"--worktree: não criei o worktree de {agente}: {erro}. Nada foi cadastrado")
    for h, c in feitos.items():
        print(f"worktree de {novos[h]}: {c}")
    return feitos

