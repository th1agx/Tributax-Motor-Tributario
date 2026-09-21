import { calculate, type TaxDecision } from "../decision/pipeline.js";
import type { SpecJson } from "../specification/spec.js";
import type { TaxRule } from "../decision/tax-rule.js";
import { DateRange } from "../shared/date-range.js";

/**
 * Módulo DAS — Simples Nacional (LC 123/2006, Anexo I pós-unificação 2023).
 *
 * - Faixas por RBT12 (receita bruta 12 meses); alíquota EFETIVA =
 *   (RBT12 × nominal − dedução) / RBT12 aplicada à receita da operação.
 *   O Anexo I TEM coluna "valor a deduzir" (correção 2026-09 — a afirmação
 *   anterior de que não tinha estava errada e produziu erro de até +91%).
 * - Exige rbt12Cents no contexto: sem RBT12, nenhuma faixa casa e o motor
 *   responde NO_RULE_FOUND (honesto — nunca assume a 1ª faixa por conta própria).
 * - MEI NÃO entra: DAS-MEI é valor fixo mensal (percentual do salário mínimo
 *   + ICMS/ISS fixos), não alíquota por operação. Sem regra própria.
 * - Anexos III/V (serviços com repartição de ISS) e a partilha por tributo
 *   dentro do DAS: fase futura, NEEDS_REVIEW declarado.
 */

const VALID_FROM_2026 = () => DateRange.from(new Date("2026-01-01T00:00:00Z"));

/**
 * [RBT12 mínimo (centavos), máximo exclusive, alíquota nominal bp, dedução cents]
 * — Anexo I da LC 123/2006 (redação da LC 155/2016, vigência 01/01/2018),
 * conferido contra o texto no Planalto. TODAS as faixas têm "valor a deduzir".
 */
const ANEXO_I: readonly (readonly [number, number, number, number])[] = [
  [0, 18_000_000, 400, 0],            // até 180k: 4,00% / –
  [18_000_000, 36_000_000, 730, 594_000],   // 180–360k: 7,30% / 5.940
  [36_000_000, 72_000_000, 950, 1_386_000], // 360–720k: 9,50% / 13.860
  [72_000_000, 180_000_000, 1070, 2_250_000], // 720k–1,8M: 10,70% / 22.500
  [180_000_000, 360_000_000, 1430, 8_730_000], // 1,8–3,6M: 14,30% / 87.300
  [360_000_000, 480_000_000, 1900, 37_800_000], // 3,6–4,8M: 19,00% / 378.000
];
// Nota: NÃO existe 7ª faixa no Anexo I — a faixa "22,5%" foi removida
// (era invenção; os sublimites de ICMS/ISS são outro instituto).

/**
 * Anexo III (serviços, LC 123/06): alíquota NOMINAL + DEDUÇÃO por faixa —
 * a efetiva depende do RBT12 (efeito applyDasAnexo). Anexo V
 * (industrialização por encomenda) depende do CNAE e fica declarado como
 * NEEDS_REVIEW, não inventado.
 */
const ANEXO_III: readonly (readonly [number, number, number, number])[] = [
  // [RBT12 min cents, max exclusive, nominal bp, dedução cents]
  // Limites de faixa IGUAIS aos do Anexo I (LC 123/06, LC 155/16).
  [0, 18_000_000, 600, 0],          // 6%
  [18_000_000, 36_000_000, 1120, 936_000],   // 11,2% – 9.360
  [36_000_000, 72_000_000, 1350, 1_764_000], // 13,5% – 17.640
  [72_000_000, 180_000_000, 1600, 3_564_000], // 16% – 35.640
  [180_000_000, 360_000_000, 2100, 12_564_000], // 21% – 125.640
  [360_000_000, 480_000_000, 3300, 64_800_000], // 33% – 648.000
];

export function simplesDasRuleCatalog(): TaxRule[] {
  return [...anexoIRules(), ...anexoIII2Rules()];
}

function anexoIRules(): TaxRule[] {
  return ANEXO_I.map(([min, max, nominalBp, ded], i) => ({
    id: `DAS-ANEXO1-F${i + 1}-${nominalBp}`,
    version: 1,
    tribute: "DAS",
    name: `DAS Simples Anexo I — ${nominalBp / 100}% nominal (faixa ${i + 1})`,
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
    effects: [{ type: "applyDasAnexo", nominalBp, deductionCents: ded }],
    priority: 0,
    validity: VALID_FROM_2026(),
    status: "ACTIVE",
    origin: "LEGISLATION",
    legalBasis: { documentType: "LEI_COMPLEMENTAR", number: "123", year: "2006", provision: `Anexo I, faixa ${i + 1} (redação LC 155/2016)` },
  }));
}

function anexoIII2Rules(): TaxRule[] {
  return ANEXO_III.map(([min, max, nominalBp, ded], i) => ({
    id: `DAS-ANEXO3-F${i + 1}-${nominalBp}`,
    version: 1,
    tribute: "DAS",
    name: `DAS Simples Anexo III — ${nominalBp / 100}% nominal (faixa ${i + 1})`,
    jurisdiction: { scope: "FEDERAL" },
    condition: {
      kind: "and",
      children: [
        { kind: "predicate", predicate: "regimeIs", args: { regime: "SIMPLES_NACIONAL" } },
        { kind: "predicate", predicate: "operationKindIs", args: { kind: "SERVICE_PROVISION" } },
        { kind: "predicate", predicate: "hasServiceCode" },
        ...(min > 0
          ? ([{ kind: "predicate", predicate: "rbt12AtLeast", args: { cents: min } }] satisfies import("../specification/spec.js").SpecJson[])
          : []),
        { kind: "predicate", predicate: "rbt12Below", args: { cents: max } },
      ],
    },
    effects: [{ type: "applyDasAnexo", nominalBp, deductionCents: ded }],
    priority: 0,
    validity: VALID_FROM_2026(),
    status: "ACTIVE",
    origin: "LEGISLATION",
    legalBasis: { documentType: "LEI_COMPLEMENTAR", number: "123", year: "2006", provision: `Anexo III, faixa ${i + 1}` },
    reviewReason: "Anexo V (industrialização por encomenda) depende do CNAE — não distinguido aqui (NEEDS_REVIEW)",
  }));
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
