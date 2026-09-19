import type { LegalNormDocument } from "../sources/types.js";
import { chunkId, type NormChunk } from "../store/norm-store.js";

/**
 * Chunker (ADR-013): divide o texto da norma em pedaços próximos de
 * `maxChars`, quebrando preferencialmente em fim de frase/parágrafo.
 * A alíquota e sua vigência costumam viver na mesma frase — o tamanho
 * favorece que permaneçam juntas no mesmo chunk.
 */
export function chunkNorm(norm: LegalNormDocument, maxChars = 900): readonly NormChunk[] {
  const chunks: NormChunk[] = [];
  let offset = 0;
  for (const piece of splitSentences(norm.text, maxChars)) {
    chunks.push({
      id: chunkId(norm.id, offset),
      normId: norm.id,
      url: norm.url,
      publishedAt: norm.publishedAt,
      text: piece,
    });
    offset += piece.length;
  }
  return chunks;
}

function splitSentences(text: string, maxChars: number): readonly string[] {
  const sentences = text
    .replace(/\r/g, "")
    .split(/(?<=[.;:!?])\s+|\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const out: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    // frase sozinha maior que o máximo: corta duro (normas têm artigos longos)
    if (sentence.length > maxChars) {
      if (current) {
        out.push(current);
        current = "";
      }
      for (let i = 0; i < sentence.length; i += maxChars) {
        out.push(sentence.slice(i, i + maxChars).trim());
      }
      continue;
    }
    if (current.length + sentence.length + 1 > maxChars) {
      out.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) out.push(current);
  return out;
}
