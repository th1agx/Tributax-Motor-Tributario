# Endpoints

Referência das rotas da API REST. Contrato formal: [OpenAPI 3.1](/openapi.yaml) · interface interativa: [Swagger UI](/docs/api).

## Decisões e simulações

### `POST /v1/tax-decisions`

Calcula a tributação e **persiste** a decisão (trace auditável + `rulesetHash`).

| | |
|---|---|
| Auth | API key do tenant |
| Idempotência | Envie `x-idempotency-key`; reenvios devolvem a mesma decisão com header `x-idempotent-replay: true` |
| Sucesso | `201` com a decisão completa |

### `POST /v1/tax-simulations`

Mesmo cálculo, **sem persistir**, ideal para orçamento, preview de carrinho e testes.

### `GET /v1/tax-decisions/{id}`

Recupera uma decisão persistida pelo `decisionId` (UUID).

## Cadastros

### `POST /v1/parties` · `GET /v1/parties/{ref}`

Cadastra e consulta partes (emitente/tomador) por id ou CNPJ/CPF. O cadastro carrega **regimes fiscais como intervalos temporais disjuntos**, a decisão usa o vigente na data da operação, permitindo cálculo retroativo correto após mudança de regime.

```json
{
  "taxId": "12345678000199",
  "legalName": "Empresa Exemplo LTDA",
  "type": "COMPANY",
  "establishments": [{
    "address": { "state": "SP", "city": "São Paulo" },
    "taxRegimes": [{ "regime": "NORMAL", "validFrom": "2024-01-01" }]
  }]
}
```

## Catálogo de regras

### `GET /v1/rules`

Lista o catálogo completo (todos os status) com vigência e fundamento legal de cada regra.

### `POST /v1/rules`

Propõe uma regra, nasce `DRAFT`. Agentes de IA propõem com `origin: "AI_SUGGESTED"`; **a aprovação é sempre humana** ([ADR-012](/docs/adr/ADR-012-monitoracao-legislativa-por-ia.md)).

### `POST /v1/rules/{id}/transitions`

Transiciona status: `DRAFT REVIEW APPROVED ACTIVE` (ou `DEPRECATED`/`REVOKED`). A transição de aprovação recusa `actor: "AI_AGENT"`, invariante do sistema.

### `GET /v1/rules/review-queue`

Fila de triagem humana: observações legislativas extraídas pelo agente IA aguardando revisão.

## Administração (x-admin-key)

### `POST /v1/tenants` · `GET /v1/tenants` · `PATCH /v1/tenants/{id}`

Criação e gestão de tenants: key exibida uma única vez, `rpmQuota`, `active`. Detalhes em [Autenticação](#/autenticacao).

### `POST /v1/webhooks` · `GET /v1/webhooks`

Registro de webhooks (`decision.created`, `rule.proposal.created`) com assinatura HMAC. Detalhes em [Webhooks](#/webhooks).
