# ADR-008 — Não adotar Event Sourcing

- Status: ACEITO
- Data: 2026-09-18

## Contexto

Auditoria e versionamento sugerem Event Sourcing. Avaliar valor real antes de
adotar por moda.

## Decisão

**Não adotar.** As necessidades são atendidas por estruturas mais simples:

- Auditoria de regras → histórico de versões append-only + workflow de
  aprovação (ADR-004, ADR-003).
- Auditoria de decisões → Calculation Trace append-only (ADR-007).
- Reprodutibilidade → snapshot de regras (`rulesetHash`) + versão de motor +
  `asOfDate`; recalcula-se a decisão, não se repram eventos.

## O que perderíamos com ES

- Replay de agregados: nenhum agregado fiscal precisa ser reconstruído por
  eventos — o estado fiscal em T é função de dados datados, não de histórico
  de mutações.
- Custo real: versionamento de eventos, upcasting, migração de projeções,
  operação de event store — tudo sem requisito correspondente.

## Condições de revisão

Se surgir necessidade de reprocessar em massa cálculos emitidos por mudança de
interpretação legal (cena real em fiscal), reavaliar com **sagas/compensação e
recálculo por snapshot**, que já cobre o caso sem ES; ES só se houver exigência
regulatória de reconstrução por eventos.

## Consequências

- (+) Complexidade operacional drasticamente menor.
- (+) Modelo mental direto: dado datado + decisão imutável.
- (-) "História" de uma regra é a linhagem de versões, não um stream —
  suficiente para os requisitos de auditoria levantados.
