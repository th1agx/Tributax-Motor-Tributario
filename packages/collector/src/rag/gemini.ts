import type { LlmClient } from "../extract/observation-extractor.js";
import type { EmbeddingProvider } from "./embeddings.js";

/**
 * Provedor Google Gemini (FREE TIER, sem cartão — chave gratuita no
 * AI Studio: https://aistudio.google.com/apikey). Alternativa 100% gratuita
 * à OpenAI para o pipeline RAG do LegislationWatch (ADR-013).
 *
 * Sem SDK: REST nativo (generativelanguage.googleapis.com v1beta).
 */

const API = "https://generativelanguage.googleapis.com/v1beta/models";

/** Chat (generateContent) com saída JSON — mesma semântica do OpenAiChatClient. */
export class GeminiChatClient implements LlmClient {
  /** Fallbacks quando o modelo principal está em "high demand" (503). */
  static readonly FALLBACK_MODELS: readonly string[] = ["gemini-flash-lite-latest"];

  private readonly apiKey: string;
  private readonly model: string;
  private readonly backoffMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: { apiKey?: string; model?: string; fetchImpl?: typeof fetch; backoffMs?: number } = {}) {
    this.apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY ?? "";
    this.model = opts.model ?? process.env.LLM_MODEL ?? "gemini-3-flash-preview";
    this.backoffMs = opts.backoffMs ?? 3000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    if (!this.apiKey) throw new Error("GeminiChatClient: GEMINI_API_KEY ausente");
  }

  async completeJson(prompt: string): Promise<unknown> {
    // free tier sofre 503 "high demand" transitórios: retry E fallback de
    // modelo (flash → flash-lite) antes de desistir
    const models = [this.model, ...GeminiChatClient.FALLBACK_MODELS.filter((m) => m !== this.model)];
    let lastError = "";
    for (const model of models) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const res = await this.fetchImpl(`${API}/${model}:generateContent?key=${this.apiKey}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0, responseMimeType: "application/json" },
          }),
        });
        if (res.ok) {
          const body = (await res.json()) as {
            candidates?: readonly { content?: { parts?: readonly { text?: string }[] } }[];
          };
          const content = (body.candidates?.[0]?.content?.parts ?? [])
            .map((p) => p.text ?? "")
            .join("");
          if (!content) throw new Error("Gemini: resposta sem conteúdo");
          const parsed: unknown = JSON.parse(content);
          if (Array.isArray(parsed)) return parsed;
          if (parsed && typeof parsed === "object") {
            const arr = (parsed as Record<string, unknown>).observations;
            if (Array.isArray(arr)) return arr;
          }
          return [parsed];
        }
        lastError = `${model}: HTTP ${res.status}`;
        if (res.status < 500 && res.status !== 429) break; // 4xx não retrocede
        if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * this.backoffMs));
      }
    }
    throw new Error(`Gemini: ${lastError}`);
  }
}

/**
 * Embeddings (gemini-embedding-001) com outputDimensionality configurável —
 * 1536 por default para casar com a coluna vector(1536) do pgvector.
 * Usa batchEmbedContents: um request para todo o lote.
 */
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number;

  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: { apiKey?: string; model?: string; dimensions?: number; fetchImpl?: typeof fetch } = {}) {
    this.apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY ?? "";
    this.model = opts.model ?? process.env.EMBEDDING_MODEL ?? "gemini-embedding-001";
    this.dimensions = opts.dimensions ?? 1536;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    if (!this.apiKey) throw new Error("GeminiEmbeddingProvider: GEMINI_API_KEY ausente");
  }

  async embed(texts: readonly string[]): Promise<readonly number[][]> {
    if (texts.length === 0) return [];
    const res = await this.fetchImpl(`${API}/${this.model}:batchEmbedContents?key=${this.apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${this.model}`,
          content: { parts: [{ text }] },
          taskType: "RETRIEVAL_DOCUMENT",
          outputDimensionality: this.dimensions,
        })),
      }),
    });
    if (!res.ok) throw new Error(`Gemini embeddings: HTTP ${res.status} — ${await res.text()}`);
    const body = (await res.json()) as { embeddings?: readonly { values?: readonly number[] }[] };
    const vectors = (body.embeddings ?? []).map((e): number[] => [...(e.values ?? [])]);
    if (vectors.length !== texts.length) throw new Error("Gemini embeddings: lote incompleto");
    return vectors;
  }
}
