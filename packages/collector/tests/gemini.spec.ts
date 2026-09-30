import { describe, expect, it } from "vitest";
import { GeminiChatClient, GeminiEmbeddingProvider } from "../src/rag/gemini.js";

function fetchOk(body: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(body), {
    status: 200, headers: { "content-type": "application/json" },
  })) as unknown as typeof fetch;
}

describe("Gemini (free tier) — chat", () => {
  it("completeJson desembrulha {observations:[...]} e arrays diretos", async () => {
    const body = { candidates: [{ content: { parts: [{ text: '{"observations":[{"tribute":"ISS"}]}' }] } }] };
    const c = new GeminiChatClient({ apiKey: "k", fetchImpl: fetchOk(body) });
    const out = await c.completeJson("prompt");
    expect(Array.isArray(out)).toBe(true);
    expect((out as { tribute: string }[])[0]!.tribute).toBe("ISS");
  });

  it("sem GEMINI_API_KEY → erro claro na construção", () => {
    const old = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    expect(() => new GeminiChatClient({ fetchImpl: fetchOk({}) })).toThrow(/GEMINI_API_KEY ausente/);
    if (old) process.env.GEMINI_API_KEY = old;
  });

  it("HTTP de erro vira exceção com status (após retry e fallback)", async () => {
    const fail = (async () => new Response("{}", { status: 429 })) as unknown as typeof fetch;
    const c = new GeminiChatClient({ apiKey: "k", fetchImpl: fail, backoffMs: 1 });
    await expect(c.completeJson("p")).rejects.toThrow(/Gemini: .*HTTP 429/);
  });
});

describe("Gemini (free tier) — embeddings", () => {
  it("batch embeds todo o lote com a dimensionalidade pedida", async () => {
    const vec = (n: number) => Array.from({ length: n }, (_, i) => i / n);
    const calls: string[] = [];
    const spy = (async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ embeddings: [{ values: vec(1536) }, { values: vec(1536) }] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const p = new GeminiEmbeddingProvider({ apiKey: "k", fetchImpl: spy });
    const out = await p.embed(["a", "b"]);
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(1536);
    expect(calls[0]).toContain("batchEmbedContents");
  });

  it("lote incompleto → erro explícito (não silencia perda)", async () => {
    const one = fetchOk({ embeddings: [{ values: [0.1] }] });
    const p = new GeminiEmbeddingProvider({ apiKey: "k", fetchImpl: one });
    await expect(p.embed(["a", "b"])).rejects.toThrow(/lote incompleto/);
  });

  it("lista vazia não faz request", async () => {
    let called = false;
    const spy = (async () => { called = true; return fetchOk({ embeddings: [] })(); }) as unknown as typeof fetch;
    const p = new GeminiEmbeddingProvider({ apiKey: "k", fetchImpl: spy });
    expect(await p.embed([])).toEqual([]);
    expect(called).toBe(false);
  });
});
