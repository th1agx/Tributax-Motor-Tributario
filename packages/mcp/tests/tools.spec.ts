import { describe, expect, it } from "vitest";
import { TributaxApi } from "../src/client.js";
import { createTools } from "../src/tools.js";

function apiWith(routes: Record<string, unknown>, calls: { method: string; path: string; body?: unknown }[] = []): TributaxApi {
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(url.toString()).pathname;
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ method, path, ...(init?.body !== undefined ? { body: JSON.parse(String(init.body)) } : {}) });
    const key = `${method} ${path}`;
    const route = routes[key];
    if (route === undefined) return new Response("not found", { status: 404 });
    if ("status" in (route as object)) {
      return new Response(JSON.stringify((route as { body: unknown }).body), {
        status: (route as { status: number }).status,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify(route), { status: /POST/.test(method) ? 201 : 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return new TributaxApi({ apiUrl: "http://api.test", fetchImpl });
}

const payload = {
  correlationId: "mcp-1",
  items: [{ description: "Produto", unitPrice: { amount: 100000 } }],
  context: { recipient: { address: { state: "SP" } } },
};

describe("TributaxApi (client REST)", () => {
  it("POST /v1/tax-simulations e aceita 200", async () => {
    const calls: { method: string; path: string; body?: unknown }[] = [];
    const api = apiWith({ "POST /v1/tax-simulations": { ok: true } }, calls);
    await expect(api.simulate(payload)).resolves.toEqual({ ok: true });
    expect(calls[0]!.path).toBe("/v1/tax-simulations");
    expect(calls[0]!.body).toEqual(payload);
  });

  it("decide aceita 201 e repassa o body", async () => {
    const calls: { method: string; path: string; body?: unknown }[] = [];
    const api = apiWith({ "POST /v1/tax-decisions": { decisionId: "d1" } }, calls);
    await expect(api.decide(payload)).resolves.toEqual({ decisionId: "d1" });
    expect(calls[0]!.method).toBe("POST");
  });

  it("erro vira mensagem com status e corpo", async () => {
    const api = apiWith({ "GET /v1/rules": { status: 502, body: { error: "postgres fora" } } });
    await expect(api.rules()).rejects.toThrow(/HTTP 502.*postgres fora/);
  });

  it("API key vai no header quando configurada", async () => {
    const headers: string[] = [];
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      headers.push(String(init?.headers ? (init.headers as Record<string, string>).authorization : ""));
      return new Response("[]", { status: 200 });
    }) as unknown as typeof fetch;
    const api = new TributaxApi({ apiUrl: "http://api.test", apiKey: "k-1", fetchImpl });
    await api.rules();
    expect(headers[0]).toBe("Bearer k-1");
  });
});

describe("createTools", () => {
  it("simula sem persistir e devolve JSON renderizado", async () => {
    const calls: { method: string; path: string }[] = [];
    const api = apiWith(
      { "POST /v1/tax-simulations": { taxes: [{ tribute: "ICMS", rateBp: 1800 }] } },
      calls as { method: string; path: string; body?: unknown }[],
    );
    const tools = createTools(api);
    const simulate = tools.find((t) => t.name === "tributax_simulate_taxes")!;

    const out = await simulate.handle(payload);
    expect(JSON.parse(out).taxes[0].rateBp).toBe(1800);
    expect(calls).toEqual([{ method: "POST", path: "/v1/tax-simulations", body: payload }]);
  });

  it("decide chama o endpoint de decisão (persistente)", async () => {
    const calls: { method: string; path: string; body?: unknown }[] = [];
    const api = apiWith({ "POST /v1/tax-decisions": { decisionId: "d9" } }, calls);
    const decide = createTools(api).find((t) => t.name === "tributax_decide_taxes")!;
    await decide.handle(payload);
    expect(calls[0]!.path).toBe("/v1/tax-decisions");
  });

  it("list_rules expõe o catálogo", async () => {
    const api = apiWith({ "GET /v1/rules": [{ id: "icms-sp", tribute: "ICMS" }] });
    const list = createTools(api).find((t) => t.name === "tributax_list_rules")!;
    const out = await list.handle({});
    expect(JSON.parse(out)[0].id).toBe("icms-sp");
  });

  it("payload inválido é rejeitado pelo schema (validação na fronteira)", async () => {
    const api = apiWith({});
    const simulate = createTools(api).find((t) => t.name === "tributax_simulate_taxes")!;
    expect(simulate.inputSchema.safeParse({ correlationId: "", items: [] }).success).toBe(false);
    expect(simulate.inputSchema.safeParse(payload).success).toBe(true);
  });

  it("nomes de ferramenta usam prefixo consistente tributax_", () => {
    for (const t of createTools(apiWith({}))) expect(t.name).toMatch(/^tributax_[a-z_]+$/);
  });
});
