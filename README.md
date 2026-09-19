<p align="center">
  <img src="docs/assets/logo.svg" width="160" alt="Logo Tributax" />
</p>

<h1 align="center">Tributax</h1>

<p align="center">
  <strong>Motor de decisão tributária brasileiro — explicável, versionado, auditável.</strong><br/>
  Do MEI que emite uma NFS-e à multinacional que integra via API: uma requisição retorna
  tributos, alíquotas, bases, CFOP/CST, fundamentos legais e o rastro completo da decisão.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/stack-Node%2022%20%7C%20NestJS%20%7C%20Drizzle%20%7C%20Postgres%2016-0ea5e9" alt="stack"/>
  <img src="https://img.shields.io/badge/testes-208%20verdes-16a34a" alt="testes"/>
  <img src="https://img.shields.io/badge/cobertura%20ICMS-27%2F27%20UFs-0f766e" alt="ICMS"/>
  <img src="https://img.shields.io/badge/TS-strict%20%7C%20exactOptionalPropertyTypes-3178c6" alt="TypeScript"/>
</p>

<p align="center">
  <a href="https://tributax-api.onrender.com/llms.txt"><code>Documentação para agentes (llms.txt)</code></a> ·
  <a href="https://tributax-api.onrender.com/openapi.yaml"><code>OpenAPI</code></a> ·
  <a href="docs/deploy.md">Guia de deploy</a> ·
  <a href="docs/adr">ADRs</a>
</p>

---

## O que é

O Tributax é um **motor tributário como serviço**. Você envia os dados de uma operação
comercial (quem emite, quem recebe, o que é, para onde vai) e recebe de volta a carga
tributária completa — com a qual de cada imposto, quanto, sobre qual base, com qual
fundamento legal, por qual regra — e por que as alternativas foram descartadas.

Nada de "caixa-preta que calcula imposto": toda decisão carrega **trace auditável**,
**hash do ruleset** (reprodutibilidade) e marcação explícita de incerteza normativa
(`NEEDS_REVIEW`) em vez de suposição silenciosa.

```json
{
  "correlationId": "demo-1",
  "context": { "recipient": { "address": { "state": "SP" } } },
  "items": [{
    "description": "Notebook",
    "unitPrice": { "amount": 350000 },
    "classification": { "ncm": "84713012" }
  }]
}
```

Resposta (real, produção — venda interestadual a consumidor final):

| Tributo | Resultado | Alíquota | Valor | Código | Fundamento |
|---|---|---|---|---|---|
| ICMS | TAXED | 12% | R$ 420,00 | CST 00 | Res. 22/1989 |
| DIFAL | TAXED | 6% | R$ 210,00 | — | LC 190/2022 |
| FCP | TAXED | 2% | R$ 70,00 | — | LC 87/96, art. 82-A |
| PIS/COFINS | TAXED | 1,65% / 7,6% | R$ 57,75 / R$ 266,00 | CST 01 | Leis 10.637/02, 10.833/03 |
| CBS / IBS | TAXED | 0,90% / 0,10% | R$ 31,50 / R$ 3,50 | — | LC 214/2025 (alíquotas-teste 2026) |

…mais CFOP **6102** inferido, documento **NFC-e**, inferências (`recipient.role →
FINAL_CONSUMER`) e `rulesetHash` para reprodutibilidade. [Resposta completa](docs/llms-overview.md).

## Por que é diferente

1. **Regras como dados** ([ADR-004](docs/adr/ADR-004-regras-como-dados.md)) — nada de
   `if` espalhado por código; regras vivem no Postgres com vigências disjuntas
   garantidas por constraint (`EXCLUDE` com `daterange`).
2. **Explicabilidade nativa** ([ADR-005](docs/adr/ADR-005-resolucao-de-conflitos.md),
   [ADR-007](docs/adr/ADR-007-trace-append-only.md)) — especificidade vence conflitos;
   decisões são append-only; toda resposta responde "por quê".
3. **IA que propõe, humano que aprova** ([ADR-012](docs/adr/ADR-012-monitoracao-legislativa-por-ia.md)) —
   o agente LLM+RAG monitora DOU/RSS, extrai observações com fonte primária e cria
   apenas rascunhos `AI_SUGGESTED`. Guardrails anti-alucinação: a alíquota precisa estar
   escrita no texto da norma; rejeições têm motivo.
4. **Honestidade fiscal** — `NO_RULE_FOUND` nunca vira imposto zero; incerteza vira
   fila de revisão (`NEEDS_REVIEW`), nunca suposição.
