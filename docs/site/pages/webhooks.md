# Webhooks & idempotência

Integração de produção: eventos que avisam seu sistema, e reenvios que nunca duplicam.

## Webhooks

Registre URLs que recebem eventos (admin, `x-admin-key`):

```bash
curl -X POST {BASE_URL}/v1/webhooks \
  -H "x-admin-key: $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{ "url": "https://seu-erp.com/hooks/tributax", "events": ["decision.created", "rule.proposal.created"] }'
```

| Evento | Dispara quando |
|---|---|
| `decision.created` | Uma decisão foi calculada e persistida |
| `rule.proposal.created` | O agente legislativo propôs um DRAFT (`AI_SUGGESTED`) para revisão humana |

### Assinatura HMAC

Todo delivery assinado com `TRIBUTAX_WEBHOOK_SECRET` no header, **verifique antes de confiar**:

```
x-tributax-signature: sha256=<hmac_sha256(corpoBruto, SECRET)>
```

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(rawBody: string, header: string, secret: string): boolean {
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  return header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}
```

Delivery: POST com timeout de 5s, `Promise.allSettled` (um destino lento não atrasa os outros). Trate como *at-least-once*: seu handler deve ser idempotente.

## Idempotência nas decisões

Envie `x-idempotency-key` (ex.: o id do pedido no seu ERP):

- **Primeira chamada**: calcula, persiste e devolve `201`.
- **Reenvio com a mesma key**: devolve a **mesma decisão** (sem recalcular nem duplicar), com header `x-idempotent-replay: true`.

É o padrão seguro para: retry de rede, filas que reentregam, checkout que reenvia. O [SDK](#/sdk) expõe como `idempotencyKey` nas options.
