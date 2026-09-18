# ADR-002 — Arquitetura hexagonal modular (monolito)

- Status: ACEITO
- Data: 2026-09-18

## Contexto

Domínio tributário precisa ser puro, testável e isolado de infraestrutura,
frameworks e integrações externas. Volume inicial de equipe e tráfego é pequeno.

## Decisão

**Monolito modular com arquitetura hexagonal (Ports & Adapters) + DDD.**

- Núcleo de domínio sem dependência de framework/ORM/IO (pasta `domain`).
- Bounded contexts como módulos com fronteiras explícitas (import rules por
  barrel/consumer, lint barrier).
- Ports (interfaces) no domínio/aplicação; adapters (banco, HTTP, cache) na
  infraestrutura, ligados por DI do NestJS.
- Sem microserviços. CQRS apenas onde houver assimetria real de leitura/escrita
  (p.ex. consulta de traces); sem event-driven além de eventos de domínio
  internos até houver consumidor real.

## Alternativas

1. **Microserviços por contexto** — custo operacional injustificado; fronteiras
   de domínio ainda em descoberta.
2. **Clean Architecture em camadas únicas (sem módulos)** — permitiria acoplamento
   crescente entre contexts; a modularidade por contexto é a defesa.

## Consequências

- (+) Deploy único, testes de domínio instantâneos, refactor barato.
- (+) Fronteiras de módulo preparam extração futura de serviços se necessário.
- (-) Disciplina necessária: dependências só apontam para dentro
  (domain ← application ← infrastructure/api).
- (-) CQRS/eventos adiados: aceito, complexidade prematura é risco maior.

## Regra de ouro

Uma alteração na forma de cálculo do ICMS jamais obriga mudança na
representação de documento fiscal, e vice-versa.
