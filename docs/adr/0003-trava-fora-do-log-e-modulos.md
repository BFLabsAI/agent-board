# 0003. Trava em arquivo próprio e core dividido em módulos

- **Status:** aceita
- **Data:** 2026-10-12

## Contexto
O `gravar_log` travava o próprio `comunicacoes.jsonl` com `fcntl.flock`. Para arquivar (reescrever o log com `os.replace`), isso é inseguro: um escritor esperando a trava do inode antigo escreveria num arquivo que já saiu do lugar, e a linha se perderia. Além disso, `hook_core.py` tinha 790 linhas misturando regra, log, proteção e aviso, e `fcntl` não existe no Windows.

## Decisão
- `base.trava(caminho)`: trava exclusiva num arquivo `.lock` dedicado, com `fcntl` e fallback `msvcrt` no Windows.
- O log de cada projeto trava em `$AGENT_BOARD_HOME/travas/<sha1(raiz)>.lock`. Quem troca o arquivo (arquivar) e quem acrescenta (hook) usam a mesma trava.
- O core foi dividido sem mudar regra: `base` (caminhos, cadastro, config, trava), `registro` (log), `protecao` (detecção de escrita à mão), `avisos` (aviso na tela), `toon` (saída), e depois `politica` (regras de envio, sem I/O; ver [ADR-0007](0007-protocolo-de-tarefas-e-regras-opcionais.md)). `hook_core` fica com leitura do comando, aplicação da política e dialeto do harness.

## Consequências
- A trava vale por máquina (como antes). Duas máquinas no mesmo checkout não são suportadas (já não eram).
- Durante a atualização, um hook antigo e um novo podem coexistir travando coisas diferentes por alguns segundos. Aceitável: o `install.sh` troca tudo de uma vez.
