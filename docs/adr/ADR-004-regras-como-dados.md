# ADR-004 — Regras como dados interpretados

- Status: ACEITO
- Data: 2026-09-18

## Contexto

O coração do sistema é um rule engine. Regra fiscal muda com legislação;
software muda com deploy. Não pode ser preciso deploy para alíquota nova.

## Decisão

**Regras vivem no banco como dados declarativos interpretados pelo motor**:

- Condição: árvore de Specification serializada (JSON) sobre **vocabulário
  fechado e versionado** de predicados fiscais (`isInterstate`,
  `ncmIn`, `recipientRoleIs`...).
- Efeito: lista ordenada de efeitos declarativos (`applyRate`,
  `reduceBasis`, `defer`, `exempt`...), cada um com `legalBasis`.
- O `SpecificationCompiler` valida o predicado contra o schema do vocabulário;
  predicado desconhecido/inválido **impede o carregamento da regra** (falha em
  carga, nunca em cálculo).

Não usamos: regras em código (deploy por mudança fiscal), DSL textual
executável custom (custo de parser/segurança), nem regras como SQL/expressões
ad hoc (não auditáveis).

## Consequências

- (+) Atualização fiscal sem publicação de software; mesma engine, novos dados.
- (+) Regras são auditáveis, versionadas e com fundamento legal obrigatório.
- (+) Snapshot de regras (hash) torna cálculo reproduzível.
- (-) Vocabulário vira superfície de manutenção crítica → versionar schema do
  vocabulário desde o dia 1; adicionar predicado exige revisão + teste.
- (-) Condições expressivas limitadas ao vocabulário — aceito: predicado fora
  do vocabulário indica conceito de domínio novo que merece modelagem explícita.
