"""
agent-board: regras de envio (quem manda o quê para quem).

Separado do hook_core para as regras crescerem sem inchar o hook.
"""
from base import Barrado
from registro import ler_log

TIPOS = ("pedido", "resposta", "aviso", "escalacao", "entrega")
MODOS = ("orquestrar", "executar")


def checar_permissao(cfg, de, para, tipo, modo):
    papel_de, papel_para = de["papel"], para["papel"]
    regras = cfg.get("papeis", {}).get(papel_de)
    if regras is None:
        raise Barrado(f"papel {papel_de} não existe em agent-board.json")
    if tipo not in regras.get("tipos", []):
        raise Barrado(f"{papel_de} não envia '{tipo}'. Permitidos: {', '.join(regras.get('tipos', []))}")
    if tipo == "pedido" and papel_para not in regras.get("pode_pedir_a", []):
        raise Barrado(f"{papel_de} não pode fazer pedido a {papel_para}. Pode pedir a: "
                      f"{', '.join(regras.get('pode_pedir_a', [])) or 'ninguém'}")
    if tipo in ("escalacao", "entrega") and papel_para != "master":
        raise Barrado(f"'{tipo}' só vai para o master")
    if tipo == "pedido" and papel_para == "manager" and modo not in MODOS:
        raise Barrado("pedido para manager precisa de --modo orquestrar ou --modo executar")
    if modo and modo not in MODOS:
        raise Barrado(f"--modo inválido: {modo}. Use orquestrar ou executar")


def checar_responde_a(eu, valor):
    """Resposta fecha a conversa: aponta para mensagens que existem e que não são respostas."""
    if not isinstance(valor, str) or not valor.strip():
        raise Barrado("resposta precisa de --responde-a <id da mensagem original>")
    tipos = {l["id"]: (l.get("tipo"), l.get("para")) for l in ler_log(eu["raiz"])}
    for cid in (x.strip() for x in valor.split(",") if x.strip()):
        if cid not in tipos:
            raise Barrado(f"--responde-a {cid}: essa mensagem não existe no log do projeto")
        tipo, para = tipos[cid]
        if tipo == "resposta":
            raise Barrado(f"{cid} já é uma resposta, e resposta não se responde (a conversa está fechada). "
                          "Se precisa de algo novo, mande --type pedido ou --type aviso")
        if para != eu["agente"]:
            raise Barrado(f"{cid} não foi enviada para você ({para}); responda só ao que você recebeu")


def pendentes_de(eu):
    """Mensagens recebidas por `eu` (menos respostas) que ele ainda não respondeu."""
    linhas = ler_log(eu["raiz"])
    desde = eu.get("cadastrado_em", "")
    respondidas = set()
    for l in linhas:
        if l.get("de") == eu["agente"] and l.get("responde_a"):
            respondidas.update(x.strip() for x in str(l["responde_a"]).split(","))
    return [l for l in linhas
            if l.get("para") == eu["agente"] and l.get("tipo") != "resposta"
            and l["id"] not in respondidas and l.get("ts", "") >= desde]
