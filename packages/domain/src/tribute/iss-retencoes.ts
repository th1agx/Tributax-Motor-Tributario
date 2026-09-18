import { calculate, type TaxDecision } from "../decision/pipeline.js";
import type { SpecJson } from "../specification/spec.js";
import type { TaxRule } from "../decision/tax-rule.js";
import { DateRange } from "../shared/date-range.js";

/**
 * Módulo ISS + retenções federais na NFS-e (Fase 2).
 *
 * Retenções federais em serviços prestados PJ → PJ (tomador pessoa
 * jurídica retém na fonte):
 * - IRRF 1,5% (Lei 9.430/1996, art. 67 — provision a confirmar, NEEDS_REVIEW)
 * - CSRF 4,65% = PIS 0,65% + COFINS 3% + CSLL 1%
 *   (Lei 10.833/2003 arts. 30 e 36; Lei 10.637/2002; CSLL Lei 9.430/96)
 *
 * Cobertura honesta:
 * - MEI: não sofre retenção federal em serviços (rendimentos isentos no
 *   limite) e o ISS é valor fixo no DAS-MEI — SEM regra por operação
 *   (NO_RULE_FOUND documentado).
 * - ISS por município (LC 116/2003, faixa 2%–5% definida em lei municipal):
 *   sem tabela municipal catalogada ainda — lacuna declarada, nunca chute.
 */

const VALID_FROM_2026 = () => DateRange.from(new Date("2026-01-01T00:00:00Z"));

/** Prestador PJ de regime não-Sujeito-a-DAS, tomador PJ (retém na fonte). */
const RETENTION_CONDITION: SpecJson = andOf(
  pred("operationKindIs", { kind: "SERVICE_PROVISION" }),
  pred("recipientRoleIs", { role: "CONTRIBUTOR" }),
  orOf(
    pred("regimeIs", { regime: "NORMAL" }),
    pred("regimeIs", { regime: "LUCRO_PRESUMIDO" }),
    pred("regimeIs", { regime: "LUCRO_REAL" }),
  ),
);

export function issRetentionRuleCatalog(): TaxRule[] {
  return [
    {
      id: "IRRF-SERV-150",
      version: 1,
      tribute: "IRRF",
      name: "IRRF 1,5% sobre serviços PJ → PJ",
      jurisdiction: { scope: "FEDERAL" },
      condition: RETENTION_CONDITION,
      effects: [{ type: "applyRate", rateBp: 150 }],
      priority: 0,
      validity: VALID_FROM_2026(),
      status: "ACTIVE",
      origin: "LEGISLATION",
      legalBasis: { documentType: "LEI", number: "9.430", year: "1996", provision: "art. 67" },
      reviewReason: "artigo exato do IRRF-serviços a confirmar (RIR/2018 art. 711 alternativo) (NEEDS_REVIEW)",
    },
    {
      id: "CSRF-SERV-465",
      version: 1,
      tribute: "CSRF",
      name: "CSRF 4,65% (PIS 0,65 + COFINS 3,0 + CSLL 1,0) serviços PJ → PJ",
      jurisdiction: { scope: "FEDERAL" },
      condition: RETENTION_CONDITION,
      effects: [{ type: "applyRate", rateBp: 465 }],
      priority: 0,
      validity: VALID_FROM_2026(),
      status: "ACTIVE",
      origin: "LEGISLATION",
      legalBasis: { documentType: "LEI", number: "10.833", year: "2003", provision: "arts. 30 e 36" },
      reviewReason: "decomposição interna PIS/COFINS/CSLL a detalhar por tributo (NEEDS_REVIEW)",
    },
  ];
}

export interface IssRetentionDecision {
  readonly irrf: TaxDecision;
  readonly csrf: TaxDecision;
}

export function calculateIssRetentionsWith(
  ctx: Parameters<typeof calculate>[0]["ctx"],
  rules: readonly TaxRule[],
): IssRetentionDecision {
  return {
    irrf: calculate({ ctx, rules, tribute: "IRRF" }),
    csrf: calculate({ ctx, rules, tribute: "CSRF" }),
  };
}

export function calculateIssRetentions(ctx: Parameters<typeof calculate>[0]["ctx"]): IssRetentionDecision {
  return calculateIssRetentionsWith(ctx, issRetentionRuleCatalog());
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
