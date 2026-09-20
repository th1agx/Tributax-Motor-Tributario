# Reforma Tributária: CBS e IBS (LC 214/2025)

A transição para o IVA dual começou, e o Tributax trata o assunto como trata qualquer norma: com vigência explícita, sem achismo.

## Como o motor lida hoje

| Aspecto | Tratamento |
|---|---|
| Alíquotas-teste 2026 | CBS 0,90% e IBS 0,10%, vigência `[2026-01-01, 2027-01-01)` (LC 214/2025, arts. 332 e 333) |
| Split payment | Sinalizado como `warning` nas decisões dentro da vigência |
| Convivência com PIS/COFINS/ICMS | Regras com vigências disjuntas: na data da operação (`asOfDate`), vale o regime vigente |
| Regulamentação futura | Novas regras entram pelo fluxo normal de curadoria ([ADR-012](/docs/adr/ADR-012-monitoracao-legislativa-por-ia.md)) |

Para ver a decisão em 2026, basta uma simulação com data dentro da vigência:

```json
{ "asOfDate": "2026-06-01", "items": [ /* … */ ] }
```

A resposta traz CBS e IBS como TaxItems próprios, com fundamento legal e a regra aplicada (`CBS-TESTE-2026-090@v1`).

## Por que "alíquota-teste" e não "alíquota"

As alíquotas de 2026 são de teste, por força da própria LC 214/2025, e podem ser ajustadas na regulamentação. O motor aplica o que está em vigor e marca a natureza de teste no nome e no fundamento da regra. Quando a norma definitiva sair, entra como nova versão de regra com vigência futura, e as decisões históricas permanecem íntegras (append-only).

## O que não mudou no motor

A reforma é um tributo novo, não uma arquitetura nova: CBS e IBS são efeitos `applyRate` com vigência, como ICMS e PIS sempre foram. Seus cálculos de hoje são reprodutíveis amanhã pelo `rulesetHash`, mesmo depois de a régua tributária mudar.
