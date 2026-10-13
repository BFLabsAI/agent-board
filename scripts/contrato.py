"""
agent-board: a interface do time (Orca ou Maestri) e o CONTRATO adaptado a ela.

O projeto escolhe uma interface no `painel.py init` (chave "transporte" do
agent-board.json). O templates/CONTRATO.md tem as duas versões, marcadas assim:

    <!-- orca -->                 bloco só do Orca
    ...
    <!-- /orca -->
    <!-- maestri --> uma linha    linha só do Maestri

`renderizar` devolve o contrato com só a interface escolhida. Sem escolha
(projeto antigo), mantém as duas, como era antes.
"""
import os
import re

TRANSPORTES = ("orca", "maestri")
NOMES = {"orca": "Orca", "maestri": "Maestri"}
ABRE_RE = re.compile(r"^<!-- (orca|maestri) -->\s*$")
FECHA_RE = re.compile(r"^<!-- /(orca|maestri) -->\s*$")
LINHA_RE = re.compile(r"^<!-- (orca|maestri) --> (.+)$")


def renderizar(texto, transporte=None):
    """Contrato só com a interface escolhida (None = as duas). ValueError se os marcadores estiverem errados."""
    if transporte is not None and transporte not in TRANSPORTES:
        raise ValueError(f"transporte inválido: {transporte!r}; use orca ou maestri")
    saida, aberto = [], None
    for n, linha in enumerate(texto.splitlines(keepends=True), 1):
        bruta = linha.rstrip("\n")
        m = ABRE_RE.match(bruta)
        if m:
            if aberto:
                raise ValueError(f"linha {n}: bloco {m.group(1)} dentro do bloco {aberto}")
            aberto = m.group(1)
            continue
        m = FECHA_RE.match(bruta)
        if m:
            if aberto != m.group(1):
                raise ValueError(f"linha {n}: fechou {m.group(1)} sem abrir")
            aberto = None
            continue
        m = LINHA_RE.match(bruta)
        if m and not aberto:
            if transporte in (None, m.group(1)):
                saida.append(m.group(2) + ("\n" if linha.endswith("\n") else ""))
            continue
        if aberto and transporte not in (None, aberto):
            continue
        saida.append(linha)
    if aberto:
        raise ValueError(f"bloco {aberto} sem fechar")
    return "".join(saida)


def detectar(ambiente=None):
    """A interface do terminal atual, ou None se não der para saber (nenhuma, ou as duas)."""
    env = os.environ if ambiente is None else ambiente
    achadas = [t for t, var in (("orca", "ORCA_TERMINAL_HANDLE"), ("maestri", "MAESTRI_TERMINAL_ID")) if env.get(var)]
    return achadas[0] if len(achadas) == 1 else None


def transporte_de(cfg):
    t = (cfg or {}).get("transporte")
    return t if t in TRANSPORTES else None


def checar_handle(cfg, handle):
    """Mensagem de erro se `handle` é de outra interface que a do projeto; None se está tudo certo."""
    t = transporte_de(cfg)
    if t is None:
        return None  # projeto antigo, sem escolha: aceita os dois
    do_maestri = str(handle).startswith("maestri:")
    if t == "orca" and do_maestri:
        return (f"{handle} é um terminal do Maestri, mas este projeto usa o Orca. Para trocar de interface: "
                "painel.py init --raiz <path> --projeto <nome> --prefixo <prefixo> --transporte maestri")
    if t == "maestri" and not do_maestri:
        return (f"{handle} é um terminal do Orca, mas este projeto usa o Maestri (cadastre terminais com "
                "maestri:<id>=<agente>, depois de painel.py solicitar). Para trocar de interface: "
                "painel.py init --raiz <path> --projeto <nome> --prefixo <prefixo> --transporte orca")
    return None


def escolher(pedido, atual=None, ambiente=None):
    """Interface do projeto: o que foi pedido, senão a que o projeto já tem, senão a do terminal.

    Devolve (transporte, como). `como` é "pedido", "projeto" ou "detectado". ValueError se não der para saber.
    """
    if pedido:
        if pedido not in TRANSPORTES:
            raise ValueError(f"--transporte: use orca ou maestri (recebi {pedido!r})")
        return pedido, "pedido"
    if atual in TRANSPORTES:
        return atual, "projeto"
    achado = detectar(ambiente)
    if achado:
        return achado, "detectado"
    raise ValueError("qual interface este time vai usar? Informe --transporte orca|maestri "
                     "(não deu para detectar: este terminal não está no Orca nem no Maestri, ou está nos dois)")
