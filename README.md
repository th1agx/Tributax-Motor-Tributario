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
- [ ] ADRs iniciais
- [ ] Fase 0 — esqueleto do domínio + pipeline com trace
- [ ] Fase 1 — ICMS + Fiscal Test Suite + simulador (API)

## Documentação

- [Especificação do payload](docs/contracts/payload-spec.md)
- ADRs (a criar em `docs/adr/`)
