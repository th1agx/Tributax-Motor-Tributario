/**
 * TaxOutcome — estados fiscais semanticamente distintos (payload-spec §10).
 * Ausência de regra (NO_RULE_FOUND) NUNCA equivale a imposto zero.
 */
export type TributeId =
  | "ICMS" | "ICMS_ST" | "DIFAL" | "FCP" | "IPI" | "PIS" | "COFINS"
  | "ISS" | "IRRF" | "INSS" | "CSRF" | "IBS" | "CBS" | "DAS" | "STUB";

export interface TaxedOutcome {
  readonly kind: "TAXED";
  readonly basisCents: number;
  readonly rateBp: number;
  readonly amountCents: number;
  readonly legalBasis?: LegalBasisRef;
}

export type NonTaxedKind =
  | "EXEMPT" | "IMMUNE" | "NON_TAXABLE" | "ZERO_RATED"
  | "SUSPENDED" | "DEFERRED" | "RETAINED";

export interface NonTaxedOutcome {
  readonly kind: NonTaxedKind;
  /** Obrigatório: todo estado não-tributado exige fundamento legal. */
  readonly legalBasis: LegalBasisRef;
}

export interface NoRuleOutcome {
  readonly kind: "NO_RULE_FOUND";
  /** Diagnóstico das regras avaliadas e por que nenhuma casou. */
  readonly evaluatedRules: readonly EvaluatedRule[];
}

export type TaxOutcome = TaxedOutcome | NonTaxedOutcome | NoRuleOutcome;

export interface LegalBasisRef {
  readonly documentType:
    | "LEI" | "LEI_COMPLEMENTAR" | "DECRETO" | "CONVENIO" | "AJUSTE_SINIEF"
    | "ATO_COTEPE" | "INSTRUCAO_NORMATIVA" | "RESOLUCAO" | "REGULAMENTO_ESTADUAL"
    | "LEI_MUNICIPAL" | "CONSTITUICAO";
  readonly number: string;
  readonly year: string;
  readonly provision?: string; // "art. 99, §2º, XI"
}

export interface EvaluatedRule {
  readonly ruleId: string;
  readonly ruleVersion: number;
  readonly matched: boolean;
  readonly reason: string;
}

export function isTaxed(outcome: TaxOutcome): outcome is TaxedOutcome {
  return outcome.kind === "TAXED";
}

export function isNoRule(outcome: TaxOutcome): outcome is NoRuleOutcome {
  return outcome.kind === "NO_RULE_FOUND";
}
