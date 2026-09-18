# ADR-011 — Vocabulário de Specifications versionado

- Status: ACEITO
- Data: 2026-09-18

## Contexto

Regras são árvores de predicados sobre um vocabulário (ADR-004). O vocabulário
é superfície crítica: cresce desordenadamente se não for governado.

## Decisão

- O vocabulário de predicados é um **schema versionado** (`spec-v1`, `spec-v2`...):
  catálogo de predicados com nome, tipagem dos argumentos, semântica documentada
  e testes canônicos.
- Cada regra declara a versão do vocabulário em que foi escrita. O motor suporta
  N versões vivas simultaneamente (regra antiga não quebra com bump).
- **Evolução só aditiva dentro de uma versão major**: novo predicado ok;
  mudança de semântica/assinatura = nova major com deprecação anunciada e
  migração assistida das regras afetadas (relatório de impacto automático).
- Predicado desconhecido na versão declarada → regra não carrega (falha em
  carga, ADR-004).
- Metadados obrigatórios por predicado: desde qual versão existe, deprecado em?

## Alternativas

1. Vocabulário livre (eval de expressões) — não auditável, risco de segurança,
  regras não portáteis.
2. Versão única global com migração big-bang — congela evolução.

## Consequências

- (+) Evolução do domínio sem quebrar regras publicadas (essencial: regra
  vigente é dado histórico, não pode ser rescrita).
- (+) Relatório de impacto de mudança de vocabulário é automático (quais regras
  usam o predicado).
- (-) Máquina de interpretação mantém compat de N versões — custo controlado,
  versões major devem ser raras.
