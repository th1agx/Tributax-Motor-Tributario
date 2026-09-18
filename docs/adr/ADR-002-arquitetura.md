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

## Critérios de revisão (gatilhos objetivos para extrair serviços)

O monolito modular é a decisão **para a fase atual**, não para sempre.
Extração de um contexto para serviço independente é justificada quando
qualquer um destes gatilhos se materializar — e nenhum existe hoje:

1. **Escala de carga seletiva** — cálculo precisar escalar horizontalmente
   independente do authoring (ex.: lote de milhões de operações em pico);
2. **Escala organizacional** — times distintos donos de contexto com
   cadências de deploy em conflito comprovado;
3. **SLA/compliance diferenciado** — exigência contratual de isolamento por
   componente (authoring sensível vs. cálculo público);
4. **Isolamento de falha** — degradação de um componente afetando o outro,
   comprovada em incidente real.

Primeiro candidato natural, se um dia houver: `RuleCatalog` (authoring e
workflow) separado de `TaxDecision` (cálculo em runtime) — perfis de carga e
público distintos. Contratos atuais (payload versionado, vocabulário de
specifications, ports hexagonais) foram desenhados para sobreviver à extração
sem quebrar clientes.

O que NÃO muda com extração: decisões permanecem determinísticas e auditáveis
— versão de motor + snapshot de regras + asOfDate viajam com a requisição,
independente da topologia.
