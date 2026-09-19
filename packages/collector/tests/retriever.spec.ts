import { describe, expect, it } from "vitest";
import { FakeEmbeddingProvider } from "../src/rag/embeddings.js";
import { retrieve, cosine } from "../src/rag/retriever.js";
import type { NormChunk } from "../src/store/norm-store.js";

describe("FakeEmbeddingProvider + retrieve", () => {
  it("ranqueia por similaridade de cosseno (compartilhar tokens importa)", async () => {
    const emb = new FakeEmbeddingProvider();
    const [query] = await emb.embed(["alíquota ICMS interestadual RJ"]);
    const [relevant] = await emb.embed(["a alíquota do ICMS interestadual para o RJ passa a 12%"]);
    const [irrelevant] = await emb.embed(["isenção de taxa de licenciamento ambiental municipal"]);

    const chunks: NormChunk[] = [
      { id: "c2", normId: "n2", url: "u2", publishedAt: "2026-09-01T00:00:00Z", text: "texto", embedding: irrelevant },
      { id: "c1", normId: "n1", url: "u1", publishedAt: "2026-09-02T00:00:00Z", text: "texto", embedding: relevant },
    ];

    const top = retrieve(query, chunks, 1);
    expect(top).toHaveLength(1);
    expect(top[0]!.id).toBe("c1");
  });

  it("ignora chunks sem embedding e respeita topK", async () => {
    const emb = new FakeEmbeddingProvider();
    const [q] = await emb.embed(["icms"]);
    const [v] = await emb.embed(["icms alíquota"]);
    const chunks: NormChunk[] = [
      { id: "a", normId: "n", url: "u", publishedAt: "2026-09-01T00:00:00Z", text: "t", embedding: v },
      { id: "b", normId: "n", url: "u", publishedAt: "2026-09-01T00:00:00Z", text: "sem embedding ainda" },
    ];
    expect(retrieve(q, chunks, 5)).toHaveLength(1);
  });

  it("coseno rejeita dimensões distintas", () => {
    expect(() => cosine([1, 0], [1, 0, 0])).toThrow(/dimensões/);
  });

  it("embeddings são determinísticos", async () => {
    const emb = new FakeEmbeddingProvider();
    const [a] = await emb.embed(["ICMS 12%"]);
    const [b] = await emb.embed(["ICMS 12%"]);
    expect(a).toEqual(b);
  });
});