5. **Feito para agentes** — documentação padrão [llms.txt](https://llmsstxt.org) servida
   pela própria API, servidor MCP para clientes com IA, SDK com retry/idempotência.

## Tributos e cobertura

| Área | Cobertura |
|---|---|
| **ICMS** | 27/27 UFs (alíquota interna, fontes públicas 2026), interestadual, DIFAL 20/80, FCP (21 UFs), ST com MVA (Conv. 92/15) |
| **PIS/COFINS** | Não cumulativo, cumulativo, isenção, suspensão |
| **IPI** | Não-incidência em serviços, imunidade de exportação, TIPI oficial (importador CSV RFB) |
| **ISS / NFS-e** | LC 116/03: município do prestador, deduções de base, exportação não incide, retenção PJ→PJ |
| **Simples Nacional** | DAS Anexo I (6 faixas + 7ª NEEDS_REVIEW) e Anexo III (alíquota efetiva com dedução por RBT12) |
| **CBS/IBS** | LC 214/2025 — alíquotas-teste 2026 com vigência explícita e split payment sinalizado |
| **Retenções** | IRRF/CSLL/PIS/COFINS retidos em serviços |
| **Códigos** | CFOP inferido, CST/CSOSN por tributo (00/40/41, 102/103/400, 10/500…) |

## Arquitetura

```
packages/
  domain/           # motor puro: specifications, pipeline, efeitos (applyRate, applySt,
                    #   applyDasAnexo...), catálogos por tributo — zero I/O
  api/              # NestJS: REST /v1, guards (api-key, admin, rate-limit), idempotência,
                    #   webhooks HMAC, docs llms.txt, OpenAPI
  infrastructure/   # Postgres (Drizzle), stores, importadores (TIPI, ISS, MVA-ST)
  collector/        # agente IA: RSS/DOU → chunking → embeddings → RAG pgvector →
                    #   extração LLM com guardrails → WatchReport
  mcp/              # servidor MCP (stdio) — proxy puro da REST para agentes clientes
  sdk/              # cliente TypeScript: retry/backoff, erros tipados, idempotencyKey
```

Multi-tenant com quota por empresa (ADR-009): API keys guardadas como sha256,
rate limit por tenant, administração por `x-admin-key` (fail-closed).

## Começando

```bash
git clone https://github.com/th1agx/Tributax-Motor-Tributario.git
cd Tributax-Motor-Tributario
npm install
docker compose up -d      # Postgres 16 + pgvector
npm run build && npm start  # API em :3000
npm test                  # 208 testes
```

Migrations e seed:

```bash
cd packages/infrastructure && npx drizzle-kit migrate
cd ../.. && DATABASE_URL=... node scripts/migrate-custom.mjs   # sem psql
```

### Usando a API

```bash
curl -s -X POST https://tributax-api.onrender.com/v1/tax-simulations \
  -H "Content-Type: application/json" \
  -H "x-api-key: $TRIBUTAX_API_KEY" \
  -d '{"correlationId":"demo","context":{"recipient":{"address":{"state":"SP"}}},
       "items":[{"description":"Notebook","unitPrice":{"amount":350000},
                 "classification":{"ncm":"84713012"}}]}'
```

Principais endpoints: `POST /v1/tax-decisions` (persiste, com `x-idempotency-key`),
`POST /v1/tax-simulations`, `/v1/parties`, `/v1/rules` (+ `review-queue`),
admin em `/v1/tenants` e `/v1/webhooks`. Contrato completo:
[OpenAPI](docs/openapi.yaml) e [especificação de payload](docs/contracts/payload-spec.md).

### Para agentes de IA

O Tributax se apresenta no padrão **llms.txt** — aponte seu agente para
`https://tributax-api.onrender.com/llms.txt` (ou `/llms-full.txt`). Para clientes
Claude/Cursor/orquestradores, o servidor MCP:

```jsonc
{ "mcpServers": { "tributax": {
    "command": "node", "args": ["<repo>/packages/mcp/dist/server.js"],
    "env": { "TRIBUTAX_API_URL": "https://tributax-api.onrender.com",
             "TRIBUTAX_API_KEY": "..." } } } }
```

Ferramentas: `tributax_simulate_taxes`, `tributax_decide_taxes`, `tributax_list_rules`.

### Agente de monitoração legislativa (LLM + RAG)

```bash
cd packages/collector
OPENAI_API_KEY=... WATCH_RSS_FEEDS="https://.../rss" \
  npx tsx src/agent/rag-watch.cli.ts --tribute ICMS --uf RJ --out watch-report.json
# cria apenas DRAFTs AI_SUGGESTED contra a API:
npx tsx ../api/src/monitoring/watch-agent.cli.ts --report watch-report.json --apply
```

Rodada semanal automatizada em `.github/workflows/legislation-watch.yml` (matriz de
alvos, dry-run + apply opcional).

## Deploy

[![Deploy to Render](https://render.com/images/deploy-button.svg)](https://render.com/deploy?repo=https://github.com/th1agx/Tributax-Motor-Tributario)

Um clique sobe a API (render.yaml); banco recomendado: [Neon](https://neon.tech)
(free, sem pausa). Guia completo em [docs/deploy.md](docs/deploy.md), incluindo
`docker-compose.prod.yml` para VPS. Instância de demonstração:
`https://tributax-api.onrender.com`.

## Princípios

Correção fiscal · Auditabilidade · Determinismo · Explicabilidade · Testabilidade ·
Extensibilidade · Manutenibilidade · Segurança · Performance (por último, sem
otimização prematura).

A autoridade do sistema é a **legislação tributária brasileira**. Nenhuma regra é
inventada; incerteza normativa é marcada como `NEEDS_REVIEW`.

## Roadmap

- [ ] FCP por NCM (AL/GO/MT/AM) e curadoria ST/municipal em volume
- [ ] Anexo V do Simples (CNAE) — hoje `NEEDS_REVIEW`
- [ ] Validação externa com contadores (amostragem de decisões reais)
- [ ] CBS/IBS definitivas conforme regulamentação da LC 214/2025

## Documentação

- [Visão geral para LLMs](docs/llms-overview.md)
- [Especificação do payload](docs/contracts/payload-spec.md)
- [OpenAPI](docs/openapi.yaml) · [Guia de deploy](docs/deploy.md)
- [ADRs 001–015](docs/adr) — decisões de arquitetura com contexto e consequências

## Licença

UNLICENSED (privado). Logotipo: `docs/assets/logo.svg`.
