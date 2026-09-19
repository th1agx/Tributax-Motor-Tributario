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
- [x] ADRs (001–013, [docs/adr](docs/adr))
- [x] Fase 0 — esqueleto do domínio + pipeline com trace
- [x] Fase 1 — ICMS (interna, interestadual, DIFAL 20/80, FCP) + Fiscal Test Suite
- [x] API REST (`/v1/tax-decisions`, `/v1/tax-simulations`) com tiers de payload
- [x] Persistência Postgres (Drizzle, range types, decisões append-only)
- [x] Regras carregadas do banco (catálogo como dado vivo)
- [x] `/v1/parties`, OpenAPI + Swagger UI, PIS/COFINS, retenções federais em serviços
- [x] LegislationWatch (ADR-012): diff catálogo × observações, propostas DRAFT `AI_SUGGESTED`
- [x] Coletor legislativo + RAG (`@tributax/collector`, ADR-013): DOU/RSS → chunking → embeddings → extração LLM com guardrails → WatchReport
- [x] Servidor MCP (`@tributax/mcp`, ADR-014): agentes de IA clientes calculam via `tributax_simulate_taxes`/`decide`/`list_rules`, sempre pela API REST
- [x] NormStore em pgvector (`PostgresNormStore` + migration custom, busca `<=>` cosseno) e fila de triagem humana (`GET /v1/rules/review-queue`)
- [x] API keys (`TRIBUTAX_API_KEYS`, guard com `@Public`) e rate limit (`RATE_LIMIT_RPM`, token bucket, 429)
- [ ] Agendamento do agente, IPI, ISS municipal, IBS/CBS (LC 214/25), multi-tenant completo

## Agente de IA (LLM + RAG)

O ciclo fechado (ADR-012/013): fontes públicas → pipeline RAG → observações
com fonte primária → diff contra o catálogo → proposta DRAFT `AI_SUGGESTED` →
**aprovação sempre humana**. Guardrails anti-alucinação: a alíquota citada
precisa estar escrita no texto da norma; a fonte é amarrada ao chunk lido;
rejeições são explícitas.

```bash
cd packages/collector
OPENAI_API_KEY=... WATCH_RSS_FEEDS="https://.../rss" \
  npx tsx src/agent/rag-watch.cli.ts --tribute ICMS --uf RJ --out watch-report.json
# depois, contra a API (cria apenas DRAFTs):
npx tsx ../api/src/monitoring/watch-agent.cli.ts --report watch-report.json --apply
```

## MCP (agentes clientes)

`packages/mcp` expõe o motor como ferramenta MCP (stdio) para Claude/Cursor/
orquestradores — proxy puro da API REST (ADR-014):

```jsonc
// config do agente cliente
{ "mcpServers": { "tributax": {
    "command": "node", "args": ["<repo>/packages/mcp/dist/server.js"],
    "env": { "TRIBUTAX_API_URL": "http://localhost:3000", "TRIBUTAX_API_KEY": "..." } } } }
```

## Desenvolvimento

```bash
npm install
npm test        # 92 testes (domínio + collector + API; integração pula sem banco)
npm run build   # typecheck estrito nos 4 pacotes
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
