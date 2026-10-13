"""
agent-board: o log do projeto (docs/agent-board/comunicacoes.jsonl).

Uma linha JSON por evento. Só este módulo escreve no log, sempre sob trava.

Cadeia de hash: cada linha leva "prev", o sha256 do texto da linha anterior.
Editar ou apagar uma linha deixa a seguinte apontando para um hash que não
existe mais, e `verificar` acusa. O merge=union do git pode juntar duas
cadeias (bifurcação), o que é normal e não conta como adulteração.

Linhas de status ({"id", "status"}) não são mensagens: "falhou" tira a
mensagem da cobrança, "reenviado" devolve, "atrasado" marca o pedido já
escalado pelo painel.py vigiar.
"""
import datetime
import glob
import hashlib
import json
import os

from base import HOME, LOG_REL, registrar_aviso, trava

ARQUIVO_REL = "docs/agent-board/arquivo"


def trava_do_log(raiz):
    """Trava fora do log (em $AGENT_BOARD_HOME), para o arquivar poder trocar o arquivo inteiro."""
    chave = hashlib.sha1(os.path.abspath(raiz).encode()).hexdigest()[:16]
    return trava(os.path.join(HOME, "travas", chave + ".lock"))


def hash_linha(texto):
    return hashlib.sha256(texto.rstrip("\n").encode()).hexdigest()


def _ultima_linha(caminho):
    """Texto da última linha não vazia, lendo só o fim do arquivo."""
    try:
        with open(caminho, "rb") as f:
            f.seek(0, os.SEEK_END)
            tam = f.tell()
            bloco = min(tam, 65536)
            while True:
                f.seek(tam - bloco)
                linhas = [l for l in f.read(bloco).split(b"\n") if l.strip()]
                if not linhas:
                    return None
                if bloco == tam or len(linhas) > 1:
                    return linhas[-1].decode()
                bloco = min(tam, bloco * 4)  # a linha é maior que o bloco
    except FileNotFoundError:
        return None


def gravar_log(raiz, linha):
    caminho = os.path.join(raiz, LOG_REL)
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with trava_do_log(raiz):
        ultima = _ultima_linha(caminho)
        linha = dict(linha, prev=hash_linha(ultima) if ultima else "")
        with open(caminho, "a") as f:
            f.write(json.dumps(linha, ensure_ascii=False) + "\n")
    return linha


def _linhas(caminho, rotulo):
    """(texto cru, dict) de cada linha legível do arquivo."""
    out = []
    try:
        with open(caminho) as f:
            for n, texto in enumerate(f, 1):
                if not texto.strip():
                    continue
                try:
                    out.append((texto.rstrip("\n"), json.loads(texto)))
                except ValueError:
                    registrar_aviso(f"{rotulo}:{n} linha ilegível ignorada")
    except FileNotFoundError:
        pass
    return out


def _mensagens(pares):
    estado = {}
    for _, l in pares:
        if "status" in l and "id" in l:
            estado[l["id"]] = l["status"]
    return [l for _, l in pares if "id" in l and "status" not in l and estado.get(l["id"]) != "falhou"]


def ler_log(raiz):
    """Mensagens do log ativo, sem as que falharam no envio.

    Linha ilegível (escrita cortada, merge ruim) é pulada e anotada em avisos.log,
    para não travar o time inteiro.
    """
    return _mensagens(_linhas(os.path.join(raiz, LOG_REL), LOG_REL))


def status(raiz):
    """{id: [status, ...]} das linhas de status do log ativo, em ordem (falhou, reenviado, atrasado)."""
    out = {}
    for _, l in _linhas(os.path.join(raiz, LOG_REL), LOG_REL):
        if "status" in l and "id" in l:
            out.setdefault(l["id"], []).append(l["status"])
    return out


def achar(raiz, cid):
    """A mensagem `cid` do log ativo, mesmo que o envio tenha falhado."""
    for _, l in _linhas(os.path.join(raiz, LOG_REL), LOG_REL):
        if l.get("id") == cid and "status" not in l:
            return l
    return None


def arquivos(raiz):
    return sorted(glob.glob(os.path.join(raiz, ARQUIVO_REL, "*.jsonl")))


