# Agentes & MCP

O Tributax foi construído para ser consumido por **humanos e por IAs**. Três caminhos:

## 1. Documentação llms.txt (padrão llmstxt.org)

A própria API serve documentação no formato que agentes entendem, aponte seu LLM/agent para:

| URL | Conteúdo |
|---|---|
| `/llms.txt` | Índice orientado: quickstart, guias, ADRs, com descrição de cada página |
| `/llms-full.txt` | Todo o conteúdo concatenado (~51 KB) para contexto único |
| `/docs/index.md` | Visão geral em Markdown puro (convenção append `/index.md`) |
| `/openapi.yaml` | Contrato OpenAPI 3.1 |

Qualquer página `.md` responde em Markdown puro; `Accept: text/markdown` também negocia o formato.

## 2. Servidor MCP

`@tributax/mcp` expõe o motor como ferramenta MCP (stdio) para Claude, Cursor e orquestradores, **proxy puro da REST** ([ADR-014](/docs/adr/ADR-014-servidor-mcp.md)): nenhuma regra duplicada no cliente.

```jsonc
// config do seu agente (.mcp.json, claude_desktop_config.json…)
{
  "mcpServers": {
    "tributax": {
      "command": "node",
      "args": ["/caminho/para/Tributax-Motor-Tributario/packages/mcp/dist/server.js"],
      "env": {
        "TRIBUTAX_API_URL": "https://tributax-api.onrender.com",
        "TRIBUTAX_API_KEY": "sua-api-key"
      }
    }
  }
}
```

Ferramentas expostas:

| Ferramenta | Faz |
|---|---|
| `tributax_simulate_taxes` | Simulação stateless de uma operação |
| `tributax_decide_taxes` | Decisão persistida (com `x-idempotency-key`) |
| `tributax_list_rules` | Catálogo de regras com vigência e fundamentos |

Validação Zod na fronteira: argumentos errados falham com mensagem clara antes de gastar chamada de API.

## 3. REST direta

Agente com acesso HTTP? A REST é autoexplicativa: `/llms.txt` primeiro, `/v1/tax-simulations` depois. Erros vêm com código estável (`error`) e mensagem em português.
