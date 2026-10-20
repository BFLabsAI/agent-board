"""
agent-board: o que o /api/stream (SSE) empurra para o painel, sem socket nem thread.

Um Vigia por conexão. Cada `passo()` olha o log (tamanho e mtime) e, a cada `orca` segundos ou quando o
log mudou, recalcula agentes e tarefas e devolve só o que mudou: [(evento, dados)].
"""
import datetime
import json
import os
import time

import painel_dados
import painel_estado
from base import LOG_REL

INTERVALOS = {"log": 1.0, "orca": 2.0, "ping": 15.0}


def _assinatura(a):
    return (a["status"], a["tela"], a["pendentes"], json.dumps(a["tarefa_atual"], sort_keys=True))


class Vigia:
    def __init__(self, raiz, projeto, paineis, terminais, intervalos=None, relogio=time.monotonic):
        self.raiz, self.projeto, self.paineis, self.terminais = raiz, projeto, paineis, terminais
        self.iv = dict(INTERVALOS, **(intervalos or {}))
        self.relogio = relogio
        self.caminho = os.path.join(raiz, LOG_REL)
        self.pos, self.visto = self._tamanho(), self._marca()
        self.ult_orca = self.ult_evento = self.relogio()
        self.tarefas, self.agentes = {}, {}
        self.pronto = False
        self._atualizar([])  # linha de base: o que já existe não vira evento
        self.pronto = True

    def _tamanho(self):
        try:
            return os.path.getsize(self.caminho)
        except OSError:
            return 0

    def _marca(self):
        try:
            st = os.stat(self.caminho)
            return (st.st_size, st.st_mtime_ns)
        except OSError:
            return (0, 0)

    def ola(self):
        return ("ola", {"projeto": self.projeto, "agora": datetime.datetime.now().astimezone().isoformat(timespec="seconds")})

    def _linhas_novas(self):
        """Mensagens gravadas desde a última leitura. Só lê o que cresceu e só até a última linha completa."""
        tam = self._tamanho()
        if tam < self.pos:  # arquivar trocou o arquivo: o que há nele já foi visto
            self.pos = tam
            return []
        if tam == self.pos:
            return []
        with open(self.caminho, "rb") as f:
            f.seek(self.pos)
            bloco = f.read(tam - self.pos)
        fim = bloco.rfind(b"\n") + 1
        self.pos += fim
        out = []
        for texto in bloco[:fim].decode("utf-8", "replace").splitlines():
            try:
                l = json.loads(texto)
            except ValueError:
                continue
            l = painel_estado.sanear(l)
            if l:
                out.append(painel_dados.publica(l))
        return out

    def _atualizar(self, eventos):
        agora = datetime.datetime.now().astimezone()
        msgs = painel_estado.ler_log(self.raiz)
        tars = painel_estado.tarefas(msgs, agora)
        ags = painel_dados.agentes(self.projeto, self.paineis(), msgs, self.terminais(), agora, tars)
        for t in tars:
            if self.tarefas.get(t["id"]) != t["estado"] and self.pronto:
                eventos.append(("tarefa", t))
        for a in ags:
            if self.agentes.get(a["agente"]) != _assinatura(a) and self.pronto:
                eventos.append(("agente", a))
        self.tarefas = {t["id"]: t["estado"] for t in tars}
        self.agentes = {a["agente"]: _assinatura(a) for a in ags}

    def passo(self):
        agora = self.relogio()
        eventos = [("mensagem", m) for m in self._linhas_novas()]
        marca = self._marca()
        mudou = marca != self.visto
        self.visto = marca
        if mudou or agora - self.ult_orca >= self.iv["orca"]:
            self.ult_orca = agora
            self._atualizar(eventos)
        if eventos:
            self.ult_evento = agora
        elif agora - self.ult_evento >= self.iv["ping"]:
            self.ult_evento = agora
            eventos.append(("ping", {"agora": datetime.datetime.now().astimezone().isoformat(timespec="seconds")}))
        return eventos


def formatar(evento, dados):
    return f"event: {evento}\ndata: {json.dumps(dados, ensure_ascii=False)}\n\n".encode()
