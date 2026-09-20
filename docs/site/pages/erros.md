# Erros & status

Erros seguem um formato único, sempre com `error` (código estável para programar contra) e `message` (humano, pt-BR):

```json
{ "error": "PAYLOAD_VALIDATION", "message": "items[0].unitPrice.amount deve ser inteiro em centavos", "statusCode": 400 }
```

## HTTP

| Status | `error` típico | Quando |
|---|---|---|
| `400` | `PAYLOAD_VALIDATION` | Payload inválido (tipos, campos obrigatórios, centavos não inteiro…) |
| `400` | `WORKFLOW_POLICY` | Transição de regra inválida (ex.: IA tentando aprovar) |
| `401` | `UNAUTHORIZED` | API key ausente/inválida/inativa, fail-closed |
| `403` | `ADMIN_DISABLED` | Rota admin sem `TRIBUTAX_ADMIN_KEY` configurada |
| `404` | `NOT_FOUND` | Recurso inexistente (decisão, party, página de docs) |
| `429` | `RATE_LIMITED` | Quota do tenant excedida (`rpmQuota`) |
| `5xx` |, | Erro interno; nenhum cálculo é devolvido parcialmente |

## Boas práticas de tratamento

1. **Trate `429` com backoff**, a quota é por tenant, token bucket; esperar 1 minuto zera a janela. O [SDK](#/sdk) já faz isso por você.
2. **`401` após período bom** = key foi desativada pelo admin; não insista, alerte o operador.
3. **Erros de validação são deterministicamente reproduzíveis**, mesmo payload, mesmo erro; útil para testes automatizados.
4. **Idempotência**: reenviar com o mesmo `x-idempotency-key` após erro de rede é sempre seguro, ou cria, ou devolve a decisão original com `x-idempotent-replay: true`.
