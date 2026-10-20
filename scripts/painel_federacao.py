"""
agent-board: Workspaces federados (1.14). Identidade, descoberta pela tailnet, proxy e stream remoto.

Contrato em docs/referencia/painel-api.md (seção "Workspaces federados"). Só stdlib, só leitura.
O destino de qualquer requisição a outro Workspace é sempre o IP de um Workspace descoberto na tailnet
(nunca um host vindo da URL), e nunca se segue redirect: é o que impede SSRF.
"""
import datetime
import http.client
import json
import os
import queue
import re
import shutil
import socket
import subprocess
import threading
import time

import base

CONTRATO = 3
CONTRATOS_CONHECIDOS = (3,)
CABECALHO = "X-AgentBoard-Federado"
MAX_RESPOSTA = 5 * 1024 * 1024
MAX_PEERS = 16
TIMEOUT_SONDA = 1.5     # GET /api/versao de cada peer
PRAZO_DESCOBERTA = 2.0  # a descoberta nunca segura uma requisição por mais que isto
TIMEOUT_GERAL = 3.0     # GET /api/geral de cada remoto, em /api/workspaces
TIMEOUT_PROXY = 5.0
TTL_DESCOBERTA = 30.0
TTL_HOSTS = 300.0
PORTA_PADRAO = 8765
ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$")
SAUDE_PIOR = ("critico", "atencao", "ok")
EVENTOS_REMOTOS = ("mensagem", "agente", "tarefa", "subagente")