def ler_tudo(raiz):
    """Mensagens do arquivo morto e do log ativo, em ordem de gravação."""
    pares = []
    for a in arquivos(raiz):
        pares += _linhas(a, os.path.relpath(a, raiz))
    return _mensagens(pares + _linhas(os.path.join(raiz, LOG_REL), LOG_REL))


def verificar(raiz):
    """Confere a cadeia de hash do arquivo morto e do log ativo.

    Devolve {"linhas", "problemas": [texto], "bifurcacoes"}. A ordem das linhas não
    importa: cada "prev" precisa ser o hash de alguma linha que existe.
    """
    pares, problemas = [], []
    for a in arquivos(raiz) + [os.path.join(raiz, LOG_REL)]:
        rotulo = os.path.relpath(a, raiz)
        try:
            with open(a) as f:
                for n, texto in enumerate(f, 1):
                    if not texto.strip():
                        continue
                    try:
                        pares.append((rotulo, n, texto.rstrip("\n"), json.loads(texto)))
                    except ValueError:
                        problemas.append(f"{rotulo}:{n} linha ilegível")
        except FileNotFoundError:
            pass
    hashes = {hash_linha(t) for _, _, t, _ in pares}
    filhos, cadeia_comecou, raizes = {}, False, 0
    for rotulo, n, texto, l in pares:
        if "prev" not in l:
            if cadeia_comecou:
                problemas.append(f"{rotulo}:{n} linha sem prev depois do início da cadeia ({l.get('id')})")
            continue
        cadeia_comecou = True
        prev = l["prev"]
        if prev == "":
            raizes += 1
        elif prev not in hashes:
            problemas.append(f"{rotulo}:{n} prev aponta para uma linha que não existe mais ({l.get('id')}): "
                             "linha anterior editada ou apagada")
        filhos[prev] = filhos.get(prev, 0) + 1
    if raizes > 1:
        problemas.append(f"{raizes} linhas começam a cadeia do zero: o log foi apagado e recomeçado")
    bifurcacoes = sum(1 for p, q in filhos.items() if p and q > 1)
    return {"linhas": len(pares), "problemas": problemas, "bifurcacoes": bifurcacoes}


def _ts(l):
    try:
        return datetime.datetime.fromisoformat(l.get("ts", ""))
    except ValueError:
        return None


def arquivar(raiz, dias=30, agora=None):
    """Move para docs/agent-board/arquivo/AAAA-MM.jsonl as linhas fechadas com mais de `dias` dias.

    Fica no log ativo toda mensagem que ainda espera resposta, qualquer que seja a idade.
    As linhas são movidas como texto cru: os hashes não mudam e a cadeia continua verificável.
    """
    agora = agora or datetime.datetime.now().astimezone()
    corte = agora - datetime.timedelta(days=dias)
    caminho = os.path.join(raiz, LOG_REL)
    with trava_do_log(raiz):
        pares = _linhas(caminho, LOG_REL)
        respondidas, estado = set(), {}
        for _, l in pares:
            if l.get("tipo") == "resposta" and l.get("responde_a"):
                respondidas.update(x.strip() for x in str(l["responde_a"]).split(","))
            if "status" in l:
                estado[l.get("id")] = l["status"]
        ficam = set()  # ids de mensagem que continuam no log ativo
        for _, l in pares:
            if "status" in l:
                continue
            ts = _ts(l)
            espera = (l.get("tipo") not in (None, "resposta", "andamento", "nota")
                      and l.get("id") not in respondidas and estado.get(l.get("id")) != "falhou")
            if ts is None or ts >= corte or espera:
                ficam.add(l.get("id"))
        sai, fica = {}, []
        for texto, l in pares:
            if l.get("id") in ficam:  # status acompanha a sua mensagem
                fica.append(texto)
            else:
                sai.setdefault(f"{_ts(l) or agora:%Y-%m}", []).append(texto)
        if not sai:
            return 0
        pasta = os.path.join(raiz, ARQUIVO_REL)
        os.makedirs(pasta, exist_ok=True)
        for mes, linhas in sai.items():
            with open(os.path.join(pasta, mes + ".jsonl"), "a") as f:
                f.write("\n".join(linhas) + "\n")
        tmp = caminho + ".tmp"
        with open(tmp, "w") as f:
            f.write("".join(t + "\n" for t in fica))
        os.replace(tmp, caminho)
    return sum(len(v) for v in sai.values())
