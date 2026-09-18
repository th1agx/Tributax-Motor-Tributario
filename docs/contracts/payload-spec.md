# Especificação do Contrato de Payload — Tax Decision Engine

> Status: PROPOSTA (aguardando aprovação)
> Versão do documento: 0.1
> Data: 2026-09-18
> Fonte de verdade futura: OpenAPI gerado a partir desta especificação

---

## 1. Visão geral

Uma única operação de cálculo: `POST /v1/tax-decisions` (cálculo com persistência de
trace) ou `POST /v1/tax-simulations` (cálculo sem persistência de obrigação).

O contrato possui **duas dimensões ortogonais**:

1. **Tier de completude** — mínimo, intermediário, avançado, completo. Derivado do
   conteúdo enviado, nunca declarado.
2. **Tipo de documento fiscal** — NFS-e, NFC-e, NF-e (+ casos sem documento).

Regras globais:

- Valores monetários **sempre inteiros em centavos** (`amount: 200000` = R$ 2.000,00).
- Percentuais em basis points (inteiros; 1200 = 12%).
- Campos de conhecimento fiscal aceitam `"AUTO"` — ausência e `"AUTO"` são
  semanticamente idênticos, mas `AUTO` documenta intenção de delegar ao motor.
- Idempotência por `correlationId`.
- Perfil de emitente/destinatário é cadastrado em endpoints próprios (`/v1/parties`)
  e referenciado por id ou taxId — não viaja no payload de cálculo.
- A resposta é **idêntica para todos os tiers**: estrutura completa com tributos,
  fundamentos legais, inferências, regras aplicadas/descartadas, trace, warnings.

---

## 2. Estrutura raiz do request

```jsonc
{
  "correlationId": "string (uuid, obrigatório para idempotência)",
  "asOfDate": "date (default: data corrente; permite cálculo retroativo/retroativo)",
  "context": { ... },        // seção 3
  "operation": { ... },      // seção 4
  "items": [ ... ],          // seção 5
  "overrides": { ... },      // seção 6 — tier completo
  "options": { ... }         // seção 7
}
```

---

## 3. `context` — partes envolvidas

```jsonc
{
  "issuer": {
    "partyRef": "string — id do perfil OU taxId (CNPJ/CPF)",
    "establishmentRef": "string? — id do estabelecimento (default: matriz)"
  },
  "recipient": {
    "partyRef": "string? — id OU taxId OU bloco inline",
    "role": "CONTRIBUTOR | NON_CONTRIBUTOR | FINAL_CONSUMER | AUTO (default AUTO)",
    "address": {
      "country": "BR (default)",
      "state": "UF (obrigatório p/ BR)",
      "city": "IBGE code ou nome",
      "cityIbgeCode": "string?"
    }
  }
}
```

Notas:

- `recipient` é **ignorado/rejeitado** em NFC-e (ver matriz §8).
- `role: AUTO` para destinatário identificado por CNPJ/CPF consultável é resolvido
  pelo motor e registrado em `inferences[]`.
- Para NFS-e, o destinatário é o **tomador** do serviço.

---

## 4. `operation` — natureza da operação

```jsonc
{
  "kind": "SALE_GOODS | SERVICE_PROVISION | TRANSFER | BONUS | RENTAL |
           IMPORT | EXPORT | CONSUMPTION_ASSET | AUTO (default AUTO)",
  "fiscalDocumentType": "NFE | NFCE | NFSE | NONE | AUTO (default AUTO)",
  "modality": "IN_PERSON | DELIVERY | SHIPPING | ELECTRONIC? (default por tipo)",
  "payment": { "method": "CASH|CARD|CREDIT|OTHER?", "term": "SPOT|INSTALLMENTS"? }
}
```

Resolução de `AUTO` (registrada como inferência no trace):

| Evidência disponível | Inferência |
|---|---|
| `serviceCode` presente | `SERVICE_PROVISION` + `NFSE` |
| itens com NCM + `role=FINAL_CONSUMER` + presencial | `SALE_GOODS` + `NFCE` |
| itens com NCM + `role=CONTRIBUTOR` | `SALE_GOODS` + `NFE` |
| destinatário = próprio emitente (mesmo CNPJ raiz) | `TRANSFER` |
| ambiguidade não resolvível | erro de entrada `UNCLASSIFIABLE_OPERATION` com diagnóstico |

