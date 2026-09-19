import { describe, expect, it } from "vitest";
import { LlmObservationExtractor, type LlmClient } from "../src/extract/observation-extractor.js";
import type { NormChunk } from "../src/store/norm-store.js";
import { chunkNorm } from "../src/rag/chunker.js";
import type { LegalNormDocument } from "../src/sources/types.js";

const norm: LegalNormDocument = {
  id: "n1",
  url: "https://exemplo.gov.br/convenio-icms-100",
  publishedAt: "2026-09-15T12:00:00.000Z",
  title: "Convênio ICMS 100/2026",
  source: "DOU",
  text:
    "O Convênio ICMS 100/2026 altera a alíquota do ICMS interestadual. " +
    "A partir de 2026-10-01, a alíquota passa a ser 12% para operações destinadas ao RJ. " +
    "Fica mantida a alíquota de 4,65% para os demais casos previstos em regulamento.",
};

function chunksOf(text = norm.text): NormChunk[] {
  return chunkNorm({ ...norm, text }, 900).map((c) => ({ ...c, embedding: [] }));
}

/** LLM "perfeito": lê o chunk e devolve observações coerentes. */
const honestLlm: LlmClient = {
  async completeJson() {
    return [
      { tribute: "ICMS", jurisdictionCode: "RJ", rateBp: 1200, validFrom: "2026-10-01", confidence: 0.9, sourceUrl: norm.url, notes: "interessadual 12%" },
    ];
  },
};

describe("LlmObservationExtractor — guardrails (ADR-013)", () => {
  it("aceita observação cuja alíquota está escrita no chunk e amarra a fonte", async () => {
    const { observations, rejections } = await new LlmObservationExtractor(honestLlm).extract(chunksOf());
    expect(rejections).toEqual([]);
    expect(observations).toHaveLength(1);
    const obs = observations[0]!;
    expect(obs.rateBp).toBe(1200);
    expect(obs.sources[0]!.url).toBe(norm.url);
    expect(obs.sources[0]!.publishedAt).toBe(norm.publishedAt);
    expect(obs.sources[0]!.excerpt).toContain("12%");
  });

  it("rejeita alíquota que NÃO aparece no texto (alucinação)", async () => {
    const hallucinatingLlm: LlmClient = {
      async completeJson() {
        return [{ tribute: "ICMS", rateBp: 1800, validFrom: "2026-10-01", confidence: 0.99, sourceUrl: norm.url }];
      },
    };
    const { observations, rejections } = await new LlmObservationExtractor(hallucinatingLlm).extract(chunksOf());
    expect(observations).toHaveLength(0);
    expect(rejections).toHaveLength(1);
    expect(rejections[0]!.reason).toMatch(/não aparece no texto.*alucinação/);
  });

  it("rejeita sourceUrl que não corresponde a nenhum chunk (fonte fabricada)", async () => {
    const fabricatingLlm: LlmClient = {
      async completeJson() {
        return [{ tribute: "ICMS", rateBp: 1200, validFrom: "2026-10-01", confidence: 0.9, sourceUrl: "https://fake.gov.br/lei" }];
      },
    };
    const { rejections } = await new LlmObservationExtractor(fabricatingLlm).extract(chunksOf());
    expect(rejections[0]!.reason).toMatch(/sourceUrl não corresponde/);
  });

  it("valida formato de validFrom e faixa de confidence", async () => {
    const badLlm: LlmClient = {
      async completeJson() {
        return [
          { tribute: "ICMS", rateBp: 1200, validFrom: "01/10/2026", confidence: 0.9, sourceUrl: norm.url },
          { tribute: "ICMS", rateBp: 1200, validFrom: "2026-10-01", confidence: 1.5, sourceUrl: norm.url },
        ];
      },
    };
    const { observations, rejections } = await new LlmObservationExtractor(badLlm).extract(chunksOf());
    expect(observations).toHaveLength(0);
    expect(rejections).toHaveLength(2);
  });

  it("aceita percentual com vírgula decimal (4,65% → 465 bp)", async () => {
    const llm: LlmClient = {
      async completeJson() {
        return [{ tribute: "ICMS", rateBp: 465, validFrom: "2026-10-01", confidence: 0.8, sourceUrl: norm.url }];
      },
    };
    const { observations } = await new LlmObservationExtractor(llm).extract(chunksOf());
    expect(observations).toHaveLength(1);
    expect(observations[0]!.rateBp).toBe(465);
  });

  it("descarta ruído que não é objeto e aceita wrapper {observations:[...]}", async () => {
    const llm: LlmClient = {
      async completeJson() {
        return { observations: [{ tribute: "ICMS", rateBp: 1200, validFrom: "2026-10-01", confidence: 0.9, sourceUrl: norm.url }] };
      },
    };
    const { observations } = await new LlmObservationExtractor(llm).extract(chunksOf());
    expect(observations).toHaveLength(1);
  });
});
