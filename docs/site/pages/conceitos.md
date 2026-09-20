# O que o Tributax é (e o que não é)

Para integrar sem surpresa, vale saber exatamente onde começa e onde termina o motor.

## É

**Um motor de decisão tributária.** Recebe os dados da operação, devolve a carga tributária completa com códigos, bases, alíquotas, fundamentos legais e trace. É a camada que um ERP, um emissor ou um marketplace consulta para saber "quanto de imposto, com qual CFOP, qual CST e por quê" antes de emitir, faturar ou orçar.

Também é a camada de **consulta viva**: catálogo de regras versionado com vigências, fila de revisão com observações legislativas extraídas por IA, e atualização com aprovação humana.

## Não é

**Não emite nota fiscal.** A emissão de NF-e/NFC-e/NFS-e junto à SEFAZ ou à prefeitura, com transmissão, autorização, PDF/XML e contigência, é papel do emissor ou ERP integrado. O Tributax alimenta esses sistemas com a decisão; não substitui o protocolo com o fisco.

**Não pede certificado digital.** Sem emissão, não há assinatura digital com A1/A3. A autenticação da API é por API key do tenant (com hash no banco) e admin key para administração.

**Não é contabilidade.** O motor entrega a decisão da operação; apuração, escrituração e guias (DAS, DARF, GIA) pertencem ao sistema contábil, que pode consumir as decisões como insumo auditável.

**Não inventa regra.** Onde a norma é omissa ou as fontes divergem, a resposta marca `NEEDS_REVIEW` ou `NO_RULE_FOUND` com hints, e nunca assume imposto zero.

## Integração típica

```
Seu sistema (ERP/checkout/emissor)
  └─ POST /v1/tax-decisions (ou simulations)   → decisão completa com trace
       └─ emite com o documento e códigos que JÁ recebeu na resposta
```

Ou, se houver agente de IA no meio: servidor MCP ou REST direto, como na página [Agentes & MCP](#/mcp).
