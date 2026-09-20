# Início rápido

Sua primeira decisão tributária em menos de 5 minutos.

## 1. Obtenha sua API key

Cada empresa cliente é um **tenant** com chave e quota próprias. A key é criada pelo administrador da instância:

```bash
curl -X POST {BASE_URL}/v1/tenants \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $TRIBUTAX_ADMIN_KEY" \
  -d '{"name": "minha-empresa", "rpmQuota": 60}'
```

A resposta **exibe a API key uma única vez** (o banco guarda apenas o hash sha256):

```json
{ "tenant": { "id": "…", "name": "minha-empresa", "rpmQuota": 60 },
  "apiKey": "cole-isto" }
```

> Na instância de demonstração (`tributax-api.onrender.com`) as keys são criadas pelo administrador. Self-hosting? O [guia de deploy](#/deploy) mostra tudo.

## 2. Faça sua primeira chamada

```bash
curl -s -X POST {BASE_URL}/v1/tax-simulations \
  -H "Content-Type: application/json" \
  -H "x-api-key: $SUA_API_KEY" \
  -d '{
    "correlationId": "primeira-venda",
    "context": { "recipient": { "address": { "state": "SP" } } },
    "items": [{
      "description": "Notebook",
      "unitPrice": { "amount": 350000 },
      "classification": { "ncm": "84713012" }
    }]
  }'
```

Ou teste sem escrever nada: [abrir o simulador →](#/simulador)

## 3. Conceitos em 30 segundos

- **Valores monetários** são inteiros em **centavos** (`350000` = R$ 3.500,00). Sem arredondamento flutuante, jamais.
- **Percentuais** são inteiros em **basis points** (`1200` = 12%).
- **Payload mínimo**: só `correlationId` + `items`. O motor infere o resto (tipo de operação, papel do destinatário…) e registra **cada inferência na resposta**.
- **`decisions` vs `simulations`**: mesmo cálculo; `POST /v1/tax-decisions` persiste a decisão (com trace e `rulesetHash`), `POST /v1/tax-simulations` é stateless.
- **Quanto mais contexto, mais preciso**: enviar NCM, UF, regime do emitente, RBT12 etc. eleva o tier do payload (`MINIMAL → INTERMEDIATE → ADVANCED → COMPLETE`).

## 4. Próximos passos

- [Payloads prontos por cenário](#/payloads) — copie ou baixe o JSON do seu caso
- [Referência de endpoints](#/api)
- [SDK TypeScript](#/sdk) — retry, erros tipados, idempotência
- [Webhooks & idempotência](#/webhooks) — integração robusta de produção
