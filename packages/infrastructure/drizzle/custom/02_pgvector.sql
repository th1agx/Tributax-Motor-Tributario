-- 02_pgvector.sql (ADR-013): base vetorial do RAG do LegislationWatch.
-- Requer a extensão pgvector (postgres:pgvector ou apt install postgresql-16-pgvector).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS norms (
  id            varchar(128) PRIMARY KEY,
  url           text NOT NULL,
  published_at  timestamptz NOT NULL,
  title         text NOT NULL,
  text          text NOT NULL,
  source        varchar(32) NOT NULL,
  collected_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS norm_chunks (
  id            varchar(64) PRIMARY KEY,
  norm_id       varchar(128) NOT NULL REFERENCES norms(id) ON DELETE CASCADE,
  url           text NOT NULL,
  published_at  timestamptz NOT NULL,
  text          text NOT NULL,
  embedding     vector(1536)
);

CREATE INDEX IF NOT EXISTS norm_chunks_norm_idx ON norm_chunks (norm_id);
CREATE INDEX IF NOT EXISTS norm_chunks_published_idx ON norm_chunks (published_at DESC);
CREATE INDEX IF NOT EXISTS norm_chunks_embedding_idx ON norm_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
