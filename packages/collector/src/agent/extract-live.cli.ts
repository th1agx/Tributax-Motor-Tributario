/**
 * Prova ao vivo da PERNA DE EXTRAÇÃO com LLM real (Gemini free tier):
 * um chunk de norma municipal real (formato Querido Diário) → prompt do
 * extrator → guardrails → observações. Uso:
 *   GEMINI_API_KEY=... npx tsx src/agent/extract-live.cli.ts
 */
import { LlmObservationExtractor } from "../extract/observation-extractor.js";
import { GeminiChatClient } from "../rag/gemini.js";

const chunk = {
  id: "QD|3106200|2026-09-28|teste",
  normId: "QD|3106200|2026-09-28|teste",
  url: "https://data.queridodiario.ok.org.br/3106200/2026-09-28/teste.pdf",
  publishedAt: "2026-09-28T12:00:00.000Z",
  text: [
    "Belo Horizonte/MG — diário de 2026-09-28",
    "DECRETO Nº 48.000, DE 25 DE SETEMBRO DE 2026.",
    "Altera a alíquota do Imposto Sobre Serviços de Qualquer Natureza - ISSQN",
    "para os serviços de consultoria. Art. 1º A alíquota do ISSQN passa a 3% a",
    "partir de 1º de outubro de 2026.",
  ].join("\n"),
};

const extractor = new LlmObservationExtractor(new GeminiChatClient());
const { observations, rejections } = await extractor.extract([chunk]);

console.log(`observações: ${observations.length} | rejeitadas: ${rejections.length}`);
for (const o of observations) {
  console.log(`  ✓ ${o.tribute} ${o.jurisdictionCode ?? "(federal)"} rateBp=${o.rateBp} validFrom=${o.validFrom} conf=${o.confidence}`);
  console.log(`    fonte: ${o.sources[0]?.url} (${o.sources[0]?.publishedAt})`);
}
for (const r of rejections) console.log(`  ✗ rejeitada: ${r.reason}`);
