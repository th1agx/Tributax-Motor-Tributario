# Payloads por cenário

Os modelos de requisição para os principais cenários brasileiros. Cada modelo pode ser **baixado como .json** ou **copiado** em um clique; ajuste os valores e envie para `POST /v1/tax-decisions` ou `/v1/tax-simulations`.

> Lembre: valores em **centavos** (`350000` = R$ 3.500,00). O emitente pode ser enviado inline (`context.issuer`) ou referenciar um cadastro em `/v1/parties` via `partyRef` (CNPJ), o cadastro enriquece o cálculo com regime fiscal e UF de origem.

---

## Varejo: venda interestadual a consumidor final

<div class="payload-card" data-file="venda-interestadual-nfe.json">
<div class="payload-head"><h3>venda-interestadual-nfe.json</h3><div class="meta">NFC-e/NF-e · DIFAL + FCP · CFOP 6102</div></div>
<pre><code>{
  "correlationId": "venda-2026-001",
  "context": {
    "recipient": { "role": "FINAL_CONSUMER", "address": { "state": "SP" } }
  },
  "operation": { "kind": "SALE_GOODS", "fiscalDocumentType": "NFE" },
  "items": [{
    "id": "1",
    "description": "Notebook 14 pol.",
    "quantity": 1,
    "unitPrice": { "amount": 350000 },
    "classification": { "ncm": "84713012", "origin": "DOMESTIC" }
  }],
  "options": { "detailLevel": "FULL_TRACE" }
}</code></pre>
</div>

## Venda interna de mercadoria (mesma UF)

<div class="payload-card" data-file="venda-interna-nfe.json">
<div class="payload-head"><h3>venda-interna-nfe.json</h3><div class="meta">ICMS interno · CFOP 5102 · CST 00</div></div>
<pre><code>{
  "correlationId": "venda-interna-001",
  "context": {
    "issuer": { "address": { "state": "SP" } },
    "recipient": { "role": "CONTRIBUTOR", "address": { "state": "SP" } }
  },
  "operation": { "kind": "SALE_GOODS", "fiscalDocumentType": "NFE" },
  "items": [{
    "description": "Cadeira de escritório",
    "quantity": 2,
    "unitPrice": { "amount": 85000 },
    "classification": { "ncm": "94013010" }
  }]
}</code></pre>
</div>

## MEI: NFS-e de serviço

<div class="payload-card" data-file="mei-nfse-servico.json">
<div class="payload-head"><h3>mei-nfse-servico.json</h3><div class="meta">ISS · LC 116 · dedução de materiais</div></div>
<pre><code>{
  "correlationId": "nfse-mei-001",
  "context": {
    "issuer": { "address": { "state": "RJ", "cityIbgeCode": "3304557" } },
    "recipient": { "role": "CONTRIBUTOR" }
  },
  "operation": { "kind": "SERVICE_PROVISION", "fiscalDocumentType": "NFSE" },
  "items": [{
    "description": "Manutenção de computador",
    "quantity": 1,
    "unitPrice": { "amount": 120000 },
    "classification": { "serviceCode": "1.05" },
    "issDeductionCents": 30000
  }]
}</code></pre>
</div>

## Prestação de serviço PJ→PJ com retenções

<div class="payload-card" data-file="servico-pj-pj-retencoes.json">
<div class="payload-head"><h3>servico-pj-pj-retencoes.json</h3><div class="meta">IRRF/CSLL/PIS/COFINS retidos · ISS</div></div>
<pre><code>{
  "correlationId": "servico-retencoes-001",
  "context": {
    "issuer": { "address": { "state": "SP", "cityIbgeCode": "3550308" } },
    "recipient": { "role": "CONTRIBUTOR", "address": { "state": "MG" } }
  },
  "operation": { "kind": "SERVICE_PROVISION", "fiscalDocumentType": "NFSE" },
  "items": [{
    "description": "Consultoria de TI",
    "quantity": 1,
    "unitPrice": { "amount": 1000000 },
    "classification": { "serviceCode": "1.01" }
  }]
}</code></pre>
</div>

