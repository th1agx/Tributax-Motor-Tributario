import pg from "pg";

/**
 * Adapter Postgres/pgvector do port NormStore (ADR-013). Implementa a
 * interface por duck typing, como os demais adapters. Idempotente:
 * norma re-coletada é no-op; embedding de chunk sobrescreve.
 *
 * Os tipos são declarados LOCALMENTE (estruturalmente idênticos aos do
 * @tributax/collector): infra não importa types do collector — a dependência
 * de tipos cruzada collector↔infra criava ciclo no build (TS5055).
 */
export interface LegalNormDocument {
  readonly id: string;
  readonly url: string;
  readonly publishedAt: string;
  readonly title: string;
  readonly text: string;
  readonly source: string;
}

export interface NormChunk {
  readonly id: string;
  readonly normId: string;
  readonly url: string;
  readonly publishedAt: string;
  readonly text: string;
  readonly embedding?: readonly number[];
}

export interface NormStore {
  saveNorm(norm: LegalNormDocument): Promise<boolean>;
  saveChunk(chunk: NormChunk): Promise<void>;
  recentChunks(limit: number): Promise<readonly NormChunk[]>;
  searchChunks(queryEmbedding: readonly number[], topK: number): Promise<readonly NormChunk[]>;
  hasNorm(normId: string): Promise<boolean>;
}

export class PostgresNormStore implements NormStore {
  private readonly pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new pg.Pool({ connectionString: databaseUrl });
  }

  async saveNorm(norm: LegalNormDocument): Promise<boolean> {
    const res = await this.pool.query(
      `INSERT INTO norms (id, url, published_at, title, text, source)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [norm.id, norm.url, norm.publishedAt, norm.title, norm.text, norm.source],
    );
    return res.rowCount === 1;
  }

  async saveChunk(chunk: NormChunk): Promise<void> {
    await this.pool.query(
      `INSERT INTO norm_chunks (id, norm_id, url, published_at, text, embedding)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET embedding = EXCLUDED.embedding`,
      [
        chunk.id,
        chunk.normId,
        chunk.url,
        chunk.publishedAt,
        chunk.text,
        ...(chunk.embedding !== undefined
          ? [`[${chunk.embedding.join(",")}]`]
          : [null]),
      ],
    );
  }

  async recentChunks(limit: number): Promise<readonly NormChunk[]> {
    const res = await this.pool.query(
      `SELECT id, norm_id, url, published_at, text, embedding::text AS embedding
       FROM norm_chunks
       WHERE embedding IS NOT NULL
       ORDER BY published_at DESC
       LIMIT $1`,
      [limit],
    );
    return res.rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      normId: r.norm_id as string,
      url: r.url as string,
      publishedAt: r.published_at as string,
      text: r.text as string,
      embedding: ((): readonly number[] => {
        const lit = r.embedding as string;
        return lit.slice(1, -1).split(",").map(Number);
      })(),
    }));
  }

  /** Busca vetorial top-K por similaridade de cosseno (o motivo do pgvector). */
  async searchChunks(queryEmbedding: readonly number[], topK: number): Promise<readonly NormChunk[]> {
    const res = await this.pool.query(
      `SELECT id, norm_id, url, published_at, text, embedding::text AS embedding
       FROM norm_chunks
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1
       LIMIT $2`,
      [`[${queryEmbedding.join(",")}]`, topK],
    );
    return res.rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      normId: r.norm_id as string,
      url: r.url as string,
      publishedAt: r.published_at as string,
      text: r.text as string,
      embedding: ((): readonly number[] => {
        const lit = r.embedding as string;
        return lit.slice(1, -1).split(",").map(Number);
      })(),
    }));
  }

  async hasNorm(normId: string): Promise<boolean> {
    const res = await this.pool.query("SELECT 1 FROM norms WHERE id = $1", [normId]);
    return res.rowCount === 1;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
