---
title: "Guia de deploy"
description: "Como colocar o Tributax no ar: stack gratuito (Koyeb/Render + Neon + GitHub Actions), variáveis de ambiente, migrations e verificação."
source_url: /docs/deploy.md
---

# Guia de deploy

Zero mudança de código: a API não conhece o provedor do banco (só
`DATABASE_URL`), o Dockerfile já existe e as env vars estão documentadas no
`.env.example`. Deploy é configuração.

## Visão do stack (gratuito)

| Peça | Onde | Por quê |
|---|---|---|
| API (`packages/api`) | Koyeb ou Render (free) | Deploy por push via Dockerfile |
| Postgres + pgvector | **Neon** (free) | Não adormece (Supabase free pausa o projeto inativo) |
| Agente legislativo | GitHub Actions | Workflow semanal já existe (`legislation-watch.yml`) |
| MCP | Nada a deployar | Roda na máquina do cliente apontando para a API pública |

Limites do grátis (seja honesto com clientes): cold start de ~30-60s após
inatividade, sem SLA, token bucket in-memory vale para 1 réplica. Plano pago
(~US$5-10/mês) elimina o cold start quando houver cliente real.

## 1. Banco (Neon)

1. Crie conta em neon.tech e um projeto; copie a connection string
   (`postgres://...`) — ela é a `DATABASE_URL`.
2. Aplique as migrations **na ordem**:

```bash
# schema base (gerado pelo Drizzle)
cd packages/infrastructure
DATABASE_URL="postgres://..." npx drizzle-kit migrate

# constraints e extensões custom (na ordem)
psql "$DATABASE_URL" -f drizzle/custom/01_no_overlap.sql   # vigência disjunta
psql "$DATABASE_URL" -f drizzle/custom/02_pgvector.sql      # RAG (pgvector)
psql "$DATABASE_URL" -f drizzle/custom/03_tenants.sql       # multi-tenant
```

3. Semeie o catálogo e importe as tabelas oficiais (opcional):

```bash
npx tsx src/seed.ts                      # catálogo ICMS/PIS/COFINS/IPI/CBS/IBS/ISS
npx tsx src/tipi-import.cli.ts --csv tipi.csv --db "$DATABASE_URL"       # TIPI (RFB)
npx tsx src/iss-import.cli.ts --csv iss-municipios.csv --db "$DATABASE_URL"  # ISS municipal
```

## 2. API (Koyeb ou Render)

1. Conecte o serviço ao repositório GitHub (build: Dockerfile na raiz).
2. Configure as variáveis:

| Env | Obrigatória | Função |
|---|---|---|
| `DATABASE_URL` | sim | Postgres (Neon) |
| `PORT` | auto | Platform injeta |
| `TRIBUTAX_ADMIN_KEY` | **sim em produção** | Administração `/v1/tenants` (sem ela, 403 — fail closed) |
| `TRIBUTAX_API_KEYS` | não | Keys estáticas de dev; em produção prefira a tabela `tenants` |
| `RATE_LIMIT_RPM` / `RATE_LIMIT_BURST` | não | Limite global (default 240/60) |
| `OPENAI_API_KEY` e afins | não | LLM/RAG do LegislationWatch |

3. O deploy acontece a cada push em `main`; o boot já faz probe do Postgres
   e avisa no log se cair no fallback in-memory.

## 3. Proteção no primeiro dia

Antes de divulgar a URL:

```bash
# crie o primeiro tenant (key exibida UMA única vez — guarde)
curl -X POST https://SEU-APP/v1/tenants \
  -H 'x-admin-key: SUA_ADMIN_KEY' -H 'content-type: application/json' \
  -d '{"name":"Empresa Demo","rpmQuota":60}'
```

A partir daí, chamadas usam `x-api-key: <key do tenant>`; sem key válida a
API responde 401 (o modo "dev aberto" só existe sem nenhuma key configurada
— com tenants no banco, ele está desligado).

## 4. Agente legislativo (GitHub Actions)

No repositório: Settings → Secrets and variables → Actions:

- `OPENAI_API_KEY` — extração LLM real (sem ela, o ciclo roda offline);
- `TRIBUTAX_API_URL` — `https://SEU-APP` para aplicar propostas DRAFT na fila
  de triagem (ainda é só via `watch-agent.cli.ts`, ADR-012);
- `WATCH_RSS_FEEDS` — feeds de diários/SEFAZs (vírgula).

A varredura roda às segundas 06:00 UTC (ou dispare em Actions → LegislationWatch → Run workflow).

## 5. Verificação pós-deploy

```bash
# docs públicas (Swagger) — sem key
curl https://SEU-APP/docs
curl https://SEU-APP/llms.txt            # manifesto para agentes
curl https://SEU-APP/openapi.yaml | head

# cálculo real com a key do tenant
curl -X POST https://SEU-APP/v1/tax-simulations \
  -H 'content-type: application/json' -H 'x-api-key: KEY_DO_TENANT' \
  -d '{"correlationId":"smoke-1","items":[{"description":"Produto","unitPrice":{"amount":100000}}],"context":{"recipient":{"address":{"state":"SP"}}}}'
```

Espera-se 200/201 com ICMS 12% (MG→SP contribuinte), PIS/COFINS, CBS 0,9%,
IBS 0,1% e `rulesetHash` no corpo.

## Alternativa: VPS com docker-compose

Para sair do free tier sem plataforma: qualquer VPS (Hetzner/Contabo,
~€4/mês) com Docker:

```bash
cp .env.example .env   # preencha DATABASE_URL (Neon ou Postgres local) e TRIBUTAX_ADMIN_KEY
docker compose -f docker-compose.prod.yml up -d
```

O `docker-compose.prod.yml` não expõe portas do banco — só a API em `:3000`
na frente de um reverse proxy com TLS (Caddy/nginx) é o padrão recomendado.

## MCP do lado do cliente

Cada cliente configura no agente dele (Claude/Cursor/orquestrador):

```jsonc
{ "mcpServers": { "tributax": {
    "command": "node", "args": ["tributax-mcp/dist/server.js"],
    "env": { "TRIBUTAX_API_URL": "https://SEU-APP", "TRIBUTAX_API_KEY": "KEY_DO_TENANT" } } } }
```