## Simples Nacional: DAS com RBT12

<div class="payload-card" data-file="simples-das-rbt12.json">
<div class="payload-head"><h3>simples-das-rbt12.json</h3><div class="meta">Anexo I (mercadorias) e III (serviços) · alíquota efetiva</div></div>
<pre><code>{
  "correlationId": "simples-001",
  "context": {
    "issuer": { "taxRegime": "SIMPLES_NACIONAL", "address": { "state": "PR" } },
    "rbt12Cents": 180000000,
    "recipient": { "role": "FINAL_CONSUMER", "address": { "state": "PR" } }
  },
  "operation": { "kind": "SALE_GOODS", "fiscalDocumentType": "NFCE" },
  "items": [{
    "description": "Produto de revenda",
    "quantity": 1,
    "unitPrice": { "amount": 25000 }
  }]
}</code></pre>
</div>

## Exportação de mercadoria

<div class="payload-card" data-file="exportacao-mercadoria.json">
<div class="payload-head"><h3>exportacao-mercadoria.json</h3><div class="meta">Imunidade IPI · não tributado · CFOP 7102</div></div>
<pre><code>{
  "correlationId": "export-001",
  "context": {
    "issuer": { "address": { "state": "SC" } },
    "recipient": { "role": "NON_CONTRIBUTOR", "address": { "country": "US" } }
  },
  "operation": { "kind": "EXPORT", "fiscalDocumentType": "NFE" },
  "items": [{
    "description": "Máquina industrial",
    "quantity": 1,
    "unitPrice": { "amount": 5000000 },
    "classification": { "ncm": "84798999", "origin": "DOMESTIC" }
  }]
}</code></pre>
</div>

## Venda com substituição tributária (ICMS-ST)

<div class="payload-card" data-file="icms-st-mva.json">
<div class="payload-head"><h3>icms-st-mva.json</h3><div class="meta">CST 10 · MVA por UF · vICMSST líquido</div></div>
<pre><code>{
  "correlationId": "st-001",
  "context": {
    "issuer": { "address": { "state": "MG" } },
    "recipient": { "role": "CONTRIBUTOR", "address": { "state": "MG" } }
  },
  "operation": { "kind": "SALE_GOODS", "fiscalDocumentType": "NFE" },
  "items": [{
    "description": "Televisor LED 50",
    "quantity": 1,
    "unitPrice": { "amount": 250000 },
    "classification": { "ncm": "85287230", "cest": "28.044.002" }
  }]
}</code></pre>
</div>

## Operação com desconto incondicional

<div class="payload-card" data-file="venda-desconto.json">
<div class="payload-head"><h3>venda-desconto.json</h3><div class="meta">Base reduzida pelo desconto</div></div>
<pre><code>{
  "correlationId": "desconto-001",
  "context": {
    "recipient": { "role": "FINAL_CONSUMER", "address": { "state": "BA" } }
  },
  "operation": { "kind": "SALE_GOODS", "fiscalDocumentType": "NFCE" },
  "items": [{
    "description": "Tênis esportivo",
    "quantity": 1,
    "unitPrice": { "amount": 40000 },
    "discounts": [{ "amount": 5000, "kind": "UNCONDITIONAL" }],
    "classification": { "ncm": "64041100" }
  }]
}</code></pre>
</div>

---

## Quer um cenário que não está aqui?

A [referência de payload](/docs/contracts/payload-spec.md) traz o contrato completo com os 4 tiers (`MINIMAL COMPLETE`). Todos os modelos acima aceitam `asOfDate` (cálculo retroativo), `x-idempotency-key` (reenvio seguro) e `options.detailLevel: "FULL_TRACE"` (trace completo na resposta).