---

## 5. `items` — itens da operação

```jsonc
[{
  "id": "string|number — referência do chamador",
  "description": "string",
  "quantity": "number > 0",
  "unit": "UN | KG | L ... (default UN)",
  "unitPrice": { "amount": "int centavos", "currency": "BRL (default)" },
  "classification": {                    // tudo opcional no tier mínimo
    "ncm": "string (8) ?",
    "cest": "string ?",
    "serviceCode": "string — LC 116/03 ?",
    "origin": "DOMESTIC | IMPORTED | FOREIGN_SIMILAR | AUTO"
  },
  "discounts": [{ "amount": "int", "kind": "UNCONDITIONAL | CONDITIONAL" }],
  "freight": "int centavos ?",           // por item ou total (ver §6)
  "insurance": "int ?",
  "otherCharges": "int ?",
  "importation": {                       // apenas IMPORT — tier completo
    "customsValue": "int ?", "siscomexRate": "int ?",
    "ii": { "amount": "int ?", "rateBp": "int ?" },
    "iof": "int ?"
  }
}]
```

Regras:

- Pelo menos 1 item. Itens heterogêneos (mercadoria + serviço) são permitidos
  apenas em documentos que os comportam (NF-e admite serviço como item não-
  tributável por ICMS em certas hipóteses — o motor valida e explica).
- Desconto incondicional reduz base por padrão; condicional não reduz (e gera
  warning de revisão).
- `classification` ausente integralmente → o motor infere e registra; se não
  conseguir inferir com segurança → `NO_RULE_FOUND` por item, nunca imposto zero.

---

## 6. `overrides` — tier completo

```jsonc
{
  "allowedRegimes": ["NORMAL" | "SIMPLES_NACIONAL" | "LUCRO_PRESUMIDO" | ...],
  "pinClassification": [{ "itemId": "...", "ncm": "...", "serviceCode": "..." }],
  "forbidBenefits": true?,
  "requireFullTrace": true?,
  "chargeAllocation": "PROPORTIONAL | SPECIFIED",  // frete/seguro/acessórias
  "roundingPolicy": "ROUND_HALF_UP | FLOOR | CENTRAL_ITEM_LAST"?
}
```

Semântica: override é **trava e sugestão validada**, nunca ordem cega.

- Classificação pinada que conflite com a legislação/NCM incompatível com o tipo
  de operação → erro `CLASSIFICATION_CONFLICT` com fundamento, não cálculo silencioso.
- `forbidBenefits` não suprime benefício de vigência obrigatória; o motor recusa
  com `OVERRIDE_VIOLATES_LAW` quando aplicável.

---

## 7. `options`

```jsonc
{
  "detailLevel": "SUMMARY | FULL_TRACE | EXPLANATION (default SUMMARY)",
  "explanationAudience": "DEVELOPER | ACCOUNTANT | END_USER (default END_USER)",
  "currency": "BRL (fixo na v1)",
  "locale": "pt-BR (fixo na v1)"
}
```

---

## 8. Matriz documento × campos (validação de entrada)

| Campo | NFS-e | NFC-e | NF-e | NONE (só cálculo) |
|---|---|---|---|---|
| `items[].ncm` | rejeitado | opcional/inferido | exigido (mín. avançado p/ tributação correta) | opcional |
| `items[].serviceCode` | **exigido** | rejeitado | rejeitado (fora item-serviço específico) | opcional |
| `recipient.role=CONTRIBUTOR` | permitido | **rejeitado** | permitido | permitido |
| `recipient` completo | exigido (tomador) | opcional (identificação) | exigido | exigido |
| DIFAL | n/a | n/a (sempre interna) | aplicável | aplicável |
| IPI | n/a | n/a | aplicável | aplicável |
| ISS + retenções | aplicável | n/a | n/a | aplicável |
| `operation.modality=IN_PERSON` | n/a | default | opcional | opcional |
| `importation` | n/a | n/a | permitido | permitido |

A matriz é **dado de configuração** versionado no contexto `Taxonomy` — validações
de entrada consultam a matriz, sem `if`s espalhados (ver §11).

