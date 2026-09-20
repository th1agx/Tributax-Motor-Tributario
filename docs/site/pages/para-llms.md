# Documentação para LLMs 🤖

Esta documentação existe em **duas versões** — humana (este site) e para agentes de IA. Mesma fonte de verdade.

## Arquivos para agentes

| URL | O que é |
|---|---|
| [`/llms.txt`](/llms.txt) | Índice orientado com quickstart e descrição de cada página — **comece por aqui** |
| [`/llms-full.txt`](/llms-full.txt) | Todo o conteúdo das docs em um único texto (~51 KB) |
| [`/docs/index.md`](/docs/index.md) | Visão geral em Markdown puro (convenção append `/index.md`) |
| [`/openapi.yaml`](/openapi.yaml) | Contrato OpenAPI 3.1 — para ferramentas e geração de código |
| [`/docs/contracts/payload-spec.md`](/docs/contracts/payload-spec.md) | Especificação do payload com os 4 tiers |

Qualquer página `.md` também é servida crua (ex.: `/docs/adr/ADR-004-regras-como-dados.md`), e endpoints Markdown honram `Accept: text/markdown`.

## Padrões que ajudam o agente

1. **Valores em centavos, percentuais em basis points** — declarado no cabeçalho do llms.txt para evitar erro clássico de interpretação.
2. **Erros com código estável** (`error`) — tratável programaticamente sem parsear mensagem.
3. **`NO_RULE_FOUND` significa "sem regra"**, nunca "isento" — o agente deve propagar a incerteza, não assumir zero.
4. **OpenAPI com exemplos por cenário** — MEI, DIFAL, retenções.

## Prompt de exemplo

```
Você é assistente fiscal e usa a API Tributax.
1. Leia https://…/llms.txt para orientação.
2. Use a ferramenta MCP tributax_simulate_taxes (ou POST /v1/tax-simulations com x-api-key).
3. Nunca invente alíquotas: se a resposta traz NO_RULE_FOUND, diga isso ao usuário
   e mostre os hints.
```

## Servidor MCP

Para Claude/Cursor/orquestradores, prefira o servidor MCP (`@tributax/mcp`) — [detalhes na página de Agentes & MCP](#/mcp).
