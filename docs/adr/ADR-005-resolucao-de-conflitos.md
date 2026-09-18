# ADR-005 — Algoritmo de resolução de conflitos de regras

- Status: ACEITO
- Data: 2026-09-18

## Contexto

Uma operação casam múltiplas regras. "Primeira encontrada vence" é
não-auditável e não-determinístico na prática.

## Decisão

Ordenação **total, determinística e auditável** sobre as regras matched,
por critérios lexicográficos (cada um desempata o anterior):

1. Vigência contém `asOfDate` (filtro, não ordenação);
2. jurisdição mais específica (Município > UF > União, semântica por tributo);
3. profundidade da condição (nº de predicados folha);
4. especificidade de NCM (8 dígitos > capítulo > qualquer);
5. prioridade explícita (campo do operador);
6. precedência normativa declarada (hierarquia legal);
7. versão mais recente;
8. desempate final: identificador ascendente + **warning de ambiguidade**
   com as candidatas (nunca aleatório, nunca ordem de inserção).

## Alternativas

1. Prioridade explícita única como campo — empurra toda a semântica fiscal
   para o operador; frágil em escala.
2. Especificidade só (estilo Rete/ production systems) — ignora hierarquia
   normativa brasileira (Convênio vs regulamento).

## Consequências

- (+) Determinismo: mesma entrada + mesmo snapshot = mesma regra vencedora
  (propriedade central de PBT).
- (+) Cada critério é testável por tabela e explicável no trace.
- (-) Ambiguidade residual vira decisão humana (warning) — correto: ambiguidade
  fiscal silenciosa é o bug mais caro do domínio.
