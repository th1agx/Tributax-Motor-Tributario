import { z } from "zod";
import { TributaxApi } from "./client.js";

/**
 * Ferramentas MCP do Tributax (ADR-014): agentes de IA de empresas clientes
 * calculam tributos e consultam o catálogo SEM bypassar a API — mesmo
 * contrato, mesma auditabilidade. Ferramentas de escrita (decide/rules)
 * exigem TRIBUTAX_API_KEY: um agente sem credencial só simula.
 */

export interface TributaxTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<unknown>;
  handle(input: unknown): Promise<string>;
}

const moneySchema = z.object({ amount: z.number().int().positive() }).describe("valor em centavos (ex.: 100000 = R$ 1.000,00)");

const itemSchema = z.object({
  description: z.string(),
  unitPrice: moneySchema,
  quantity: z.number().int().positive().optional(),
});

const contextSchema = z.object({
  recipient: z
    .object({
      taxId: z.string().optional(),
      address: z.object({ state: z.string().length(2) }).optional(),
    })
    .optional(),
});

const calculationRequest = z.object({
  correlationId: z.string().min(1).describe("id de correlação do chamador"),
  items: z.array(itemSchema).min(1),
  context: contextSchema.optional(),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("data de referência da decisão (YYYY-MM-DD)"),
});

export function createTools(api: TributaxApi): readonly TributaxTool[] {
  return [
    {
      name: "tributax_simulate_taxes",
      description:
        "Simula a tributação de uma operação comercial brasileira (ICMS, PIS/COFINS, retenções) " +
        "SEM persistir. Valores em centavos; percentuais na resposta em basis points. " +
        "Segura para agentes: efeito colateral zero.",
      inputSchema: calculationRequest,
      async handle(input) {
        return render(await api.simulate(input));
      },
    },
    {
      name: "tributax_decide_taxes",
      description:
        "Calcula a tributação e PERSISTE a decisão com trace auditável (append-only). " +
        "Use quando a operação é real (emissão/documento); para hipóteses, prefira tributax_simulate_taxes. " +
        "Requer credencial configurada no servidor MCP.",
      inputSchema: calculationRequest,
      async handle(input) {
        return render(await api.decide(input));
      },
    },
    {
      name: "tributax_list_rules",
      description:
        "Lista o catálogo de regras fiscais vigentes (tributo, jurisdição, alíquota em basis points, " +
        "vigência, fundamento legal, status). Útil para explicar por que uma decisão saiu como saiu.",
      inputSchema: z.object({}),
      async handle() {
        return render(await api.rules());
      },
    },
  ];
}

function render(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}
