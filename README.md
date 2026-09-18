# Tributax — Motor Tributário

> Um motor de decisão tributária brasileiro: explicável, versionado, auditável e extensível.

Tributax recebe os dados de uma operação comercial (do MEI que emite uma NFS-e à
empresa que integra via API) e determina tributos, códigos fiscais, bases,
alíquotas e fundamentos legais — sempre com rastro completo de decisão.

## Princípios

1. Correção fiscal
2. Auditabilidade
3. Determinismo
4. Explicabilidade ("por que este resultado?")
5. Testabilidade
6. Extensibilidade
7. Manutenibilidade
8. Segurança
9. Performance (por último, sem otimização prematura)

A autoridade do sistema é a **legislação tributária brasileira**. Nenhuma regra é
inventada; incerteza normativa é marcada como `NEEDS_REVIEW`.

## Estado atual

Fase de arquitetura — sem código de produção ainda.

- [x] Proposta arquitetural (bounded contexts, rule engine, pipeline, versionamento temporal)
- [x] Especificação do contrato de payload ([docs/contracts/payload-spec.md](docs/contracts/payload-spec.md))
- [x] ADRs iniciais (001–012, [docs/adr](docs/adr))
- [x] Fase 0 — esqueleto do domínio + pipeline com trace
- [x] Fase 1 — ICMS (interna, interestadual, DIFAL 20/80, FCP) + Fiscal Test Suite
- [x] API REST (`/v1/tax-decisions`, `/v1/tax-simulations`) com tiers de payload
- [x] Persistência Postgres (Drizzle, range types, decisões append-only)
- [ ] Regras carregadas do banco (catálogo como dado vivo)
- [ ] `/v1/parties`, OpenAPI, IPI/PIS/COFINS, simulador web

## Desenvolvimento

```bash
npm install
npm test        # 48 testes (domínio + API; integração pula sem banco)
npm run build   # typecheck estrito nos 3 pacotes
```

Com Docker:

```bash
docker compose up          # Postgres 16 + API em :3000
```

Migrations (com o Postgres de pé):

```bash
cd packages/infrastructure
npx drizzle-kit migrate    # schema gerado
psql "$DATABASE_URL" -f drizzle/custom/01_no_overlap.sql   # vigência disjunta
```

Exemplo:

```bash
curl -X POST localhost:3000/v1/tax-simulations \
  -H 'content-type: application/json' \
  -d '{"correlationId":"demo-1","items":[{"description":"Produto","unitPrice":{"amount":100000}}],"context":{"recipient":{"address":{"state":"SP"}}}}'
```

## Documentação

- [Especificação do payload](docs/contracts/payload-spec.md)
- ADRs ([docs/adr](docs/adr))
