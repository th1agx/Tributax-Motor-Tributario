export type { LegalNormDocument, NormCollector } from "./sources/types.js";
export { RssCollector } from "./sources/rss-collector.js";
export { DouCollector } from "./sources/dou-collector.js";
export { QueridoDiarioCollector } from "./sources/querido-diario-collector.js";

export type { NormChunk, NormStore } from "./store/norm-store.js";
export { InMemoryNormStore, chunkId, sha256 } from "./store/norm-store.js";

export { chunkNorm } from "./rag/chunker.js";
export type { EmbeddingProvider } from "./rag/embeddings.js";
export { FakeEmbeddingProvider, OpenAIEmbeddingProvider, tokenize } from "./rag/embeddings.js";
export { retrieve, cosine } from "./rag/retriever.js";

export type { ExtractedObservation, SourcedObservation, Rejection, ExtractionResult, LlmClient } from "./extract/observation-extractor.js";
export { LlmObservationExtractor } from "./extract/observation-extractor.js";
export { OpenAiChatClient } from "./extract/openai-client.js";

export type { WatchTarget, WatchCycleConfig, WatchCycleResult } from "./agent/watch-cycle.js";
export { runWatchCycle } from "./agent/watch-cycle.js";
