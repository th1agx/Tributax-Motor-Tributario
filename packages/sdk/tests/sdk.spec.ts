import { describe, expect, it } from "vitest";
import { TributaxClient, TributaxApiError } from "../src/index.js";

function routes(calls: { method: string; url: string; headers: Record<string, string>; body?: unknown }[], table: Record<string, unknown>): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      method: (init?.method ?? "GET").toUpperCase(),
      url: String(url),
      headers: (init?.headers ?? {}) as Record<string, string>,
      ...(init?.body !== undefined ? { body: JSON.parse(String(init.body)) } : {}),
    });
    const path = new URL(String(url)).pathname;
    const key = `${(init?.method ?? "GET").toUpperCase()} ${path}`;
    const route = table[key];
    if (route === undefined) return new Response("nf", { status: 404 });
    if ("status" in (route as object)) {
      return new Response(JSON.stringify((route as { body: unknown }).body), {
        status: (route as { status: number }).status,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify(route), { status: /POST/.test(key) ? 201 : 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

const payload = {
  correlationId: "sdk-1",
  items: [{ description: "Produto", unitPrice: { amount: 100000 } }],
};

describe("TributaxClient", () => {
  it("simulate/decide com api key e body certos", async () => {
    const calls: Parameters<typeof routes>[0] = [];
    const client = new TributaxClient({ apiKey: "tk-1", fetchImpl: routes(calls, {
      "POST /v1/tax-simulations": { decisionId: "s" },
      "POST /v1/tax-decisions": { decisionId: "d" },
    }) });
    await client.simulate(payload);
    await client.decide(payload);
    expect(calls[0]!.url).toContain("/v1/tax-simulations");
    expect(calls[0]!.headers["x-api-key"]).toBe("tk-1");
    expect(calls[1]!.body).toEqual(payload);
  });

  it("idempotencyKey vai no header x-idempotency-key", async () => {
    const calls: Parameters<typeof routes>[0] = [];
    const client = new TributaxClient({ fetchImpl: routes(calls, { "POST /v1/tax-decisions": { decisionId: "d" } }) });
    await client.decide(payload, { idempotencyKey: "ped-1" });
    expect(calls[0]!.headers["x-idempotency-key"]).toBe("ped-1");
  });

  it("4xx não retenta e vira TributaxApiError tipada", async () => {
    const calls: Parameters<typeof routes>[0] = [];
    const client = new TributaxClient({ maxRetries: 3, fetchImpl: routes(calls, {
      "POST /v1/tax-simulations": { status: 422, body: { error: "PAYLOAD_VALIDATION", message: "items vazio" } },
    }) });
    await expect(client.simulate({ correlationId: "x", items: [] })).rejects.toBeInstanceOf(TributaxApiError);
    expect(calls).toHaveLength(1); // sem retry em erro do chamador
  });

  it("5xx retenta com backoff e eventualmente passa", async () => {
    let n = 0;
    const fetchImpl = (async () => {
      n++;
      if (n < 3) return new Response("boom", { status: 502 });
      return new Response(JSON.stringify({ decisionId: "ok" }), { status: 201 });
    }) as unknown as typeof fetch;
    const client = new TributaxClient({ maxRetries: 2, fetchImpl });
    const res = await client.decide(payload);
    expect((res as { decisionId: string }).decisionId).toBe("ok");
    expect(n).toBe(3);
  });
});
