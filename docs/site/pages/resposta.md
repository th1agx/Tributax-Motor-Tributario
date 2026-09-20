# Entendendo a resposta

Toda decisão traz o resultado **e a explicação**. Campos-chave:

```json
{
  "decisionId": "86be74da-…",
  "correlationId": "demo-1",
  "engineVersion": "0.1.0-phase0",
  "rulesetHash": "63a7b89e",
  "asOfDate": "2026-09-19",
  "derivedTier": "ADVANCED",
  "fiscalDocumentType": "NFCE",
  "operationKind": "SALE_GOODS",
  "cfop": { "code": "6102", "basis": "venda a consumidor final, operação interestadual" },
  "items": [{ "itemId": "*", "taxes": [ /* TaxItem… */ ] }],
  "totals": [{ "tax": "ICMS", "amountCents": 42000 }],
  "inferences": [ /* o que o motor inferiu e por quê */ ],
  "warnings": [],
  "errors": []
}
```

## Cabeçalho da decisão

| Campo | Significado |
|---|---|
| `rulesetHash` | Hash do snapshot de regras usado, **reprodutibilidade**: mesma hash, mesmo resultado, hoje ou em auditoria futura. |
| `asOfDate` | Data de referência do cálculo (envie `asOfDate` no request para retroativo). |
| `derivedTier` | Qualidade do payload recebido: `MINIMAL INTERMEDIATE ADVANCED COMPLETE`. Quanto maior, menos inferência e mais precisão. |
| `cfop` | Código fiscal inferido da operação, com a justificativa (`basis`) e `review` quando há ambiguidade normativa. |

## Cada TaxItem

| Campo | Significado |
|---|---|
| `tax` / `outcome` | Tributo e resultado: `TAXED`, `EXEMPT`, `IMMUNE`, `NON_TAXABLE`, `ZERO_RATED`, `SUSPENDED`, `DEFERRED`, `RETAINED`, `NO_RULE_FOUND`. |
| `basisCents` / `rateBp` / `amountCents` | Base de cálculo, alíquota (basis points) e valor, em centavos. |
| `fiscalCode` | CST/CSOSN do tributo nesta operação (ex.: ICMS `CST 00`, Simples `CSOSN 102`, ST `CST 10`). |
| `legalBases` | Fundamentos legais citados (ex.: `"LC 190/2022, art. 3º"`). |
| `appliedRules` | Regras do catálogo que produziram o efeito, com versão (`DIFAL-SP-GENERAL@v1`). |
| `hints` | Quando `NO_RULE_FOUND`: diagnóstico do que faltou para a regra casar. |

>**`NO_RULE_FOUND` nunca é imposto zero.** Se o motor não tem regra, ele diz isso, e os hints apontam o caminho. Suposição silenciosa não existe no Tributax.

## Inferências

Cada campo que você não enviou e o motor deduziu aparece em `inferences` com a evidência:

```json
{ "field": "context.recipient.role", "value": "FINAL_CONSUMER",
  "evidence": "destinatário sem identificação consumidor final" }
```

Nada é decidido às escondidas: ou você informou, ou o motor inferiu **e documentou**.

## Trace completo

Com `options.detailLevel: "FULL_TRACE"`, a resposta inclui o rastro de resolução: regras candidatas, por que cada uma aplicou ou foi descartada (especificidade vence conflitos, [ADR-005](/docs/adr/ADR-005-resolucao-de-conflitos.md)), material de auditoria por excelência.
