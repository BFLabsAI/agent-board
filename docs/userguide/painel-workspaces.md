# Workspaces: vários painéis, uma visão só

> **Em 1 minuto:** um **Workspace** é uma máquina (VPS) com o agent-board. Cada painel mostra o próprio Workspace e todos os outros da sua tailnet, sem servidor central. Você instala com um comando por VPS e abre o painel de qualquer uma pelo Mac ou pelo iPhone. Decisão: [ADR-0012](../adr/0012-workspaces-federados.md).

**Antes:** o painel já funciona numa VPS ([Painel do projeto](painel.md)).

## O que é um Workspace
A hierarquia fica **Workspace › Squad › Agente › Sub-agent**. O Workspace é a máquina; o squad é um projeto do cadastro dela.

- **Sem hub.** Nenhuma máquina manda nas outras. Cada painel descobre os outros pela Tailscale e consulta cada um direto. Se uma VPS cai, as demais continuam funcionando.
- **Só leitura.** O que vale para o painel de um projeto vale aqui: nada é escrito em outro Workspace.
- **Sem banco central.** Cada Workspace guarda os próprios dados. Só os que estão online aparecem ao vivo.

## Instalar numa VPS nova
**Antes:**
- A VPS está na **mesma tailnet** (Tailscale) das outras.
- O agent-board está instalado ([guia de instalação](../guias/orca/1-instalar.md)).
- O **HTTPS está habilitado na tailnet** (painel de administração da Tailscale, DNS, "Enable HTTPS"). O `tailscale serve` precisa dele para o endereço `https://`.

## Passo 1 — Instalar o serviço
```bash
S=~/.agents/skills/agent-board/scripts
python3 $S/painel.py servico instalar --dry-run   # só mostra o unit e os comandos
python3 $S/painel.py servico instalar
```
O comando grava o `agent-board-painel.service` no systemd (sempre ligado, reinicia sozinho) e configura o `tailscale serve`:

| Porta | Para quem | Destino |
|---|---|---|
| HTTPS 443 | Seu navegador (Mac, iPhone) | `http://127.0.0.1:8765` |
| HTTP 8765 | Os outros painéis, pelo IP da tailnet | `http://127.0.0.1:8765` |

✅ **Deu certo se:** o fim da saída diz `tailscale serve configurado`. Rodar de novo é seguro (idempotente).

## Passo 2 — Conferir
```bash
python3 $S/painel.py servico status
```
✅ **Deu certo se:** mostra `serviço: active` e `tailscale serve: configurado`.

Para tirar: `python3 $S/painel.py servico remover`. Outra porta: `--porta <n>` nos três comandos.

## Passo 3 — Dar nome (opcional)
Crie `~/.agent-hooks/agent-board/workspace.json` (`chmod 600`):

```json
{"nome": "R7", "porta_federacao": 8765, "hosts_extras": [], "ignorar": []}
```

| Campo | Para que serve | Padrão |
|---|---|---|
| `nome` | Rótulo na tela | o nome da máquina na Tailscale |
| `porta_federacao` | Porta onde os outros painéis são procurados | `8765` |
| `hosts_extras` | Outros nomes aceitos no cabeçalho Host (ex.: um domínio seu) | nenhum |
| `ignorar` | Máquinas da tailnet que nunca devem ser testadas (nome ou nome curto) | nenhuma |

O `id` do Workspace é o nome da máquina na Tailscale e não muda. Arquivo ausente ou torto vale como ausente.

## Abrir pelo Mac e pelo iPhone
Com a Tailscale ligada no aparelho, abra:

```
https://<maquina>.<tailnet>.ts.net
```

Sem login: quem está na sua tailnet vê o painel. Qualquer painel mostra todos os Workspaces.

## A tela Workspaces
Fica acima da Visão geral no menu. Abre sozinha quando há **mais de 1 Workspace online**. O seletor da barra lateral vira **Workspace › Squad**, e todas as telas de squad funcionam com um Workspace remoto.

| Elemento | O que mostra |
|---|---|
| Faixa de totais | Soma de todos os Workspaces online |
| Card de Workspace | Nome, id, versão, latência, totais e a lista de squads com selo de saúde |
| Pulso | O card acende quando chega mensagem de um squad dele |
| **Office do prédio** | Atalho para o modo Prédio |

### Office modo Prédio
`/office?modo=predio`: **um andar por Workspace**, com uma sala para cada squad, pulsos ao vivo e modo TV (`tv=1`). Clicar na placa do andar abre o Office do Workspace no modo Andar.

## Workspace offline e versão desatualizada
- **Offline:** o card fica apagado e mostra "offline" com há quanto tempo o seu painel o viu assim, mais o motivo. Esse tempo só vive na memória do painel: zera se ele reiniciar.
- **"atualize o agent-board":** o Workspace roda uma versão mais antiga que a do painel que você abriu. Atualize a skill nele e rode `painel.py servico instalar` de novo se o unit mudou.

## Segurança
- **Só tailnet.** O servidor escuta em `127.0.0.1`. Quem expõe é o `tailscale serve`, sem porta pública.
- **Só leitura.** Qualquer método diferente de GET é recusado.
- **Proxy restrito.** O painel só repassa para Workspaces **descobertos na tailnet**, sempre ao IP descoberto (nunca a um host vindo da URL) e sem seguir redirecionamentos. Só `GET /api/...`, timeout de 5 s, resposta de até 5 MB.
- **Sem laço.** Um painel que repassa manda `X-AgentBoard-Federado`; quem o recebe não federa de novo.
- Comandos e caminhos de sub-agents ficam visíveis a quem está na tailnet: veja a [privacidade](painel.md#sub-agents).

## Se der errado
| Você vê | Faça |
|---|---|
| O peer não aparece | Ele precisa estar online, ser Linux, ter o serviço instalado e responder em `http://<ip-tailnet>:8765/api/versao`. Teste com `curl` desse IP. Máquina listada em `ignorar` também some. A lista atualiza a cada 30 s |
| Só aparece o Workspace local | `tailscale status` precisa funcionar no usuário do serviço. Sem `tailscale` instalado, só existe o local |
| O nome `.ts.net` não resolve (a VPS usa `--accept-dns=false`) | Os painéis se falam pelo **IP** da tailnet, que não depende de DNS. No navegador, use o IP ou habilite o MagicDNS no aparelho |
| `403 host não permitido` | O endereço usado não é o do nó. Use o nome `.ts.net` ou o IP da tailnet, ou ponha o nome em `hosts_extras` |
| `servico instalar` falha em `tailscale serve` | Habilite o HTTPS na tailnet (pré-requisito) e rode de novo |
| Porta 8765 ocupada | Veja quem usa com `ss -ltnp \| grep 8765`. Se for um `servir` antigo, pare-o; ou instale com `--porta <n>` e ponha `porta_federacao` igual no `workspace.json` de **todos** |
| Um `nohup painel.py servir` antigo ainda roda | Ele ocupa a porta e o serviço não sobe. Pare o processo (com a permissão de quem o abriu) e rode `systemctl restart agent-board-painel` |
| Card "offline" com um erro | O peer foi achado mas não respondeu a tempo ou a resposta veio torta. Veja `servico status` nele |

**Próximo:** [Visão geral e Andar](painel-geral.md)
