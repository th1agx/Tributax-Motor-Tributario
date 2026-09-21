import type { NormChunk } from "../store/norm-store.js";

/**
 * ObservationExtractor (ADR-013): a LLM recebe apenas chunks recuperados e
 * preenche o MESMO contrato que o diffCatalog consome. Anti-alucinação em
 * três camadas, aplicadas em validateObservation:
 *   1. a alíquota citada precisa aparecer (como percentual) no texto do chunk;
 *   2. a fonte é SEMPRE a URL/data da norma de origem do chunk — a LLM não
 *      escolhe fontes;
 *   3. rejeições têm motivo explícito; nada é descartado em silêncio.
 */

/** Contrato idêntico ao WatchObservation do LegislationWatch (API). */
export interface ExtractedObservation {
  readonly tribute: string;
  readonly jurisdictionCode?: string;
  readonly rateBp: number;
  readonly validFrom: string; // YYYY-MM-DD
  readonly confidence: number; // [0, 1]
  readonly notes?: string;
  readonly ruleId?: string;
}

/** Observação validada + fonte primária amarrada ao chunk de origem. */
export interface SourcedObservation extends ExtractedObservation {
  readonly sources: readonly { url: string; publishedAt: string; excerpt: string }[];
}

export interface Rejection {
  readonly reason: string;
  readonly raw: unknown;
}

export interface ExtractionResult {
  readonly observations: readonly SourcedObservation[];
  readonly rejections: readonly Rejection[];
}

/** Port do LLM: um único método, JSON puro — adapter decide modelo/fornecedor. */
export interface LlmClient {
  /** Retorna o JSON decodificado da resposta do modelo (ou lança). */
  completeJson(prompt: string): Promise<unknown>;
}

export class LlmObservationExtractor {
  private readonly llm: LlmClient;

  constructor(llm: LlmClient) {
    this.llm = llm;
  }

  async extract(chunks: readonly NormChunk[]): Promise<ExtractionResult> {
    if (chunks.length === 0) return { observations: [], rejections: [] };

    const prompt = buildPrompt(chunks);
    const raw = await this.llm.completeJson(prompt);
    const candidates = toArray(raw);
    const chunkByUrl = new Map(chunks.map((c) => [c.url, c]));

    const observations: SourcedObservation[] = [];
    const rejections: Rejection[] = [];
    for (const candidate of candidates) {
      const validation = validateObservation(candidate, chunkByUrl);
      if (validation.ok) observations.push(validation.observation);
      else rejections.push(validation.rejection);
    }
    return { observations, rejections };
  }
}

function buildPrompt(chunks: readonly NormChunk[]): string {
  const docs = chunks
    .map((c, i) => `[CHUNK ${i}] url=${c.url} publicado=${c.publishedAt}\n${c.text}`)
    .join("\n\n---\n\n");
  return [
    "Você é um analista tributário. Para cada CHUNK abaixo, extraia alterações de alíquota tributária.",
    "Responda APENAS um array JSON; cada elemento:",
    '{"tribute":"ICMS|ISS|PIS|COFINS|IPI|...", "jurisdictionCode":"UF ou código IBGE (omitir se federal)",',
    '"rateBp": <alíquota em basis points, ex.: 18% = 1800, 4,65% = 465>,',
    '"validFrom":"YYYY-MM-DD", "confidence": <0 a 1>, "notes":"..." , "sourceUrl":"<url do chunk usado>"}',
    "Regras: use apenas o que está ESCRITO no chunk; não calcule nem deduza; se o chunk não traz",
    "alíquota aplicável, não o inclua. sourceUrl DEVE ser exatamente uma das urls dos chunks.",
    "",
    docs,
  ].join("\n");
}

type Validation = { ok: true; observation: SourcedObservation } | { ok: false; rejection: Rejection };

/** O prompt pede array, mas modelos às vezes embrulham em {"observations": [...]}. */
function toArray(raw: unknown): readonly unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const arr = (raw as Record<string, unknown>).observations;
    if (Array.isArray(arr)) return arr;
  }
  return [raw];
}

