import type { NormChunk } from "../store/norm-store.js";

/** Recuperação por similaridade de cosseno sobre chunks com embedding. */
export function retrieve(
  queryEmbedding: readonly number[],
  chunks: readonly NormChunk[],
  topK: number,
): readonly NormChunk[] {
  return [...chunks]
    .filter((c) => c.embedding !== undefined)
    .map((c) => ({ chunk: c, score: cosine(queryEmbedding, c.embedding!) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((x) => x.chunk);
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error(`cosine: dimensões distintas (${a.length} x ${b.length})`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
