#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TributaxApi } from "./client.js";
import { createTools } from "./tools.js";

/**
 * Servidor MCP do Tributax (stdio) — para clientes Claude/Cursor/agentes:
 *
 *   {
 *     "mcpServers": {
 *       "tributax": {
 *         "command": "node",
 *         "args": ["caminho/para/tributax/dist/server.js"],
 *         "env": { "TRIBUTAX_API_URL": "https://api.tributax.exemplo", "TRIBUTAX_API_KEY": "..." }
 *       }
 *     }
 *   }
 *
 * O servidor é um adapter de protocolo puro: sem regras, sem banco —
 * tudo passa pela API REST, que permanece a única fronteira auditável.
 */

async function main(): Promise<void> {
  const api = new TributaxApi();
  const server = new McpServer({ name: "tributax", version: "0.1.0" });

  for (const tool of createTools(api)) {
    const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;
    server.tool(tool.name, tool.description, schema.shape, async (input) => ({
      content: [{ type: "text" as const, text: await tool.handle(input) }],
    }));
  }

  await server.connect(new StdioServerTransport());
}

main().catch((err: unknown) => {
  console.error(`[tributax-mcp] falhou: ${(err as Error).message}`);
  process.exit(1);
});
