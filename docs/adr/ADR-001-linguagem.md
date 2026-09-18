# ADR-001 — Escolha da linguagem

- Status: ACEITO
- Data: 2026-09-18

## Contexto

O Tributax é um motor de decisão tributária: regras como dados interpretados,
tipos que representam estados fiscais (TAXED, EXEMPT, NO_RULE_FOUND...),
determinismo, contratos de API estáveis e futuramente SDK público.

## Decisão

**TypeScript** (Node.js + NestJS) como linguagem principal do backend.

## Alternativas

1. **C#/.NET** — tecnicamente a mais forte para rule engines: pattern matching
   rico, `decimal` nativo, discriminated unions (via records + switch
   exaustivo), maturidade enterprise. Descartada por: ecossistema de
   contratação menor no público-alvo inicial, e por o simulador web e SDK
   futuro compartilharem o mesmo idioma com TS.
2. **Java/Kotlin** — maturidade e bibliotecas fiscais existentes, mas mesmo
   argumento de C# mais verbosidade.
3. **Go** — ótimo para infra, fraco para modelagem de domínio rica
   (falta de uniões tipadas prejudica o modelo de TaxOutcome).

## Consequências

- (+) Um único idioma: API, SDK, simulador web, exemplos.
- (+) Tipos estruturais + discriminated unions modelam TaxOutcome bem.
- (+) OpenAPI/JSON ecosystem nativo.
- (-) Sem `decimal` nativo: mitigado por ADR-006 (inteiros em centavos/basis
  points; proibição de aritmética de ponto flutuante no domínio).
- (-) Runtime de CPU inferior a .NET/JVM: irrelevante na fase atual; revisitável
  se profiling mostrar gargalo real.

## Critério de revisão

Se o custo de manutenção do modelo de domínio em TS superar o benefício de
unificação de stack, reavaliar C# — o domínio é puro e portável por design.
