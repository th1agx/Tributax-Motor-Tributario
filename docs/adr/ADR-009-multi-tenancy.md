# ADR-009 — Multi-tenancy lógico com tenant_id

- Status: ACEITO
- Data: 2026-09-18

## Contexto

Produto nasce single-tenant de fato, mas o destino é SaaS (do MEI à grande
empresa). Decisão precisa permitir evolução sem reescrita.

## Decisão

- **Tenant lógico**: toda entidade de aplicação carrega `tenantId`; isolamento
  garantido na camada de aplicação (repositories sempre escopados por tenant,
  injetados com o contexto da requisição — impossível consultar sem escopo).
- Sem DB-per-tenant e sem schema-per-tenant no MVP.
- Dados fiscais **globais** (regras, alíquotas, fundamentos legais, NCM) não
  são por tenant: são o catálogo compartilhado versionado (leitura para todos,
  escrita via workflow). Overrides/clientes de regra são links tenant→regra
  ou dados tenant-isolados.

## Alternativas

1. **DB-per-tenant** — isolamento forte, custo operacional alto (migrações ×N);
   inviável para tier MEI.
2. **RLS no Postgres** — candidatos a reforço na fase SaaS; não agora (não
   conflita com a decisão; é endurecimento do mesmo modelo).

## Consequências

- (+) SaaS sem infraestrutura dedicada desde o dia 1.
- (+) Catálogo global é um ativo do produto, não um custo por cliente.
- (-) Bug de escopo vaza dados entre tenants → mitigação: repositories escopados
  por construção + teste de isolamento contínuo no CI + revisão para RLS quando
  abrir multi-tenant comercial.
