import { describe, expect, it } from "vitest";
import { chunkNorm } from "../src/rag/chunker.js";
import type { LegalNormDocument } from "../src/sources/types.js";

const norm: LegalNormDocument = {
  id: "n1",
  url: "https://exemplo.gov.br/norma/1",
  publishedAt: "2026-09-01T12:00:00.000Z",
  title: "Convênio ICMS 000/2026",
  source: "DOU",
  text: "",
};

describe("chunkNorm", () => {
  it("mantém frases curtas juntas até o limite", () => {
    const text = Array.from({ length: 50 }, (_, i) => `Frase número ${i} do artigo fictício.`).join(" ");
    const chunks = chunkNorm({ ...norm, text }, 300);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(300);
    // nenhum conteúdo perdido
    const joined = chunks.map((c) => c.text).join(" ");
    expect(joined).toContain("Frase número 0");
    expect(joined).toContain("Frase número 49");
  });

  it("quebra frase isolada maior que o máximo", () => {
    const long = "A".repeat(500);
    const chunks = chunkNorm({ ...norm, text: long }, 200);
    expect(chunks.length).toBe(3);
    expect(chunks[0]!.text.length).toBe(200);
  });

  it("produz ids estáveis e metadados da norma em cada chunk", () => {
    const chunks = chunkNorm({ ...norm, text: "Frase um. Frase dois. Frase três." }, 900);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.id).toBe(chunkNorm({ ...norm, text: "Frase um. Frase dois. Frase três." }, 900)[0]!.id);
    expect(chunks[0]!.url).toBe(norm.url);
    expect(chunks[0]!.normId).toBe(norm.id);
  });
});
