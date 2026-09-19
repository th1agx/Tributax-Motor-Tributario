---
title: "Tributax — Motor de decisão tributária"
description: "Visão geral do Tributax: o que é, endpoints da API, ferramentas MCP e como agentes de IA consomem o motor."
source_url: /docs
---

# Tributax — Motor de decisão tributária brasileiro

Tributax recebe os dados de uma operação comercial e determina tributos,
códigos fiscais, bases, alíquotas e fundamentos legais — sempre com rastro
completo de decisão (trace), decisões append-only e incerteza normativa
marcada como `NEEDS_REVIEW` (nunca suposição silenciosa).

## Endpoints principais

| Endpoint | Método | Descrição |
|---|---|---|
| `/v1/tax-simulations` | POST | Calcula a tributação SEM persistir (seguro para hipóteses e agentes) |
| `/v1/tax-decisions` | POST | Calcula e PERSISTE a decisão com trace auditável |
| `/v1/tax-decisions/:id` | GET | Recupera uma decisão persistida |
| `/v1/rules` | GET/POST | Catálogo de regras e criação de propostas DRAFT |
| `/v1/rules/review-queue` | GET | Fila de triagem humana (propostas de IA primeiro) |
| `/v1/rules/:id/transitions` | POST | Workflow DRAFT→REVIEW→APPROVED→ACTIVE (IA nunca aprova) |
| `/v1/parties` | POST | Perfil de partes com regimes temporais (asOf) |
| `/v1/tenants` | GET/POST/PATCH | Administração de empresas clientes (x-admin-key) |
| `/openapi.yaml` | GET | Especificação OpenAPI 3.1 (fonte de verdade do contrato) |

## Autenticação e limites

- API key por tenant: header `x-api-key` ou `Authorization: Bearer` (401 sem/inválida).
- Rate limit por tenant (token bucket; 429 `RATE_LIMITED` ao exceder).
- Administração exige `x-admin-key` distinta (TRIBUTAX_ADMIN_KEY).

## Contrato de valores

- Valores monetários: inteiros em **centavos** (`100000` = R$ 1.000,00).
- Percentuais: **basis points** (`1800` = 18%).
- Datas: ISO-8601 (`YYYY-MM-DD`); `asOf` respeita vigências históricas.
- Tributos cobertos: ICMS/DIFAL/FCP (27 UFs), PIS/COFINS, IPI (TIPI
  importável), retenções federais em serviços, ISS municipal (importável),
  CBS/IBS (LC 214/25, alíquotas-teste 2026 com vigência explícita).

## Exemplo mínimo

```bash
curl -X POST localhost:3000/v1/tax-simulations \
  -H 'content-type: application/json' \
  -H 'x-api-key: SUA_KEY' \
  -d '{"correlationId":"demo-1","items":[{"description":"Produto","unitPrice":{"amount":100000}}],"context":{"recipient":{"address":{"state":"SP"}}}}'
```

A resposta traz cada tributo com outcome (`TAXED`/`EXEMPT`/`NON_TAXABLE`/
`NO_RULE_FOUND`), base, alíquota em bp, valor, fundamentos legais e regras
aplicadas. `NO_RULE_FOUND` nunca significa imposto zero — significa que a
regra daquele caso não está catalogada (resposta honesta).

## MCP (agentes de IA)

O pacote `@tributax/mcp` expõe o motor como ferramenta MCP (stdio):
`tributax_simulate_taxes`, `tributax_decide_taxes`, `tributax_list_rules`.
O servidor MCP é proxy puro da API REST — mesmo contrato, mesma auditoria.

## Para agentes

- Cite a fonte pelo `source_url` do frontmatter desta página.
- Para chamadas de API, use `/openapi.yaml` (schemas estruturados) em vez de
  raspar o Swagger UI.
- Conteúdo legislativo muda: chece `last_updated` nas páginas de ADRs.