function validateObservation(raw: unknown, chunkByUrl: Map<string, NormChunk>): Validation {
  const reject = (reason: string): Validation => ({ ok: false, rejection: { reason, raw } });
  if (typeof raw !== "object" || raw === null) return reject("observação não é um objeto");

  const o = raw as Record<string, unknown>;
  const tribute = typeof o.tribute === "string" ? o.tribute.trim().toUpperCase() : "";
  if (!tribute) return reject("tribute ausente");

  // guarda 2: a fonte é amarrada ao chunk — sourceUrl precisa casar, e a
  // observação herda url/data da norma, nunca texto escolhido pela LLM.
  const sourceUrl = typeof o.sourceUrl === "string" ? o.sourceUrl : "";
  const chunk = chunkByUrl.get(sourceUrl);
  if (!chunk) return reject(`sourceUrl não corresponde a nenhum chunk: "${sourceUrl}"`);

  const rateBp = o.rateBp;
  if (typeof rateBp !== "number" || !Number.isInteger(rateBp) || rateBp <= 0 || rateBp > 100_000) {
    return reject(`rateBp inválido: ${String(rateBp)}`);
  }
  // guarda 1: o percentual precisa estar ESCRITO no chunk (pt-BR ou en-US).
  if (!rateAppearsInText(rateBp, chunk.text)) {
    return reject(`alíquota ${rateBp} bp (${formatPct(rateBp)}) não aparece no texto do chunk — possível alucinação`);
  }

  const validFrom = o.validFrom;
  if (typeof validFrom !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) {
    return reject(`validFrom inválido: ${String(validFrom)}`);
  }
  if (Number.isNaN(Date.parse(validFrom))) return reject(`validFrom não é data real: ${validFrom}`);
  // sanidade (auditoria 3.5): 1900 ou 2999 são datas válidas e sem sentido
  {
    const year = Number(validFrom.slice(0, 4));
    const maxYear = new Date().getUTCFullYear() + 5;
    if (year < 1990 || year > maxYear) {
      return reject(`validFora da janela de plausibilidade [1990, ${maxYear}]: ${validFrom}`);
    }
  }

  const confidence = o.confidence;
  if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
    return reject(`confidence fora de [0,1]: ${String(confidence)}`);
  }

  const jurisdictionCode = typeof o.jurisdictionCode === "string" && o.jurisdictionCode.trim() !== ""
    ? o.jurisdictionCode.trim().toUpperCase()
    : undefined;

  return {
    ok: true,
    observation: {
      tribute,
      ...(jurisdictionCode !== undefined ? { jurisdictionCode } : {}),
      rateBp,
      validFrom,
      confidence,
      ...(typeof o.notes === "string" && o.notes.trim() !== "" ? { notes: o.notes.trim() } : {}),
      ...(typeof o.ruleId === "string" && o.ruleId.trim() !== "" ? { ruleId: o.ruleId.trim() } : {}),
      sources: [{ url: chunk.url, publishedAt: chunk.publishedAt, excerpt: excerptOf(chunk.text) }],
    },
  };
}

/** 4,65% → "4,65" e "4.65"; 18% → "18", "18,00" e "18.00" (texto legal usa vírgula). */
function rateAppearsInText(rateBp: number, text: string): boolean {
  const pct = rateBp / 100;
  const variants = new Set<string>();
  if (Number.isInteger(pct)) {
    variants.add(String(pct));
    variants.add(`${pct},00`);
    variants.add(`${pct}.00`);
  } else {
    variants.add(pct.toFixed(2).replace(".", ","));
    variants.add(pct.toFixed(2));
  }
  return [...variants].some((v) => new RegExp(`(^|[^\\w.])${escapeRegex(v)}\\s*%`, "u").test(text));
}

function formatPct(rateBp: number): string {
  return `${(rateBp / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

function excerptOf(text: string, max = 280): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
