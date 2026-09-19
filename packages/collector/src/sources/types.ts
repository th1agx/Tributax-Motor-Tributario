/**
 * Tipos do contexto de coleta (ADR-013).
 * A norma coletada é a EVIDÊNCIA primária: URL e data de publicação são
 * obrigatórios — sem fonte citada, nada downstream é auditável.
 */

/** Documento normativo coletado de uma fonte pública. */
export interface LegalNormDocument {
  /** Identificador estável da norma na fonte (ex.: URL canônica do DOU). */
  readonly id: string;
  readonly url: string;
  readonly publishedAt: string; // ISO-8601
  readonly title: string;
  /** Texto integral ou ementa disponível na fonte. */
  readonly text: string;
  /** Nome da fonte (ex.: "DOU", "DOESP"). */
  readonly source: string;
}

/** Port de coleta: cada fonte pública é um adapter. */
export interface NormCollector {
  readonly name: string;
  /**
   * Coleta normas recentes que casem com os termos de interesse.
   * `sinceDays` limita a janela (ex.: 7 para uma varredura semanal).
   */
  collect(keywords: readonly string[], sinceDays: number): Promise<readonly LegalNormDocument[]>;
}
