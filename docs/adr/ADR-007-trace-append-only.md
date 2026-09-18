# ADR-007 — Calculation Trace append-only em JSONB

- Status: ACEITO
- Data: 2026-09-18

## Contexto

Explicabilidade é o diferencial do produto. Todo cálculo precisa ser
investigável: "por que esta operação calculou ICMS diferente ontem?"

## Decisão

- Cada decisão produz um `CalculationTrace`: lista append-only de
  `DecisionStep` (fase, input resumido, output, regras matched/rejeitadas com
  motivo, fundamento legal, versões).
- Persistência: JSONB no Postgres, **particionado por mês**, insert-only
  (update/delete proibidos por permissão de papel).
- O resultado (`TaxOutcome`) referencia o trace; a explicação em linguagem
  natural é **projeção** do trace (parametrizada por audiência), nunca gerada
  de fonte paralela — impossível divergir da decisão real.
- `decisionId` + `engineVersion` + `rulesetHash` + `asOfDate` compõem a chave
  de reprodutibilidade.

## Alternativas

1. Tabela relacional de steps — consultas SQL ricas, mas custo de insert alto
   e leitura sempre completa do pipeline; JSONB espelha melhor a árvore real.
2. Event Sourcing completo — ver ADR-008 (rejeitado).

## Consequências

- (+) Auditoria por construção; investigação retrospectiva sempre disponível.
- (+) Partição mensal contém custo de crescimento.
- (-) Schema do step precisa de contrato versionado (evolução não-breaking).
- (-) Consultas analíticas sobre steps exigem índices GIN seletivos — medir
  antes de otimizar.
