# Documentos fiscais: NF-e, NFC-e e NFS-e

O Tributax é o motor de decisão: dado o documento que você vai emitir, ele devolve tributos, CFOP, CST/CSOSN, bases e fundamentos. A emissão em si fica no seu ERP ou no emissor que você já usa.

## NF-e (Nota Fiscal de Produto Eletrônica)

Operações de venda de mercadorias entre empresas e para consumidores.

| O motor devolve | Como chegar |
|---|---|
| CFOP (5102, 6102, 5405…) | inferido de `operation.kind`, UFs e papel do destinatário; também aceito como `context.cfop` |
| CST do ICMS (00, 10, 40, 41…) e CSOSN (102, 500…) | em cada TaxItem de ICMS/DAS, campo `fiscalCode` |
| CST de PIS/COFINS (01, 04, 07…) | nos TaxItem correspondentes |
| ICMS, DIFAL, FCP, ICMS-ST (MVA), IPI por NCM, PIS/COFINS | envie `classification.ncm` e UFs |

```json
{ "operation": { "kind": "SALE_GOODS", "fiscalDocumentType": "NFE" } }
```

## NFC-e (Nota Fiscal de Consumidor Eletrônica)

Venda no varejo a consumidor final. O motor deduz o documento por padrão quando `kind` é venda e o destinatário não é identificado (`role` inferido como `FINAL_CONSUMER`) e sinaliza nas `inferences`. Para forçar:

```json
{ "operation": { "kind": "SALE_GOODS", "fiscalDocumentType": "NFCE" } }
```

Em venda interestadual a consumidor final, a resposta inclui DIFAL e FCP com partilha da LC 190/2022.

## NFS-e (Nota Fiscal de Serviço Eletrônica)

Prestação de serviços municipal (LC 116/03).

| O motor devolve | Observação |
|---|---|
| ISS com alíquota por município do prestador | `context.issuer.address.cityIbgeCode` + `classification.serviceCode` |
| Dedução de materiais da base | item com `issDeductionCents` |
| Retenções federais PJ→PJ (IRRF, CSLL, PIS, COFINS) | sinalizadas com aviso de responsabilidade de retenção |
| Não incidência na exportação de serviço | LC 116/03, art. 2º, I |

Modelos prontos: [payloads por cenário](#/payloads) inclui NFS-e de MEI com dedução e serviço PJ→PJ com retenções.

## DAS do Simples Nacional

Para optantes, o documento pode ser único, mas a decisão continua: Anexo I para revenda/mercadorias, Anexo III para serviços, alíquota **efetiva** por RBT12 (`rbt12Cents`), e MEI fora do cálculo (DAS-MEI é fixo mensal, sem decisão a tomar).

## Reforma Tributária (CBS/IBS)?

As alíquotas-teste de 2026 da LC 214/2025 entram nas decisões com vigência explícita e split payment sinalizado. Página própria: [Reforma Tributária](#/reforma-tributaria).
