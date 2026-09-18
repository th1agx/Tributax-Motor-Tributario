import { calculate, type TaxDecision } from "../decision/pipeline.js";
import type { SpecJson } from "../specification/spec.js";
import type { TaxRule } from "../decision/tax-rule.js";
import { DateRange } from "../shared/date-range.js";

/**
 * Módulo PIS/COFINS (Fase 2) — mesmo padrão do ICMS: catálogo como dado,
 * pipeline genérico decide.
 *
 * Alíquotas:
 * - NÃO CUMULATIVO (NORMAL/LUCRO_REAL): PIS 1,65% (Lei 10.637/2002, art. 8º)
 *   e COFINS 7,6% (Lei 10.833/2003, art. 2º? — provision marcada NEEDS_REVIEW).
 * - CUMULATIVO (LUCRO_PRESUMIDO e afins): PIS 0,65% e COFINS 3%
 *   (Lei 9.718/1998 — artigos a confirmar, NEEDS_REVIEW).
 * - SIMPLES NACIONAL/MEI: PIS/COFINS dentro do DAS — sem regra própria
 *   (NO_RULE_FOUND honesto; alíquota DAS por anexo é fase futura).
 * - Base de cálculo simplificada: valor dos itens (regras de exclusões do
 *   art. 3º da Lei 10.833/03 — ICMS destacado, IPI quando devido —
 *   modeladas quando IPI existir; NEEDS_REVIEW).
 */

const VALID_FROM_2026 = () => DateRange.from(new Date("2026-01-01T00:00:00Z"));

export function pisCofinsRuleCatalog(): TaxRule[] {
  return [
    nonCumulative("PIS", "PIS-NAOCUM-165", 165),
    nonCumulative("COFINS", "COFINS-NAOCUM-760", 760),
    cumulative("PIS", "PIS-CUM-065", 65),
    cumulative("COFINS", "COFINS-CUM-300", 300),
  ];
}

function nonCumulative(tribute: "PIS" | "COFINS", id: string, rateBp: number): TaxRule {
  return {
    id,
    version: 1,
    tribute,
    name: `${tribute} não cumulativo ${rateBp / 100}%`,
    jurisdiction: { scope: "FEDERAL" },
    condition: andOf(
      orOf(pred("regimeIs", { regime: "NORMAL" }), pred("regimeIs", { regime: "LUCRO_REAL" })),
    ),
    effects: [{ type: "applyRate", rateBp }],
    priority: 0,
    validity: VALID_FROM_2026(),
    status: "ACTIVE",
    origin: "LEGISLATION",
    legalBasis: tribute === "PIS"
      ? { documentType: "LEI", number: "10.637", year: "2002", provision: "art. 8º, I" }
      : { documentType: "LEI", number: "10.833", year: "2003", provision: "art. 2º" },
    reviewReason: "base de cálculo simplificada (exclusões da Lei 10.833/03 art. 3º a modelar) (NEEDS_REVIEW)",
  };
}

function cumulative(tribute: "PIS" | "COFINS", id: string, rateBp: number): TaxRule {
  return {
    id,
    version: 1,
    tribute,
    name: `${tribute} cumulativo ${rateBp / 100}%`,
    jurisdiction: { scope: "FEDERAL" },
    condition: andOf(
      pred("regimeIs", { regime: "LUCRO_PRESUMIDO" }),
    ),
    effects: [{ type: "applyRate", rateBp }],
    priority: 0,
    validity: VALID_FROM_2026(),
    status: "ACTIVE",
    origin: "LEGISLATION",
    legalBasis: { documentType: "LEI", number: "9.718", year: "1998", provision: "arts. 8º e 10º" },
    reviewReason: "artigos da Lei 9.718/98 a confirmar para o tributo específico (NEEDS_REVIEW)",
  };
}

export interface PisCofinsDecision {
  readonly pis: TaxDecision;
  readonly cofins: TaxDecision;
}

export function calculatePisCofinsWith(
  ctx: Parameters<typeof calculate>[0]["ctx"],
  rules: readonly TaxRule[],
): PisCofinsDecision {
  return {
    pis: calculate({ ctx, rules, tribute: "PIS" }),
    cofins: calculate({ ctx, rules, tribute: "COFINS" }),
  };
}

export function calculatePisCofins(ctx: Parameters<typeof calculate>[0]["ctx"]): PisCofinsDecision {
  return calculatePisCofinsWith(ctx, pisCofinsRuleCatalog());
}

function pred(predicate: string, args?: Record<string, unknown>): SpecJson {
  return { kind: "predicate", predicate, ...(args ? { args } : {}) };
}
function andOf(...children: SpecJson[]): SpecJson {
  return { kind: "and", children };
}
function orOf(...children: SpecJson[]): SpecJson {
  return { kind: "or", children };
}
