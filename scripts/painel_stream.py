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
import painel_subagentes
from base import LOG_REL

INTERVALOS = {"log": 1.0, "orca": 2.0, "ping": 15.0, "sub": 2.0, "projetos": 5.0}  # projetos: de quanto em quanto tempo o stream `*` relê o cadastro; sub: mínimo entre dois eventos do mesmo sub-agent


def _assinatura(a):
    subs = tuple((x["id"], x["status"]) for x in a.get("subagentes", []))
    return (a["status"], a["tela"], a["pendentes"], json.dumps(a["tarefa_atual"], sort_keys=True), subs)


def _assinatura_sub(s):
    ult = s["ultima_atividade"]
    return (s["status"], s["n_atividades"], ult and ult["ts"])


class Vigia:
    def __init__(self, raiz, projeto, paineis, terminais, intervalos=None, relogio=time.monotonic):
        self.raiz, self.projeto, self.paineis, self.terminais = raiz, projeto, paineis, terminais
        self.iv = dict(INTERVALOS, **(intervalos or {}))
        self.relogio = relogio
        self.caminho = os.path.join(raiz, LOG_REL)
        self.pos, self.visto = self._tamanho(), self._marca()
        self.ult_orca = self.ult_evento = self.relogio()
        self.tarefas, self.agentes = {}, {}
        self.tars_lista, self.subs = [], []
        self.sig_subs = painel_subagentes.assinatura(projeto, datetime.datetime.now().astimezone())
        self.subs_vistos, self.subs_pendentes, self.subs_emitido = {}, {}, {}
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
        self._subs(tars, agora)
        ags = painel_dados.agentes(self.projeto, self.paineis(), msgs, self.terminais(), agora, tars, self.subs)
        tars = painel_subagentes.anexar_tarefas(tars, self.subs)
        for t in tars:
            if self.tarefas.get(t["id"]) != t["estado"] and self.pronto:
                eventos.append(("tarefa", t))
        for a in ags:
            if self.agentes.get(a["agente"]) != _assinatura(a) and self.pronto:
                eventos.append(("agente", a))
        self.tarefas = {t["id"]: t["estado"] for t in tars}
        self.agentes = {a["agente"]: _assinatura(a) for a in ags}

    def _subs(self, tars, agora):
        """Relê os sub-agents (cache incremental), marca como pendente quem nasceu, mudou de status ou teve
        atividade, e devolve True se o conjunto (id, status) mudou. O baseline do início não vira evento."""
        self.tars_lista = tars
        self.subs = painel_subagentes.listar(self.projeto, agora, tars)
        estrutura = False
        for s in self.subs:
            chave, ass = (s["agente"], s["id"]), _assinatura_sub(s)
            antigo = self.subs_vistos.get(chave)
            if antigo != ass and self.pronto:
                self.subs_pendentes[chave] = s
                estrutura = estrutura or antigo is None or antigo[0] != ass[0]
            self.subs_vistos[chave] = ass
        return estrutura

    def _emitir_subs(self, eventos):
        """No máximo 1 evento `subagente` por sub-agent a cada `sub` s; o que sobra espera e sai com o estado mais recente."""
        agora = self.relogio()
        for chave, s in list(self.subs_pendentes.items()):
            if agora - self.subs_emitido.get(chave, -1e9) >= self.iv["sub"]:
                eventos.append(("subagente", s))
                self.subs_emitido[chave] = agora
                del self.subs_pendentes[chave]

    def passo(self):
        agora = self.relogio()
        eventos = [("mensagem", m) for m in self._linhas_novas()]
        marca = self._marca()
        mudou = marca != self.visto
        self.visto = marca
        hora = datetime.datetime.now().astimezone()
        sig = painel_subagentes.assinatura(self.projeto, hora)  # arquivo de hoje e de ontem; a virada do dia troca os nomes
        tic_orca = agora - self.ult_orca >= self.iv["orca"]
        estrutura = False
        if sig != self.sig_subs or tic_orca:
            self.sig_subs = sig
            estrutura = self._subs(self.tars_lista, hora)
        if mudou or tic_orca or estrutura:
            self.ult_orca = agora
            self._atualizar(eventos)
        self._emitir_subs(eventos)
        if eventos:
            self.ult_evento = agora
        elif agora - self.ult_evento >= self.iv["ping"]:
            self.ult_evento = agora
            eventos.append(("ping", {"agora": datetime.datetime.now().astimezone().isoformat(timespec="seconds")}))
        return eventos


class VigiaGeral:
    """O stream `projeto=*`: um Vigia por projeto do cadastro num laço só (sem thread por projeto).

    `projetos`: função que devolve {projeto: raiz} atual. Reavaliada a cada `projetos` s: quem entrou ganha um
    Vigia (linha de base, sem replay), quem saiu perde o seu. Os eventos de dados levam o campo `projeto`;
    o ping é um só para a conexão."""

    def __init__(self, projetos, paineis, terminais, intervalos=None, relogio=time.monotonic):
        self.projetos, self.paineis, self.terminais = projetos, paineis, terminais
        self.iv = dict(INTERVALOS, **(intervalos or {}))
        self.relogio = relogio
        self.vigias = {}
        self.ult_lista = self.ult_evento = self.relogio()
        self._sincronizar()

    def _sincronizar(self):
        try:
            atuais = self.projetos()
        except Exception:
            return
        for nome in [n for n, v in self.vigias.items() if atuais.get(n) != v.raiz]:
            del self.vigias[nome]
        for nome, raiz in atuais.items():
            if nome not in self.vigias:
                try:
                    self.vigias[nome] = Vigia(raiz, nome, self.paineis, self.terminais, self.iv, self.relogio)
                except Exception:  # projeto torto não derruba os outros; tenta de novo na próxima releitura
                    pass

    def ola(self):
        return ("ola", {"projeto": "*", "projetos": list(self.vigias),
                        "agora": datetime.datetime.now().astimezone().isoformat(timespec="seconds")})

    def passo(self):
        agora = self.relogio()
        if agora - self.ult_lista >= self.iv["projetos"]:
            self.ult_lista = agora
            self._sincronizar()
        eventos = []
        for nome, v in list(self.vigias.items()):
            try:
                evs = v.passo()
            except Exception:
                continue
            eventos += [(e, dict(d, projeto=nome)) for e, d in evs if e != "ping"]
        if eventos:
            self.ult_evento = agora
        elif agora - self.ult_evento >= self.iv["ping"]:
            self.ult_evento = agora
            eventos.append(("ping", {"agora": datetime.datetime.now().astimezone().isoformat(timespec="seconds")}))
        return eventos


def formatar(evento, dados):
    return f"event: {evento}\ndata: {json.dumps(dados, ensure_ascii=False)}\n\n".encode()
