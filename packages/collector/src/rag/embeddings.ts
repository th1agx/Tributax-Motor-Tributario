/**
 * EmbeddingProvider (ADR-013): port atrás do qual vivem o adapter
 * OpenAI-compatível (produção) e o fake determinístico (testes/offline).
 */

export interface EmbeddingProvider {
  readonly dimensions: number;
  embed(texts: readonly string[]): Promise<readonly number[][]>;
}

/**
 * Fake determinístico: vetor bag-of-words por hash de token. Não tem a
 * semântica de um modelo real, mas compartilha palavras-chave — suficiente
 * para testar o pipeline inteiro offline e de forma reprodutível.
 */
export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number;

  constructor(dimensions = 128) {
    this.dimensions = dimensions;
  }

  async embed(texts: readonly string[]): Promise<readonly number[][]> {
    return texts.map((t) => this.vector(t));
  }

  private vector(text: string): number[] {
    const v = new Array<number>(this.dimensions).fill(0);
    for (const token of tokenize(text)) {
      const h = hash32(token) % this.dimensions;
      v[h]! += 1;
    }
    const norm = Math.sqrt(v.reduce((acc, x) => acc + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  }
}

/** Adapter OpenAI-compatível (/v1/embeddings) — config via env, sem SDK. */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number;

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    dimensions?: number;
    fetchImpl?: typeof fetch;
  } = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
    this.apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    this.model = opts.model ?? process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
    this.dimensions = opts.dimensions ?? 1536;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    if (!this.apiKey) throw new Error("OpenAIEmbeddingProvider: OPENAI_API_KEY ausente");
  }

  async embed(texts: readonly string[]): Promise<readonly number[][]> {
    const res = await this.fetchImpl(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) throw new Error(`embeddings: HTTP ${res.status} — ${await res.text()}`);
    const body = (await res.json()) as { data?: readonly { embedding: number[] }[] };
    const vectors = body.data?.map((d) => d.embedding);
    if (!vectors || vectors.length !== texts.length) {
      throw new Error(`embeddings: resposta com ${vectors?.length ?? 0} vetores para ${texts.length} textos`);
    }
    return vectors;
  }
}

export function tokenize(text: string): readonly string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9%]+/)
    .filter((t) => t.length > 1);
}

/** FNV-1a 32 bits — determinístico entre execuções (Math.random nunca). */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