---

## 9. Tiers — derivação

O tier é **calculado pelo motor** a partir do payload e reportado no resultado:

| Tier | Critério de derivação |
|---|---|
| **MÍNIMO** | `context` com `partyRef` + itens com apenas descrição/valor; sem `classification`, sem `operation.kind` explícito |
| **INTERMEDIÁRIO** | + endereço do destinatário, + `serviceCode` ou `ncm`, + `recipient.role` explícito |
| **AVANÇADO** | + origem da mercadoria, descontos tipados, frete/seguro, `kind` explícito |
| **COMPLETO** | + `overrides`, importação, múltiplos itens heterogêneos, `asOfDate` retroativo, `options` detalhadas |

Cada campo inferido no caminho MÍNIMO→INTERMEDIÁRIO gera registro em `inferences[]`
do resultado (o que foi inferido, a partir de qual evidência, com qual confiança).

---

## 10. Response (resumo)

Estrutura única para todos os tiers (detalhe conforme `options.detailLevel`):

```jsonc
{
  "decisionId": "string",
  "correlationId": "string (eco)",
  "engineVersion": "semver",
  "rulesetHash": "hash do snapshot de regras vigentes em asOfDate",
  "asOfDate": "date",
  "derivedTier": "MINIMAL | INTERMEDIATE | ADVANCED | COMPLETE",
  "fiscalDocumentType": "resolvido",
  "operationKind": "resolvido",
  "items": [{
    "itemId": "...",
    "classifications": { "ncm": "...", "serviceCode": "...", "origin": "..." },
    "taxes": [{
      "tax": "ICMS | ICMS_ST | DIFAL | FCP | IPI | PIS | COFINS | ISS | IRRF | INSS | CSRF | IBS | CBS",
      "outcome": "TAXED | EXEMPT | IMMUNE | NON_TAXABLE | ZERO_RATED | SUSPENDED | DEFERRED | RETAINED | NO_RULE_FOUND",
      "basis": "int centavos", "rateBp": "int",
      "amount": "int centavos",
      "split": [{ "jurisdiction": "MG", "amount": 0 }]?  // DIFAL/FCP, CBS/IBS
      "legalBases": ["referência estruturada"],
      "appliedRules": ["ruleId@versão"],
      "rejectedRules": [{ "ruleId": "...", "reason": "..." }]
    }]
  }],
  "totals": [{ "tax": "...", "amount": "int" }],
  "inferences": [{ "field": "...", "value": "...", "evidence": "...", "confidence": "..." }],
  "warnings": [...],
  "errors": [...],
  "trace": "DecisionStep[] quando FULL_TRACE",
  "explanation": "texto quando EXPLANATION"
}
```

Estados semanticamente distintos (nunca "sem regra = zero"):
`NO_RULE_FOUND` é erro de cobertura com diagnóstico; `EXEMPT`, `IMMUNE`,
`NON_TAXABLE`, `ZERO_RATED`, `SUSPENDED`, `DEFERRED` exigem `legalBases`.

---

## 11. Implementação das validações

- Matriz §8 e regras de derivação §9 vivem como **dados versionados** no contexto
  `Taxonomy`, consumidos pela primeira fase do pipeline (Input Validation).
- Mudanças no contrato (campos, defaults, matriz) exigem bump de versão do
  **vocabulário de entrada**, registrado no `engineVersion`/`schemaVersion` do
  resultado para reprodutibilidade.

---

## 12. Pendências para fechar a v1 do contrato

1. Confirmar enumeração final de `operation.kind` (cases: amostra grátis, brinde,
   remessa p/ conserto, industrialização por encomenda — viram kinds próprios ou
   flags?).
2. Definir política de frete/seguro/acessórias padrão (§6 `chargeAllocation`).
3. Definir contrato de `/v1/parties` (perfil: regimes, CNAEs, endereços, contabilidade).
4. Confirmar se NFS-e inclui retenções federais na v1 do contrato ou fase seguinte.
5. Decidir tipos de documento fora do escopo inicial (CT-e, MDF-e) — apenas
   registrar que o schema os comporta via `fiscalDocumentType` extensível.
