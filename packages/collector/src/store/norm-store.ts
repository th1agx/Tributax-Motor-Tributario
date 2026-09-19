import { createHash } from "node:crypto";
import type { LegalNormDocument } from "../sources/types.js";

/**
 * NormStore (ADR-013): normas e chunks são append-only e idempotentes por
 * hash de conteúdo — re-executar o coletor nunca duplica evidência.
 */

export interface NormChunk {
  readonly id: string; // hash(normId + offset)
  readonly normId: string;
  readonly url: string;
  readonly publishedAt: string;
  readonly text: string;
  /** Preenchido no estágio de embedding; ausente até lá. */
  readonly embedding?: readonly number[];
}

export interface NormStore {
  /** Idempotente por norm.id; retorna true se inseriu. */
  saveNorm(norm: LegalNormDocument): Promise<boolean>;
  /** Idempotente por chunk.id; o embedding sobrescreve se já existia. */
  saveChunk(chunk: NormChunk): Promise<void>;
  /** Chunks (com embedding) dos últimos `limit` norms mais recentes. */
  recentChunks(limit: number): Promise<readonly NormChunk[]>;
  hasNorm(normId: string): Promise<boolean>;
}

export function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function chunkId(normId: string, offset: number): string {
  return sha256(`${normId}#${offset}`).slice(0, 24);
}

/** Implementação em memória — suficiente para CLI única e testes; a evolução natural é pgvector. */
export class InMemoryNormStore implements NormStore {
  private readonly norms = new Map<string, LegalNormDocument>();
  private readonly chunks = new Map<string, NormChunk>();

  async saveNorm(norm: LegalNormDocument): Promise<boolean> {
    if (this.norms.has(norm.id)) return false;
    this.norms.set(norm.id, norm);
    return true;
  }

  async saveChunk(chunk: NormChunk): Promise<void> {
    this.chunks.set(chunk.id, chunk);
  }

  async recentChunks(limit: number): Promise<readonly NormChunk[]> {
    const ordered = [...this.chunks.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    return ordered.slice(0, limit);
  }

  async hasNorm(normId: string): Promise<boolean> {
    return this.norms.has(normId);
  }
}