def tailscale_status():
    """`tailscale status --json` (só leitura). None sem tailscale, sem resposta ou com saída torta."""
    exe = shutil.which("tailscale")
    if not exe:
        return None
    try:
        p = subprocess.run([exe, "status", "--json"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=3)
        st = json.loads(p.stdout.decode("utf-8", "replace"))
        return st if p.returncode == 0 and isinstance(st, dict) else None
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def semver(v):
    m = re.match(r"^\s*v?(\d+)\.(\d+)\.(\d+)", v or "")
    return tuple(int(x) for x in m.groups()) if m else None


def mais_antiga(v, ref):
    a, b = semver(v), semver(ref)
    return a is not None and b is not None and a < b


def pior_saude(saudes):
    for s in SAUDE_PIOR:
        if s in saudes:
            return s
    return "ok"


def resumo_de(meta, geral):
    """WorkspaceResumo a partir de {id, nome, local, versao, latencia_ms, desatualizado} e do /api/geral dele."""
    squads = [{"projeto": s.get("projeto"), "saude": s.get("saude", "ok"), "agentes": len(s.get("agentes") or []),
               "trabalhando": (s.get("indicadores") or {}).get("trabalhando", 0)} for s in geral.get("squads") or []]
    return dict(meta, online=True, saude=pior_saude({s["saude"] for s in squads}), totais=geral.get("totais"), squads=squads)


def resumo_offline(meta, erro):
    return dict(meta, online=False, latencia_ms=None, saude="offline", totais=None, squads=[], erro=erro)


def _host_url(h):
    return f"[{h}]" if ":" in h else h


def _cabecalhos(ws, aceita):
    """Cabeçalhos de uma chamada a outro Workspace. Host com o nome da tailnet quando o peer tem um."""
    h = {CABECALHO: "1", "Accept": aceita}
    if ws.get("host"):
        h["Host"] = f"{ws['host']}:{ws['porta']}"
    return h


class Federacao:
    """Estado da federação de um painel: identidade, tailnet, Workspaces descobertos.

    `tailscale`: função que devolve o dict de `tailscale status --json` (ou None); os testes injetam uma falsa.
    Um peer pode trazer `porta` própria na lista normalizada (só os testes usam; o real usa porta_federacao)."""

    def __init__(self, porta, tailscale=None, ttl_descoberta=TTL_DESCOBERTA, ttl_hosts=TTL_HOSTS,
                 relogio=time.monotonic, timeout_sonda=TIMEOUT_SONDA, prazo=PRAZO_DESCOBERTA):
        self.porta = porta
        self.tailscale = tailscale or tailscale_status
        self.ttl_descoberta, self.ttl_hosts = ttl_descoberta, ttl_hosts
        self.relogio, self.timeout_sonda, self.prazo = relogio, timeout_sonda, prazo
        self._trava = threading.Lock()
        self._st, self._st_em = None, None
        self._ws = {}  # (ip, porta) -> info do Workspace remoto (id, nome, ip, porta, versao, projetos, online, erro)
        self._rodada_em = None
        self._rodando = threading.Lock()
        self._offline_desde = {}  # id -> ISO de quando o painel o viu offline pela primeira vez (só em memória)

    # --- identidade ---------------------------------------------------------------
    def _status(self, ttl):
        with self._trava:
            agora = self.relogio()
            if self._st_em is None or agora - self._st_em >= ttl:
                try:
                    self._st = self.tailscale()
                except Exception:
                    self._st = None
                self._st_em = self.relogio()
            return self._st

    def config(self):
        """workspace.json (opcional): nome, porta_federacao, hosts_extras, ignorar. Torto vale como ausente."""
        try:
            c = base.ler_json(os.path.join(base.HOME, "workspace.json"), {})
        except (OSError, ValueError):
            c = {}
        c = c if isinstance(c, dict) else {}
        lista = lambda k: [x for x in (c.get(k) or []) if isinstance(x, str)] if isinstance(c.get(k), list) else []  # noqa: E731
        porta = c.get("porta_federacao")
        return {"nome": c.get("nome") if isinstance(c.get("nome"), str) and c.get("nome") else None,
                "porta_federacao": porta if isinstance(porta, int) and 0 < porta < 65536 else PORTA_PADRAO,
                "hosts_extras": lista("hosts_extras"), "ignorar": lista("ignorar")}

    def identidade(self):
        st = self._status(self.ttl_hosts) or {}
        eu = st.get("Self") or {}
        wid = eu.get("HostName") or socket.gethostname()
        return {"id": wid, "nome": self.config()["nome"] or wid}

    def hosts_e_origens(self):
        """(hosts, origens) extras aceitos além de 127.0.0.1 e localhost: a tailnet do próprio nó e hosts_extras."""
        cfg = self.config()
        eu = (self._status(self.ttl_hosts) or {}).get("Self") or {}
        nomes = [h.lower() for h in cfg["hosts_extras"]]
        dns = (eu.get("DNSName") or "").rstrip(".").lower()
        if dns:
            nomes.append(dns)
        ips = [i for i in eu.get("TailscaleIPs") or [] if isinstance(i, str)]
        portas = {self.porta, cfg["porta_federacao"]}
        hosts, origens = set(), set()
        for n in nomes + ips:
            h = _host_url(n)
            for alvo in [h] + [f"{h}:{p}" for p in portas]:
                hosts.add(alvo.lower())
                origens.add(f"http://{alvo}".lower())
                if n in nomes:
                    origens.add(f"https://{alvo}".lower())
        return hosts, origens

    # --- descoberta ---------------------------------------------------------------
    def _peers(self, st, cfg, local_id):
        ignorar = {x.lower() for x in cfg["ignorar"]}
        out = []
        for p in (st or {}).get("Peer", {}).values():
            if not isinstance(p, dict) or not p.get("Online") or str(p.get("OS", "")).lower() != "linux":
                continue
            nome = str(p.get("HostName") or "")
            dns = str(p.get("DNSName") or "").split(".")[0]
            if nome.lower() in ignorar or dns.lower() in ignorar:
                continue
            ips = [i for i in p.get("TailscaleIPs") or [] if isinstance(i, str)]
            v4 = [i for i in ips if ":" not in i]
            if not (v4 or ips):
                continue
            # o tailscale serve roteia pelo nome: conecta no IP (nem toda VPS resolve MagicDNS) mas manda o Host com o nome
            host = str(p.get("DNSName") or "").rstrip(".").lower() or None
            out.append({"ip": (v4 or ips)[0], "porta": p.get("porta") or cfg["porta_federacao"], "host": host})
        return out[:MAX_PEERS]

    def _sonda(self, peer):
        """GET /api/versao de um peer. Devolve a info do Workspace ou levanta se não for um."""
        conn = http.client.HTTPConnection(peer["ip"], peer["porta"], timeout=self.timeout_sonda)
        try:
            conn.request("GET", "/api/versao", headers=_cabecalhos(peer, "application/json"))
            r = conn.getresponse()
            corpo = r.read(65536)
            if r.status != 200:
                raise ValueError(f"HTTP {r.status}")
            d = json.loads(corpo.decode("utf-8", "replace"))
        finally:
            conn.close()
        w = d.get("workspace") if isinstance(d, dict) else None
        if not isinstance(w, dict) or d.get("contrato") not in CONTRATOS_CONHECIDOS or not ID_RE.match(str(w.get("id"))):
            raise ValueError("não é um Workspace")
        return {"id": w["id"], "nome": str(w.get("nome") or w["id"]), "ip": peer["ip"], "porta": peer["porta"],
                "host": peer.get("host"),
                "versao": d.get("versao") if isinstance(d.get("versao"), str) else None,
                "projetos": [p for p in d.get("projetos") or [] if isinstance(p, str)], "online": True}

    def _tarefa_sonda(self, peer, feito):
        try:
            info = self._sonda(peer)
            with self._trava:
                self._ws[(peer["ip"], peer["porta"])] = info
        except Exception as exc:
            with self._trava:
                chave = (peer["ip"], peer["porta"])
                if chave in self._ws:  # quem nunca respondeu não vira Workspace; quem já era, vira offline
                    self._ws[chave] = dict(self._ws[chave], online=False, erro=f"{type(exc).__name__}: {str(exc)[:100]}")
        finally:
            feito.set()

    def _rodada(self):
        cfg = self.config()
        peers = self._peers(self._status(self.ttl_descoberta), cfg, self.identidade()["id"])
        feitos = []
        for p in peers:
            ev = threading.Event()
            threading.Thread(target=self._tarefa_sonda, args=(p, ev), daemon=True, name="fed-sonda").start()
            feitos.append((p, ev))
        limite = self.relogio() + self.prazo
        for _, ev in feitos:
            ev.wait(max(0.0, limite - self.relogio()))
        vivos = {(p["ip"], p["porta"]) for p in peers}
        pendentes = {(p["ip"], p["porta"]) for p, ev in feitos if not ev.is_set()}
        with self._trava:
            for chave, w in list(self._ws.items()):
                if (chave not in vivos or chave in pendentes) and w.get("online"):
                    self._ws[chave] = dict(w, online=False, erro="sem resposta")
            self._rodada_em = self.relogio()

    def descobrir(self):
        """Workspaces remotos conhecidos: [{id, nome, ip, porta, versao, projetos, online, erro?}]. Cache de 30 s, máx. ~2 s."""
        vencida = self._rodada_em is None or self.relogio() - self._rodada_em >= self.ttl_descoberta
        if vencida and self._rodando.acquire(False):
            try:
                self._status(self.ttl_descoberta)
                self._rodada()
            finally:
                self._rodando.release()
        local = self.identidade()["id"]
        with self._trava:
            return [dict(w) for w in self._ws.values() if w["id"] != local]

    def achar(self, wid):
        """Workspace remoto online com esse id (da descoberta), ou None."""
        return next((w for w in self.descobrir() if w["id"] == wid and w.get("online")), None)

    # --- conexão com um Workspace descoberto -------------------------------------------
    @staticmethod
    def abrir(ws, caminho, timeout=TIMEOUT_PROXY):
        """(conn, resposta) de GET http://<ip do Workspace>:<porta><caminho>. Nunca segue redirect; o chamador fecha."""
        conn = http.client.HTTPConnection(ws["ip"], ws["porta"], timeout=timeout)
        try:
            conn.request("GET", caminho, headers=_cabecalhos(ws, "*/*"))
            conn.sock_aberto = conn.sock  # a resposta sem Content-Length leva o socket embora de `conn.sock`
            return conn, conn.getresponse()
        except Exception:
            conn.close()
            raise

    def _geral_remoto(self, ws, periodo):
        conn, r = self.abrir(ws, f"/api/geral?periodo={periodo}", TIMEOUT_GERAL)
        try:
            if r.status != 200:
                raise ValueError(f"HTTP {r.status}")
            corpo = r.read(MAX_RESPOSTA + 1)
            if len(corpo) > MAX_RESPOSTA:
                raise ValueError("resposta grande demais")
            return json.loads(corpo.decode("utf-8", "replace"))
        finally:
            conn.close()

    def resumos(self, periodo, geral_local, so_local=False):
        """[WorkspaceResumo]: o local primeiro (de `geral_local()`), depois os remotos por nome, em paralelo."""
        ident = self.identidade()
        loc = resumo_de({"id": ident["id"], "nome": ident["nome"], "local": True, "versao": base.VERSAO,
                         "desatualizado": False, "latencia_ms": 0}, geral_local())
        remotos = [] if so_local else self.descobrir()
        saida = {}

        def buscar(i, ws):
            meta = {"id": ws["id"], "nome": ws["nome"], "local": False, "versao": ws.get("versao"),
                    "desatualizado": mais_antiga(ws.get("versao"), base.VERSAO), "latencia_ms": None}
            if not ws.get("online"):
                saida[i] = resumo_offline(meta, ws.get("erro") or "sem resposta")
                return
            t0 = time.monotonic()
            try:
                g = self._geral_remoto(ws, periodo)
                saida[i] = resumo_de(dict(meta, latencia_ms=int((time.monotonic() - t0) * 1000)), g)
            except Exception as exc:
                saida[i] = resumo_offline(meta, f"{type(exc).__name__}: {str(exc)[:100]}")

        ths = [threading.Thread(target=buscar, args=(i, ws), daemon=True) for i, ws in enumerate(remotos)]
        for t in ths:
            t.start()
        limite = time.monotonic() + TIMEOUT_GERAL + 2.0
        for t in ths:
            t.join(max(0.0, limite - time.monotonic()))
        out = [saida.get(i) or resumo_offline({"id": ws["id"], "nome": ws["nome"], "local": False, "versao": ws.get("versao"),
                                              "desatualizado": mais_antiga(ws.get("versao"), base.VERSAO), "latencia_ms": None},
                                             "timeout") for i, ws in enumerate(remotos)]
        out.sort(key=lambda w: (w["nome"].casefold(), w["id"]))
        return self.marcar_offline([loc] + out)

    def marcar_offline(self, resumos):
        """Preenche `offline_desde`: o instante em que o Workspace foi visto offline pela 1ª vez; null se está online."""
        agora = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
        with self._trava:
            for w in resumos:
                if w["online"]:
                    self._offline_desde.pop(w["id"], None)
                    w["offline_desde"] = None
                else:
                    w["offline_desde"] = self._offline_desde.setdefault(w["id"], agora)
        return resumos


# --- SSE ---------------------------------------------------------------------------
class LeitorLinhas(threading.Thread):
    """Lê as linhas de uma resposta numa thread e as põe numa fila (None = fim). `fechar()` destrava a leitura."""

    def __init__(self, conn, resp, nome="fed-leitor"):
        super().__init__(daemon=True, name=nome)
        self.conn, self.resp, self.fila = conn, resp, queue.Queue()

    def run(self):
        try:
            while True:
                linha = self.resp.readline(65536)
                if not linha:
                    break
                self.fila.put(linha)
        except Exception:
            pass
        finally:
            self.fila.put(None)

    def fechar(self):
        try:
            sock = getattr(self.conn, "sock_aberto", None) or self.conn.sock
            if sock is not None:
                sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        try:
            self.conn.close()
        except OSError:
            pass


def eventos_sse(linhas):
    """Agrupa linhas SSE em (evento, dados) ao ver a linha em branco. Dados que não são JSON são ignorados."""
    ev, dados = "message", []
    for bruta in linhas:
        linha = bruta.decode("utf-8", "replace").rstrip("\r\n")
        if linha == "":
            if dados:
                try:
                    yield ev, json.loads("\n".join(dados))
                except ValueError:
                    pass
            ev, dados = "message", []
        elif linha.startswith("event:"):
            ev = linha[6:].strip()
        elif linha.startswith("data:"):
            dados.append(linha[5:].lstrip(" "))


class ClienteRemoto(threading.Thread):
    """Um cliente SSE (`/api/stream?projeto=*`) de um Workspace remoto, com reconexão e backoff até `teto` s."""

    def __init__(self, fed, ws, fila, teto=30.0):
        super().__init__(daemon=True, name=f"fed-cliente-{ws['id']}")
        self.fed, self.ws, self.fila, self.teto = fed, ws, fila, teto
        self.parar = threading.Event()
        self.leitor = None

    def run(self):
        espera = 1.0
        while not self.parar.is_set():
            try:
                conn, r = self.fed.abrir(self.ws, "/api/stream?projeto=*", TIMEOUT_PROXY)
                if r.status != 200:
                    conn.close()
                    raise ValueError(f"HTTP {r.status}")
                conn.sock_aberto.settimeout(45)  # o remoto manda ping a cada 15 s
                self.leitor = LeitorLinhas(conn, r, f"fed-leitor-{self.ws['id']}")
                self.leitor.start()
                if self.parar.is_set():
                    self.leitor.fechar()
                for ev, dados in eventos_sse(iter(lambda: self.leitor.fila.get(), None)):
                    espera = 1.0
                    if ev in EVENTOS_REMOTOS and isinstance(dados, dict):
                        self.fila.put((ev, dict(dados, workspace=self.ws["id"])))
            except Exception:
                pass
            finally:
                if self.leitor:
                    self.leitor.fechar()
            self.parar.wait(espera)
            espera = min(self.teto, espera * 2)

    def encerrar(self):
        self.parar.set()
        if self.leitor:
            self.leitor.fechar()


class VigiaFederado:
    """O stream `workspace=*`: o VigiaGeral local mais um cliente SSE por remoto, numa fila só.

    `passo()` não bloqueia: o que é lento (descoberta, /api/geral dos remotos) roda numa thread gerente, que também
    liga e desliga os clientes. Eventos `workspace` saem quando um Workspace entra, sai ou muda de online/saúde."""

    def __init__(self, fed, local, geral_local, intervalos=None, teto_backoff=30.0):
        self.fed, self.local, self.geral_local = fed, local, geral_local
        self.iv = dict(local.iv, **(intervalos or {}))
        self.iv.setdefault("workspaces", 10.0)
        self.teto = teto_backoff
        self.fila = queue.Queue()
        self.clientes = {}
        self.parar = threading.Event()
        self.id_local = fed.identidade()["id"]
        self.ids = [self.id_local] + [w["id"] for w in fed.descobrir() if w.get("online")]
        self.vistos = None  # {id: (online, saude)}; None até a linha de base
        self.gerente = threading.Thread(target=self._gerir, daemon=True, name="fed-gerente")
        self.gerente.start()

    def ola(self):
        return ("ola", {"workspace": "*", "workspaces": list(self.ids),
                        "agora": datetime.datetime.now().astimezone().isoformat(timespec="seconds")})

    def _gerir(self):
        while not self.parar.is_set():
            try:
                self._ciclo()
            except Exception:
                pass
            self.parar.wait(self.iv["workspaces"])

    def _ciclo(self):
        remotos = [w for w in self.fed.descobrir() if w.get("online")]
        vivos = {w["id"]: w for w in remotos}
        for wid in [i for i in self.clientes if i not in vivos]:
            self.clientes.pop(wid).encerrar()
        for wid, w in vivos.items():
            c = self.clientes.get(wid)
            if c is None or c.ws.get("ip") != w["ip"] or not c.is_alive():
                if c:
                    c.encerrar()
                if not self.parar.is_set():
                    self.clientes[wid] = ClienteRemoto(self.fed, w, self.fila, self.teto)
                    self.clientes[wid].start()
        res = self.fed.resumos("hoje", self.geral_local)
        agora = {w["id"]: (w["online"], w["saude"]) for w in res}
        if self.vistos is not None:
            for w in res:
                if self.vistos.get(w["id"]) != agora[w["id"]] and not self.parar.is_set():
                    self.fila.put(("workspace", w))
            for wid in self.vistos:
                if wid not in agora:  # saiu da lista (era online): evento de saída
                    self.fila.put(("workspace", self.fed.marcar_offline([
                        {"id": wid, "nome": wid, "local": False, "online": False, "saude": "offline", "versao": None,
                         "desatualizado": False, "latencia_ms": None, "totais": None, "squads": []}])[0]))
        self.vistos = agora
        self.ids = list(agora)

    def passo(self):
        eventos = [(e, dict(d, workspace=self.id_local)) if e != "ping" else (e, d) for e, d in self.local.passo()]
        while True:
            try:
                eventos.append(self.fila.get_nowait())
            except queue.Empty:
                break
        return eventos

    def fechar(self):
        self.parar.set()
        for c in list(self.clientes.values()):
            c.encerrar()
        self.gerente.join(3.0)
        for c in list(self.clientes.values()):
            c.encerrar()
            c.join(2.0)
        self.clientes.clear()
