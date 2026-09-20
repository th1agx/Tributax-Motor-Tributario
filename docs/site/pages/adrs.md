# ADRs — Decisões de arquitetura

Cada decisão importante é registrada como **ADR** (Architecture Decision Record): contexto, decisão e consequências. Lidas em sequência, contam a história de por que o Tributax é como é.

| ADR | Decisão |
|---|---|
| [001 — Linguagem](/docs/adr/ADR-001-linguagem.md) | TypeScript strict de ponta a ponta |
| [002 — Arquitetura](/docs/adr/ADR-002-arquitetura.md) | Monorepo, domínio puro sem I/O |
| [003 — Postgres range types](/docs/adr/ADR-003-postgres-range-types.md) | Vigências como `daterange` nativos |
| [004 — Regras como dados](/docs/adr/ADR-004-regras-como-dados.md) | Catálogo no banco, não em código |
| [005 — Resolução de conflitos](/docs/adr/ADR-005-resolucao-de-conflitos.md) | Especificidade vence |
| [006 — Money e percentuais](/docs/adr/ADR-006-money-e-percentuais.md) | Centavos inteiros, basis points |
| [007 — Trace append-only](/docs/adr/ADR-007-trace-append-only.md) | Histórico jamais reescrito |
| [008 — Anti event-sourcing](/docs/adr/ADR-008-anti-event-sourcing.md) | Estado atual + log de decisões, sem replay |
| [009 — Multi-tenancy](/docs/adr/ADR-009-multi-tenancy.md) | Tenants com quota, keys hasheadas |
| [010 — Estratégia de testes](/docs/adr/ADR-010-estrategia-de-testes.md) | Fiscal Test Suite + 208 testes |
| [011 — Vocabulário de specifications](/docs/adr/ADR-011-vocabulario-de-specifications.md) | Predicados declarativos versionados |
| [012 — Monitoração legislativa por IA](/docs/adr/ADR-012-monitoracao-legislativa-por-ia.md) | IA propõe, humano aprova |
| [013 — Coletor + RAG](/docs/adr/ADR-013-coletor-rag.md) | DOU/RSS → embeddings pgvector → extração com guardrails |
| [014 — Servidor MCP](/docs/adr/ADR-014-servidor-mcp.md) | MCP como proxy puro da REST |
| [015 — CBS/IBS transição](/docs/adr/ADR-015-cbs-ibs-transicao.md) | Alíquotas-teste 2026 com vigência explícita |
