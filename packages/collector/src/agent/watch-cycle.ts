import type { NormCollector } from "../sources/types.js";
import type { NormStore } from "../store/norm-store.js";
import type { EmbeddingProvider } from "../rag/embeddings.js";
import { chunkNorm } from "../rag/chunker.js";
import { retrieve } from "../rag/retriever.js";
import { LlmObservationExtractor, type SourcedObservation, type Rejection } from "../extract/observation-extractor.js";

/**
 * runWatchCycle (ADR-013): coletar → armazenar → chunkar → embedar →
 * recuperar → extrair. Emite um WatchReport no MESMO formato que o
 * watch-agent.cli.ts existente aplica via API — o RAG apenas substitui a
 * escrita manual do relatório, nada mais muda no fluxo do ADR-012.
 */

export interface WatchTarget {
  readonly tribute: string;
  /** UF ou código IBGE; omitir para tributo federal. */
  readonly jurisdictionCode?: string;
  /** Termos extras para filtrar a coleta (ex.: nome do convênio). */
  readonly extraKeywords?: readonly string[];
}

export interface WatchCycleConfig {
  readonly target: WatchTarget;
  readonly collector: NormCollector;
  readonly store: NormStore;
  readonly embeddings: EmbeddingProvider;
  readonly extractor: LlmObservationExtractor;
  readonly sinceDays?: number;
  readonly topK?: number;
}

export interface WatchCycleResult {
  readonly report: {
    readonly generatedAt: string;
    readonly observations: readonly SourcedObservation[];
  };
  /** Guardrails: o que a LLM tentou e foi rejeitado, com motivo. */
  readonly rejections: readonly Rejection[];
  readonly stats: {
    readonly normsCollected: number;
    readonly normsNew: number;
    readonly chunksEmbedded: number;
    readonly chunksRetrieved: number;
  };
}

export async function runWatchCycle(config: WatchCycleConfig, now: Date = new Date()): Promise<WatchCycleResult> {
  const { target, collector, store, embeddings, extractor } = config;
  const sinceDays = config.sinceDays ?? 7;
  const topK = config.topK ?? 8;

  // 1. coleta com filtro desde a origem — ingestar tudo é caro e inútil
  const keywords = [target.tribute, ...(target.extraKeywords ?? [])];
  const norms = await collector.collect(keywords, sinceDays);
  let normsNew = 0;
  for (const norm of norms) {
    if (await store.saveNorm(norm)) normsNew++;
    for (const chunk of chunkNorm(norm)) {
      const [vector] = await embeddings.embed([chunk.text]);
      await store.saveChunk({ ...chunk, embedding: vector! });
    }
  }

  // 2. recuperação: query reúne tributo + jurisdição + sinônimos de alíquota
  const query = [target.tribute, target.jurisdictionCode, "alíquota", "percentual", "vigência"]
    .filter((t): t is string => t !== undefined)
    .join(" ");
  const [queryVector] = await embeddings.embed([query]);
  const candidates = await store.recentChunks(500);
  const retrieved = retrieve(queryVector!, candidates, topK);

  // 3. extração com guardrails
  const { observations, rejections } = await extractor.extract(retrieved);

  return {
    report: { generatedAt: now.toISOString(), observations },
    rejections,
    stats: {
      normsCollected: norms.length,
      normsNew,
      chunksEmbedded: norms.reduce((acc, n) => acc + chunkNorm(n).length, 0),
      chunksRetrieved: retrieved.length,
    },
  };
}
