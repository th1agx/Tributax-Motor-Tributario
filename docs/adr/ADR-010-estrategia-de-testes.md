# ADR-010 — Estratégia de testes

- Status: ACEITO
- Data: 2026-09-18

## Contexto

Correção fiscal, determinismo e auditabilidade são os três primeiros princípios
do produto. O domínio deve nascer com testes (TDD), não ganhá-los depois.

## Decisão

Quatro camadas complementares (Vitest + fast-check):

1. **Unit / TDD** — domínio puro (specs, resolver, calculators, Money).
   Red-Green-Refactor; sem I/O, instantâneos.
2. **BDD** — cenários fiscais em Given/When/Then legíveis por contador/QA/PO,
   com vocabulário de negócio, mapeando 1:1 para o pipeline.
3. **Fiscal Test Suite (regressão)** — casos versionados **como dados**
   (input, resultado esperado, fundamento legal, vigência, explicação
   esperada) em `/fiscal-testsuite`. CI falha se comportamento validado mudar
   sem bump de versão de regra/motor. É o contrato funcional do produto.
4. **Property-based (fast-check)** — determinismo (mesma entrada + snapshot =
   mesmo resultado byte a byte), idempotência, invariâncias de Money, ordenação
   total estrita da resolução de regras, `NO_RULE_FOUND` nunca vira imposto
   zero, percentuais dentro de limites.

Integração (Postgres real via testcontainers) para repositories e vigências;
contrato (OpenAPI) para a API; E2E mínimo de fumaça.

## Alternativas

1. Só unit+integração — não cobre a natureza declarativa das regras nem dá
   leitura para não-devs.
2. Testes gerados pelo próprio motor (oracle espelho) — tautologia; o oracle
   aqui é o **caso fiscal com fundamento legal**, escrito por humano.

## Consequências

- (+) Refactor de motor com rede de segurança real (regressão fiscal).
- (+) A Fiscal Test Suite é também material de demo comercial.
- (-) Custo de curadoria de casos contínuo — é o custo do domínio, não da
   arquitetura.
