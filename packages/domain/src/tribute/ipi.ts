import { calculate, type TaxDecision } from "../decision/pipeline.js";
import type { SpecJson } from "../specification/spec.js";
import type { TaxRule } from "../decision/tax-rule.js";
import { DateRange } from "../shared/date-range.js";

/**
 * Módulo IPI (fase 3) — incidência sobre produtos industrializados.
 *
 * Princípio de honestidade do projeto: a TIPI é uma tabela por NCM com
 * centenas de alíquotas; catalogá-la inteira é trabalho de curadoria,
 * não de invenção. O catálogo traz as regras SOLIDAMENTE conhecidas e o
 * resto fica NO_RULE_FOUND (explícito) com reviewReason na regra-guarda:
 *
 * - Serviços: NÃO incide IPI (Lei 4.502/1964, art. 2º, I — fato gerador é
 *   industrialização/ circulação de produto industrializado).
 * - Exportação: imune (CF/88 art. 153, §3º, III).
 * - Medicamentos (NCM cap. 30): alíquota zero na TIPI (estável).
 * - Venda interna de produto industrializado sem NCM catalogada: sem regra —
 *   NO_RULE_FOUND é a resposta honesta até a TIPI ser curada (fase futura).
 */

const VALID_FROM_2026 = () => DateRange.from(new Date("2026-01-01T00:00:00Z"));

export function ipiRuleCatalog(): TaxRule[] {
  return [
    {
      id: "IPI-SERVICO-NAO-INCIDE",
      version: 1,
      tribute: "IPI",
      name: "IPI não incide sobre serviços",
      jurisdiction: { scope: "FEDERAL" },
      condition: andOf(pred("operationKindIs", { kind: "SERVICE_PROVISION" })),
      effects: [{ type: "nonTaxable" }],
      priority: 10,
      validity: VALID_FROM_2026(),
      status: "ACTIVE",
      origin: "LEGISLATION",
      legalBasis: { documentType: "LEI", number: "4.502", year: "1964", provision: "art. 2º, I" },
    },
    {
      id: "IPI-EXPORTACAO-IMUNE",
      version: 1,
      tribute: "IPI",
      name: "IPI imune na exportação",
      jurisdiction: { scope: "FEDERAL" },
      condition: andOf(pred("operationKindIs", { kind: "EXPORT" })),
      effects: [{ type: "exempt" }],
      priority: 10,
      validity: VALID_FROM_2026(),
      status: "ACTIVE",
      origin: "LEGISLATION",
      legalBasis: { documentType: "CONSTITUICAO", number: "CF/88", year: "1988", provision: "art. 153, §3º, III" },
    },
    {
      id: "IPI-MEDICAMENTOS-ZERO",
      version: 1,
      tribute: "IPI",
      name: "IPI alíquota zero — medicamentos (NCM cap. 30)",
      jurisdiction: { scope: "FEDERAL" },
      condition: andOf(
        pred("operationKindIs", { kind: "SALE_GOODS" }),
        pred("ncmStartsWith", { prefix: "30" }),
        orOf(pred("regimeIs", { regime: "NORMAL" }), pred("regimeIs", { regime: "LUCRO_REAL" }), pred("regimeIs", { regime: "LUCRO_PRESUMIDO" })),
      ),
      effects: [{ type: "applyRate", rateBp: 0 }],
      priority: 0,
      validity: VALID_FROM_2026(),
      status: "ACTIVE",
      origin: "LEGISLATION",
      legalBasis: { documentType: "DECRETO", number: "TIPI", year: "2024", provision: "cap. 30 (alíquota zero)" },
      reviewReason: "TIPI por NCM completa é curadoria futura; confirmar ano da TIPI vigente (NEEDS_REVIEW)",
    },
  ];
}

export interface IpiDecision {
  readonly ipi: TaxDecision;
}

export function calculateIpiWith(
  ctx: Parameters<typeof calculate>[0]["ctx"],
  rules: readonly TaxRule[],
): IpiDecision {
  return { ipi: calculate({ ctx, rules, tribute: "IPI" }) };
}

export function calculateIpi(ctx: Parameters<typeof calculate>[0]["ctx"]): IpiDecision {
  return calculateIpiWith(ctx, ipiRuleCatalog());
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
