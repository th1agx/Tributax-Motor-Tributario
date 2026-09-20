# SDK TypeScript

O pacote oficial `@tributax/sdk` encapsula a REST: retry com backoff, erros tipados, idempotência e tipos espelhando o OpenAPI.

```bash
npm install @tributax/sdk
```

```ts
import { TributaxClient, TributaxApiError } from "@tributax/sdk";

const tx = new TributaxClient({
  baseUrl: "https://tributax-api.onrender.com",
  apiKey: process.env.TRIBUTAX_API_KEY!,
});

// decisão persistida, reenvio seguro
const decision = await tx.decide(
  {
    correlationId: "pedido-4711",
    context: { recipient: { address: { state: "SP" } } },
    items: [{ description: "Notebook", unitPrice: { amount: 350000 },
              classification: { ncm: "84713012" } }],
  },
  { idempotencyKey: "pedido-4711" }, // header x-idempotency-key
);

for (const t of decision.items[0]!.taxes) {
  console.log(t.tax, t.outcome, t.amountCents);
}

// simulação stateless (orçamento/preview)
const quote = await tx.simulate({ correlationId: "cart-preview", items: [/* … */] });
```

## O que vem pronto

| Recurso | Comportamento |
|---|---|
|**Retry**| `429`/`5xx` com backoff exponencial + jitter (padrão 3 tentativas) |
|**Erros tipados**| `TributaxApiError` com `code` (`PAYLOAD_VALIDATION`, `RATE_LIMITED`, …) e `statusCode` |
|**Idempotência**| Opção `idempotencyKey` gera e reusa o header; replay é transparente |
|**Timeout**| Configurável (`timeoutMs`), falha rápida com AbortController |
|**Tipos**| Request/response 1:1 com o OpenAPI, autocomplete total |

## Tratamento de erro idiomático

```ts
try {
  const d = await tx.decide(payload);
} catch (e) {
  if (e instanceof TributaxApiError && e.code === "RATE_LIMITED") {
    // backoff e tenta de novo
  } else throw e;
}
```
