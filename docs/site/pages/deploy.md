# Deploy & operação

Guia completo em [`docs/deploy.md`](/docs/deploy.md). Resumo operacional:

## Stack gratuita recomendada

| Camada | Serviço | Observação |
|---|---|---|
| API | [Render](https://render.com) | `render.yaml` no repo — botão de deploy de 1 clique; free tier |
| Banco | [Neon](https://neon.tech) | Postgres 16 + pgvector, free sem pausa |
| Watch legislativo | GitHub Actions | `.github/workflows/legislation-watch.yml` — semanal, matriz de alvos |

[![Deploy to Render](https://render.com/images/deploy-button.svg)](https://render.com/deploy?repo=https://github.com/th1agx/Tributax-Motor-Tributario)

## Variáveis de ambiente

| Variável | Papel |
|---|---|
| `DATABASE_URL` | Postgres (Neon) — sem ela, a API sobe com stores in-memory (dev) |
| `TRIBUTAX_ADMIN_KEY` | Administração (tenants, webhooks). **Sem ela, rotas admin ficam desabilitadas** (fail-closed) |
| `TRIBUTAX_API_KEYS` | Keys estáticas de dev (produção usa a tabela `tenants`) |
| `TRIBUTAX_WEBHOOK_SECRET` | Segredo HMAC dos deliveries |
| `RATE_LIMIT_RPM` | Default de quota quando o tenant não tem própria |

## Migrations na ordem

```bash
cd packages/infrastructure && npx drizzle-kit migrate   # schema base
DATABASE_URL=… node scripts/migrate-custom.mjs          # 01 vigências disjuntas, 02 pgvector, 03 tenants
# sem psql na máquina? o migrate-custom usa node+pg
```

Depois, o primeiro tenant (via `POST /v1/tenants` com o admin key) — nunca comite keys.

## VPS com Docker

`docker-compose.prod.yml` sobe Postgres 16 + pgvector e a API. Mesma ordem de migrations.

## Saúde

`GET /openapi.yaml` e `GET /llms.txt` são públicos — use-os como health check. Decisões são append-only ([ADR-007](/docs/adr/ADR-007-trace-append-only.md)): nunca atualizamos uma decisão histórica; uma correção de regra gera nova versão da regra com vigência futura.
