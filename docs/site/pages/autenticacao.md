# Autenticação & chaves

## Como autenticar

Envie a API key do seu tenant em **qualquer um** dos formatos:

```bash
# header dedicado (recomendado)
curl -H "x-api-key: $KEY" {BASE_URL}/v1/tax-simulations …

# ou Authorization Bearer
curl -H "Authorization: Bearer $KEY" …
```

Sem key ou key inválida → `401 UNAUTHORIZED`. Autenticação é **fail-closed**: em produção nada responde sem chave (exceto documentação).

## Dois níveis de chave

| Chave | Header | O que acessa |
|---|---|---|
| **API key de tenant** | `x-api-key` / `Bearer` | Cálculos, simulações, parties — as rotas `/v1/tax-*` e `/v1/parties` |
| **Admin key** | `x-admin-key` | Administração: `/v1/tenants`, `/v1/webhooks` |

Uma API key de cliente **jamais** administra outros clientes — são guards separados por design ([ADR-009](/docs/adr/ADR-009-multi-tenancy.md)).

## Rate limit por tenant

Cada tenant tem quota própria (`rpmQuota`, requests por minuto, token bucket). Ao estourar:

```
HTTP 429 Too Many Requests
{ "error": "RATE_LIMITED", "message": "quota excedida (60 rpm)" }
```

Aumente a quota via admin:

```bash
curl -X PATCH {BASE_URL}/v1/tenants/$TENANT_ID \
  -H "x-admin-key: $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"rpmQuota": 300}'
```

## Gestão de tenants (admin)

```bash
# listar
curl -H "x-admin-key: $ADMIN_KEY" {BASE_URL}/v1/tenants

# desativar um tenant (keys param de funcionar imediatamente)
curl -X PATCH {BASE_URL}/v1/tenants/$TENANT_ID \
  -H "x-admin-key: $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"active": false}'
```

A key é exibida **uma única vez** na criação; o banco guarda só o hash sha256. Perdeu a key? Crie um novo tenant ou roteie um novo par key/tenant — por design não há recuperação.
