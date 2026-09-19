import { calculate, type TaxDecision } from "../decision/pipeline.js";
import type { SpecJson } from "../specification/spec.js";
import type { TaxRule } from "../decision/tax-rule.js";
import { DateRange } from "../shared/date-range.js";

/**
 * Módulo CBS/IBS — LC 214/2025, alíquotas-teste do período transatório
 * (ADR-015). Em 2026: CBS 0,9% (federal) e IBS 0,1% (destino), compensáveis
 * com PIS/COFINS e ICMS; apenas contribuintes dos tributos substituídos
 * (aqui: regimes NORMAL/LUCRO_REAL/LUCRO_PRESUMIDO). Optantes do Simples
 * Nacional/MEI só entram nas alíquotas-teste a partir de 2027 — sem regra
 * em 2026 (NO_RULE_FOUND honesto).
 *
 * Vigência EXPLÍCITA até 2026-12-31: de 2027 em diante as alíquotas mudam
 * (0,9→1,2 / 0,1→0,5) e o motor responde NO_RULE_FOUND até curadoria nova —
 * nunca extrapola vigência por conta própria.
 */

const TEST_RATES_2026 = () => DateRange.from(
  new Date("2026-01-01T00:00:00Z"),
  new Date("2027-01-01T00:00:00Z"),
);

const CONTRIBUINTES_SUBSTITUIDOS = () =>
  orOf(
    pred("regimeIs", { regime: "NORMAL" }),
    pred("regimeIs", { regime: "LUCRO_REAL" }),
    pred("regimeIs", { regime: "LUCRO_PRESUMIDO" }),
  );

export function ibsCbsRuleCatalog(): TaxRule[] {
  return [
    testRate("CBS", "CBS-TESTE-2026-090", 90, "arts. 332, I"),
    testRate("IBS", "IBS-TESTE-2026-010", 10, "arts. 332, II e 333"),
  ];
}

function testRate(tribute: "CBS" | "IBS", id: string, rateBp: number, provision: string): TaxRule {
  return {
    id,
    version: 1,
    tribute,
    name: `${tribute} alíquota-teste ${rateBp / 100}% (2026)`,
    jurisdiction: tribute === "CBS" ? { scope: "FEDERAL" } : { scope: "STATE" },
    condition: andOf(CONTRIBUINTES_SUBSTITUIDOS()),
    effects: [{ type: "applyRate", rateBp }],
    priority: 0,
    validity: TEST_RATES_2026(),
    status: "ACTIVE",
    origin: "LEGISLATION",
    legalBasis: { documentType: "LEI_COMPLEMENTAR", number: "214", year: "2025", provision },
    reviewReason: tribute === "IBS"
      ? "split payment do IBS não modelado (opcional em 2026, obrigatório depois); arrecadação 100% destino (NEEDS_REVIEW)"
      : "compensação com PIS/COFINS não modelada no cálculo (NEEDS_REVIEW)",
  };
}

export interface IbsCbsDecision {
  readonly cbs: TaxDecision;
  readonly ibs: TaxDecision;
}

export function calculateIbsCbsWith(
  ctx: Parameters<typeof calculate>[0]["ctx"],
  rules: readonly TaxRule[],
): IbsCbsDecision {
  return {
    cbs: calculate({ ctx, rules, tribute: "CBS" }),
    // split payment do IBS: opcional em 2026, obrigatório na adesão futura —
    // o cálculo não muda, mas a operação precisa saber (aviso, não erro)
    ibs: withSplitPaymentWarning(calculate({ ctx, rules, tribute: "IBS" })),
  };
}

function withSplitPaymentWarning(d: TaxDecision): TaxDecision {
  if (d.outcome.kind !== "TAXED") return d;
  return {
    ...d,
    warnings: [
      ...d.warnings,
      "IBS: split payment (retenção na liquidação financeira) é OPCIONAL nas alíquotas-teste de 2026 e obrigatório na fase seguinte (LC 214/25) — validar fluxo de recebimento",
    ],
  };
}

export function calculateIbsCbs(ctx: Parameters<typeof calculate>[0]["ctx"]): IbsCbsDecision {
  return calculateIbsCbsWith(ctx, ibsCbsRuleCatalog());
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
