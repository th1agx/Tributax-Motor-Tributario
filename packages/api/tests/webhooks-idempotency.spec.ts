import { describe, expect, it } from "vitest";
import { InMemoryWebhookRegistry } from "../src/webhooks/webhooks.controller.js";
import { createHmac } from "node:crypto";

describe("Webhooks — registro e entrega assinada", () => {
  const deliveries: { url: string; headers: Record<string, string>; body: unknown }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    deliveries.push({
      url: String(url),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init?.body)),
    });
    return new Response("ok", { status: 200 });
  }) as unknown as typeof fetch;

  it("entrega só para sinks inscritos no evento, com HMAC do corpo", async () => {
    process.env.TRIBUTAX_WEBHOOK_SECRET = "whsec-test";
    const reg = new InMemoryWebhookRegistry(fetchImpl);
    await reg.add("https://cli.example/hook", ["decision.created"]);
    await reg.add("https://outro.example/hook", ["rule.proposal.created"]);

    await reg.emit("decision.created", { decisionId: "d1" });

    expect(deliveries).toHaveLength(1); // só o sink certo recebeu
    const d = deliveries[0]!;
    expect(d.url).toBe("https://cli.example/hook");
    expect(d.headers["x-tributax-event"]).toBe("decision.created");
    const expected = createHmac("sha256", "whsec-test").update(String(JSON.stringify({
      event: "decision.created",
      sentAt: (d.body as { sentAt: string }).sentAt,
      data: { decisionId: "d1" },
    }))).digest("hex");
    expect(d.headers["x-tributax-signature"]).toBe(`sha256=${expected}`);
    delete process.env.TRIBUTAX_WEBHOOK_SECRET;
  });

  it("sink fora do ar não propaga a falha (decisão fiscal continua)", async () => {
    const broken = (async () => new Response(" fora", { status: 503 })) as unknown as typeof fetch;
    const reg = new InMemoryWebhookRegistry(broken);
    await reg.add("https://caido.example/hook", ["decision.created"]);
    const results = await reg.emit("decision.created", {});
    expect(results[0]!.status).toBe("rejected"); // isolado, não lançado
  });

  it("url inválida e sem eventos são rejeitadas na carga", async () => {
    const reg = new InMemoryWebhookRegistry();
    await expect(reg.add("ftp://x", ["decision.created"])).rejects.toThrow(/http\(s\)/);
    await expect(reg.add("https://ok.example", [])).rejects.toThrow(/ao menos 1 evento/);
  });
});
