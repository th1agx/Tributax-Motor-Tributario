# ADR-003 — PostgreSQL com range types para vigência

- Status: ACEITO
- Data: 2026-09-18

## Contexto

Regras fiscais, alíquotas, regimes e benefícios são entidades temporais: vigem
em intervalos disjuntos, e o cálculo é sempre datado (`asOfDate`). Sobreposição
indevida de vigências é defeito grave que deve ser impossível de persistir.

## Decisão

**PostgreSQL** como banco único, usando:

- `tstzrange`/`daterange` para vigências em todas as entidades fiscais;
- `EXCLUDE USING gist` com operador de sobreposição para garantir disjunção
  (por escopo: regra × tributo × jurisdição × NCM...);
- `JSONB` para traces de cálculo, particionado por mês;
- inserts imutáveis para decisões e histórico de regras (append-only).

## Alternativas

1. **MySQL/MariaDB** — sem range types/exclusion constraints nativos; a garantia
   cairia em código aplicativo, violando o princípio de defesa no dado.
2. **MongoDB** — JSON natural, mas transações e constraints temporais fracas.

## Consequências

- (+) Invariante temporal garantido pelo banco, não por disciplina de código.
- (+) Consultas temporais (`@> asOfDate`) idiomáticas e indexadas (GiST).
- (-) ORM escolhido precisa expor range types (ver ADR-004 do app: Drizzle).
- (-) Particionamento de traces exige manutenção de schema (automação prevista).
