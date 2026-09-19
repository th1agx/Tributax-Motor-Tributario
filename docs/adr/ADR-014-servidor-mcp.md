# ADR-014 — Servidor MCP para agentes clientes

- Status: ACEITO
- Data: 2026-09-19

## Contexto

Empresas clientes já operam agentes de IA (Claude, Cursor, orquestradores
próprios). Expor o Tributax como servidor MCP (Model Context Protocol) permite
que esses agentes calculem tributos e consultem o catálogo como ferramenta
nativa — sem a empresa escrever integração REST.

## Decisão

Novo pacote `packages/mcp` (`@tributax/mcp`), servidor **stdio** com três
ferramentas de prefixo consistente `tributax_`:

- `tributax_simulate_taxes` — simulação sem persistência (segura para agentes);
- `tributax_decide_taxes` — decisão persistida com trace (operação real);
- `tributax_list_rules` — catálogo vigente, para explicabilidade.

**O servidor MCP é um adapter de protocolo puro.** Não contém regra, não
acessa banco, não conhece o domínio: toda chamada passa pela API REST pública
(`TRIBUTAX_API_URL` + `TRIBUTAX_API_KEY` via env). Motivos:

1. **Auditabilidade** — a fronteira do ADR-007 (decisões append-only via API)
   permanece única; não existe caminho de cálculo paralelo.
2. **Contrato único** — REST e MCP nunca divergem porque MCP é apenas proxy;
   mudanças de contrato acontecem num lugar só.
3. **Permissão** — agente sem `TRIBUTAX_API_KEY` não configured consegue
   persistir decisões; a simulação é o piso gratuito.

Validação de entrada acontece na fronteira do MCP (Zod, mesmos formatos do
payload-spec: centavos inteiros, basis points, asOf YYYY-MM-DD) — erro de
contrato morre antes de virar chamada HTTP.

## Alternativas consideradas

1. MCP com lógica embutida (chamar o domínio direto) — rejeitado: criaria uma
   segunda fronteira de cálculo sem auditabilidade de decisão.
2. MCP remoto (HTTP/SSE) — adiado: stdio é o modo universalmente suportado
   hoje por clientes; transporte remoto é evolução do adapter quando houver
   demanda multi-empresa hospedada.

## Consequências

- (+) Distribuição trivial para clientes: um bloco `mcpServers` no config do
  agente aponta para `dist/server.js`.
- (+) Testável sem SDK: handlers são funções puras sobre um `TributaxApi`
  injetável (fetch fake nos testes).
- (-) Necessidade de API keys na API REST (hoje inexistente) antes de expor
  `decide` em produção — já era prioridade (ADR-009 multi-tenancy).
