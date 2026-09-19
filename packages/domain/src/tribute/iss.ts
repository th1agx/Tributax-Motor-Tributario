import { calculate, type TaxDecision } from "../decision/pipeline.js";
import type { SpecJson } from "../specification/spec.js";
import type { TaxRule } from "../decision/tax-rule.js";
import { DateRange } from "../shared/date-range.js";
import { TaxRate, Money } from "../shared/index.js";

/**
 * Módulo ISS (fase 4) — a lacuna declarada mais antiga do projeto.
 *
 * Regime de incidência (LC 116/2003):
 * - ISS é do MUNICÍPIO DO PRESTADOR (art. 3º, regra geral) — o contexto
 *   precisa de issuerMunicipality (IBGE 7 dígitos); sem ela, NO_RULE_FOUND.
 * - Alíquota: entre 2% e 5% (art. 8º-A), definida por lei municipal POR ITEM
 *   da lista anexa — tabela municipal é curadoria, mesma postura da TIPI.
 *   O catálogo traz municípios com alíquota geral marcada NEEDS_REVIEW.
 * - MEI: ISS recolhido em valor fixo no DAS-MEI (LC 123/06 art. 18-A) —
 *   sem regra própria.
 * - Simples Nacional: ISS dentro do DAS (anexos III/V) — sem regra própria.
 */

const VALID_FROM_2026 = () => DateRange.from(new Date("2026-01-01T00:00:00Z"));

/** Municípios catalogados: { ibge7: [nome, alíquotabp, base legal] }. */
const MUNICIPAL_RATES: Readonly<Record<string, readonly [string, number, string]>> = {
  "3550308": ["São Paulo", 290, "Lei 16.757/1996"],
  "3304557": ["Rio de Janeiro", 500, "Lei 1.884/1992 (banda máxima da LC 116)"],
  "3106200": ["Belo Horizonte", 300, "Lei 8.725/2003"],
};

export function issRuleCatalog(): TaxRule[] {
  const municipal: TaxRule[] = Object.entries(MUNICIPAL_RATES).map(([ibge, [nome, rateBp, lei]]) => ({
    id: `ISS-${ibge}-${rateBp}`,
    version: 1,
    tribute: "ISS" as const,
    name: `ISS ${nome} ${rateBp / 100}% (prestador)`,
    jurisdiction: { scope: "MUNICIPAL" as const, code: ibge },
    condition: andOf(
      pred("operationKindIs", { kind: "SERVICE_PROVISION" }),
      pred("issuerMunicipalityIs", { ibgeCode: ibge }),
      orOf(pred("regimeIs", { regime: "NORMAL" }), pred("regimeIs", { regime: "LUCRO_REAL" }), pred("regimeIs", { regime: "LUCRO_PRESUMIDO" })),
    ),
    effects: [{ type: "applyRate", rateBp }],
    priority: 0,
    validity: VALID_FROM_2026(),
    status: "ACTIVE" as const,
    origin: "LEGISLATION" as const,
    legalBasis: { documentType: "LEI_MUNICIPAL" as const, number: lei, year: "—", provision: "lista de serviços anexa à LC 116/03" },
    reviewReason: `alíquota geral de ${nome}; lista de itens da LC 116/03 pode ter alíquotas distintas (NEEDS_REVIEW)`,
  }));
  return [
    ...municipal,
    {
      id: "ISS-EXPORTACAO-NAO-INCIDE",
      version: 1,
      tribute: "ISS",
      name: "ISS não incide em exportação de serviço",
      jurisdiction: { scope: "FEDERAL" },
      condition: andOf(
        pred("operationKindIs", { kind: "EXPORT" }),
        pred("hasServiceCode"),
      ),
      effects: [{ type: "nonTaxable" }],
      priority: 10,
      validity: VALID_FROM_2026(),
      status: "ACTIVE",
      origin: "LEGISLATION",
      legalBasis: { documentType: "LEI_COMPLEMENTAR", number: "116", year: "2003", provision: "art. 2º, I" },
      reviewReason: "pressupõe resultado do serviço no exterior — validar caso a caso (NEEDS_REVIEW)",
    },
  ];
}

export interface IssDecision {
  readonly iss: TaxDecision;
}

export function calculateIssWith(
  ctx: Parameters<typeof calculate>[0]["ctx"],
  rules: readonly TaxRule[],
): IssDecision {
  const iss = calculate({ ctx, rules, tribute: "ISS" });

  // deduções legais da base (materiais fornecidos pelo prestador — LC 116/03):
  // o pipeline usa a base genérica de mercadorias; o ISS deduz materiais
  const deductions = ctx.items.reduce((acc, i) => acc + (i.issDeductionCents ?? 0), 0);
  let adjusted = iss;
  if (deductions > 0 && iss.outcome.kind === "TAXED") {
    const basisCents = Math.max(0, iss.outcome.basisCents - deductions);
    const rate = TaxRate.fromBasisPoints(iss.outcome.rateBp);
    const amount = rate.applyTo(Money.fromCents(basisCents)).cents;
    adjusted = {
      ...iss,
      outcome: { ...iss.outcome, basisCents, amountCents: amount },
      warnings: [...iss.warnings, `base do ISS reduzida em ${deductions} centavos por dedução legal de materiais (LC 116/03)`],
    };
  }

  // retenção na fonte PJ→PJ: sinalização honesta (a % é lei municipal)
  if (adjusted.outcome.kind === "TAXED" && ctx.recipientRole !== "FINAL_CONSUMER") {
    return {
      iss: {
        ...adjusted,
        warnings: [
          ...adjusted.warnings,
          "tomador é pessoa jurídica: retenção de ISS na fonte PODE se aplicar conforme lei municipal do serviço (NEEDS_REVIEW — confirmar no município)",
        ],
      },
    };
  }
  return { iss: adjusted };
}

export function calculateIss(ctx: Parameters<typeof calculate>[0]["ctx"]): IssDecision {
  return calculateIssWith(ctx, issRuleCatalog());
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
