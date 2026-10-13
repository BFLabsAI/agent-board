# 0002. Cadeia de hash no log: adulteração visível, não impossível

- **Status:** aceita
- **Data:** 2026-10-12

## Contexto
O hook barra edição do log por regex sobre o comando de shell (`protecao.py`). Isso é uma lista negra: `git checkout`, um script `.py` em arquivo ou `awk` escapam. O README já admite o limite.

## Decisão
Cada linha nova leva `"prev"`: o sha256 do texto exato da linha anterior, calculado sob a mesma trava que grava. `painel.py verificar` confere que todo `prev` aponta para o hash de alguma linha existente (log ativo + arquivo morto), sem depender da ordem.

- Linhas antigas, sem `prev`, são aceitas só antes do início da cadeia (migração sem quebra).
- Bifurcação (dois filhos do mesmo `prev`) é o resultado normal de `merge=union` entre branches: conta, mas não é problema.
- Mais de uma linha com `prev: ""` = o log foi apagado e recomeçado: problema.
- O arquivamento move linhas como **texto cru**, então os hashes não mudam.

## Alternativas descartadas
- **Assinatura (HMAC/chave):** exige gestão de segredo por máquina e não sobrevive a merge entre máquinas.
- **Bloquear de verdade (permissões de arquivo):** o agente roda com o mesmo usuário do hook.

## Consequências
- Editar ou apagar uma linha do meio é detectado. Apagar **a última** linha não é (não há sucessor). Documentado em "Limites conhecidos".
- +~75 bytes por linha.
