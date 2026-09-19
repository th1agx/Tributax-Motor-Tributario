import { describe, expect, it } from "vitest";
import { PostgresNormStore } from "../src/postgres-norm-store.js";
import { chunkNorm } from "@tributax/collector";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Integração com Postgres+pgvector: exige migration custom 02_pgvector.sql
 * aplicada. Pula sem DATABASE_URL.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const d = describe.skipIf(!DATABASE_URL);

d("PostgresNormStore — evidência e chunks vetoriais (ADR-013)", () => {
  it("saveNorm é idempotente e chunks recuperam com embedding", async () => {
    const store = new PostgresNormStore(DATABASE_URL!);
    // sonda pgvector: banco sem a extensão (postgres puro) pula com aviso;
    // com a extensão, garante o schema (idempotente) para rodar fora do CI
    try {
      await store.pool.query("CREATE EXTENSION IF NOT EXISTS vector");
    } catch {
      console.warn("[pgvector] extensão indisponível neste Postgres — teste pulado");
      await store.close();
      return;
    }
    const migration = await readFile(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../drizzle/custom/02_pgvector.sql"),
      "utf-8",
    );
    await store.pool.query(migration);
    const norm = {
      id: `test-norm-${Date.now()}`,
      url: "https://exemplo.gov.br/norma-teste",
      publishedAt: new Date().toISOString(),
      title: "Norma de teste",
      text: "A alíquota do ICMS passa a 12% a partir de outubro. Outra frase para gerar segundo chunk.",
      source: "TEST",
    };

    expect(await store.saveNorm(norm)).toBe(true);
    expect(await store.saveNorm(norm)).toBe(false); // re-coleta é no-op

    const embedding = Array.from({ length: 1536 }, (_, i) => (i % 7) / 7);
    for (const chunk of chunkNorm(norm)) {
      await store.saveChunk({ ...chunk, embedding });
    }
    const recent = await store.recentChunks(500);
    const mine = recent.filter((c) => c.normId === norm.id);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine[0]!.embedding).toHaveLength(1536);

    const hits = await store.searchChunks(embedding, 5);
    expect(hits[0]!.normId).toBe(norm.id);

    // limpeza: norma de teste (chunks caem por ON DELETE CASCADE)
    await store.pool.query("DELETE FROM norms WHERE id = $1", [norm.id]);
    await store.close();
  });
});
