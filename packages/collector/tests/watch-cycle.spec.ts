import { describe, expect, it } from "vitest";
import { runWatchCycle } from "../src/agent/watch-cycle.js";
import type { NormCollector, LegalNormDocument } from "../src/sources/types.js";
import { InMemoryNormStore } from "../src/store/norm-store.js";
import { FakeEmbeddingProvider } from "../src/rag/embeddings.js";
import { LlmObservationExtractor, type LlmClient } from "../src/extract/observation-extractor.js";

const normText =
  "Convênio ICMS 100/2026. A alíquota do ICMS interestadual destinada ao estado do RJ passa a 12% " +
  "a partir de 2026-10-01. Demais disposições permanecem inalteradas.";

const norm: LegalNormDocument = {
  id: "DOU|1",
  url: "https://www.in.gov.br/mat/1",
  publishedAt: new Date().toISOString(),
  title: "Convênio ICMS 100/2026",
  text: normText,
  source: "DOU",
};

const collector: NormCollector = {
  name: "fake",
  async collect() {
    return [norm];
  },
};

const llm: LlmClient = {
  async completeJson() {
    return [{ tribute: "ICMS", jurisdictionCode: "RJ", rateBp: 1200, validFrom: "2026-10-01", confidence: 0.9, sourceUrl: norm.url }];
  },
};

function setup() {
  return {
    collector,
    store: new InMemoryNormStore(),
    embeddings: new FakeEmbeddingProvider(),
    extractor: new LlmObservationExtractor(llm),
  };
}

describe("runWatchCycle — pipeline ponta a ponta (offline)", () => {
  it("produz WatchReport válido com observação guardada por fonte", async () => {
    const result = await runWatchCycle({
      target: { tribute: "ICMS", jurisdictionCode: "RJ" },
      ...setup(),
      sinceDays: 7,
      topK: 4,
    });

    expect(result.stats.normsCollected).toBe(1);
    expect(result.stats.normsNew).toBe(1);
    expect(result.stats.chunksEmbedded).toBeGreaterThan(0);
    expect(result.report.observations).toHaveLength(1);

    const obs = result.report.observations[0]!;
    expect(obs.tribute).toBe("ICMS");
    expect(obs.rateBp).toBe(1200);
    expect(obs.validFrom).toBe("2026-10-01");
    expect(obs.sources[0]!.url).toBe(norm.url);
    // formato compatível com o watch-report.json que o diffCatalog consome
    expect(Date.parse(result.report.generatedAt)).not.toBeNaN();
  });

  it("re-executar é idempotente no store (norma nova só na 1ª vez)", async () => {
    const s = setup();
    const config = { target: { tribute: "ICMS" }, ...s, sinceDays: 7, topK: 4 };
    const first = await runWatchCycle(config);
    const second = await runWatchCycle(config);
    expect(first.stats.normsNew).toBe(1);
    expect(second.stats.normsNew).toBe(0);
  });

  it("sem chunks recuperados: report vazio, sem chamar a LLM", async () => {
    const empty: NormCollector = { name: "vazio", async collect() { return []; } };
    let llmCalls = 0;
    const countingLlm: LlmClient = { async completeJson() { llmCalls++; return []; } };
    const result = await runWatchCycle({
      target: { tribute: "ICMS" },
      collector: empty,
      store: new InMemoryNormStore(),
      embeddings: new FakeEmbeddingProvider(),
      extractor: new LlmObservationExtractor(countingLlm),
    });
    expect(result.report.observations).toHaveLength(0);
    expect(llmCalls).toBe(0);
  });
});
