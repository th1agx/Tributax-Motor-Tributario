import { calculate, type TaxDecision } from "../decision/pipeline.js";
import type { SpecJson } from "../specification/spec.js";
import type { TaxRule } from "../decision/tax-rule.js";
import { DateRange } from "../shared/date-range.js";

/**
 * Módulo DAS — Simples Nacional (LC 123/2006, Anexo I pós-unificação 2023).
 *
 * - Faixas por RBT12 (receita bruta 12 meses); alíquota NOMINAL aplicada à
 *   receita da operação (Anexo I não tem dedução, diferente do III/V).
 * - Exige rbt12Cents no contexto: sem RBT12, nenhuma faixa casa e o motor
 *   responde NO_RULE_FOUND (honesto — nunca assume a 1ª faixa por conta própria).
 * - MEI NÃO entra: DAS-MEI é valor fixo mensal (percentual do salário mínimo
 *   + ICMS/ISS fixos), não alíquota por operação. Sem regra própria.
 * - Anexos III/V (serviços com repartição de ISS) e a partilha por tributo
 *   dentro do DAS: fase futura, NEEDS_REVIEW declarado.
 */

const VALID_FROM_2026 = () => DateRange.from(new Date("2026-01-01T00:00:00Z"));

/** [RBT12 mínimo (centavos), máximo exclusive, alíquota bp] — Anexo I, LC 123/06. */
const FAIXAS: readonly (readonly [number, number, number])[] = [
  [0, 18_000_000, 400],        // até 180k: 4%
  [18_000_000, 36_000_000, 730],   // 180–360k: 7,3%
  [36_000_000, 54_000_000, 950],   // 360–540k: 9,5%
  [54_000_000, 72_000_000, 1070],  // 540–720k: 10,7%
  [72_000_000, 180_000_000, 1430], // 720k–1,8M: 14,3%
  [180_000_000, 360_000_000, 1900],// 1,8–3,6M: 19%
];

/** 7ª faixa (3,6–4,8M): 22,5% pós-reforma 2023 — com revisão declarada. */
const SETIMA: readonly (readonly [number, number, number])[] = [[360_000_000, 480_000_000, 2250]];

export function simplesDasRuleCatalog(): TaxRule[] {
  const rules = FAIXAS.map((f) => faixaRule(f)).flat();
  return [...rules, ...SETIMA.map((f) => faixaRule(f, true))];
}

function faixaRule([min, max, rateBp]: readonly [number, number, number], review = false): TaxRule {
  const faixa = FAIXAS.findIndex((f) => f[2] === rateBp) + 1 || (review ? 7 : 0);
  return {
    id: `DAS-ANEXO1-F${faixa}-${rateBp}`,
    version: 1,
    tribute: "DAS",
    name: `DAS Simples Anexo I — ${rateBp / 100}% (faixa ${faixa})`,
    jurisdiction: { scope: "FEDERAL" },
    condition: {
      kind: "and",
      children: [
        { kind: "predicate", predicate: "regimeIs", args: { regime: "SIMPLES_NACIONAL" } },
        ...(min > 0
          ? ([{ kind: "predicate", predicate: "rbt12AtLeast", args: { cents: min } }] satisfies SpecJson[])
          : []),
        { kind: "predicate", predicate: "rbt12Below", args: { cents: max } },
      ],
    } satisfies SpecJson,
    effects: [{ type: "applyRate", rateBp }],
    priority: 0,
    validity: VALID_FROM_2026(),
    status: "ACTIVE",
    origin: "LEGISLATION",
    legalBasis: { documentType: "LEI_COMPLEMENTAR", number: "123", year: "2006", provision: `Anexo I, faixa ${faixa}` },
    ...(review ? { reviewReason: "7ª faixa (22,5%) pós-reforma 2023 — conferir vigência e sublimite (NEEDS_REVIEW)" } : {}),
  };
}

export interface SimplesDasDecision {
  readonly das: TaxDecision;
}

export function calculateSimplesDasWith(
  ctx: Parameters<typeof calculate>[0]["ctx"],
  rules: readonly TaxRule[],
): SimplesDasDecision {
  return { das: calculate({ ctx, rules, tribute: "DAS" }) };
}

export function calculateSimplesDas(ctx: Parameters<typeof calculate>[0]["ctx"]): SimplesDasDecision {
  return calculateSimplesDasWith(ctx, simplesDasRuleCatalog());
}
