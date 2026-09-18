import type { DateRange } from "../shared/date-range.js";
import type { SpecJson } from "../specification/spec.js";
import type { LegalBasisRef, TributeId } from "./tax-outcome.js";

/**
 * TaxRule — regra fiscal como dado (ADR-004). Persistida e versionada;
 * o motor apenas a interpreta.
 */
export type RuleStatus =
  | "DRAFT" | "REVIEW" | "APPROVED" | "ACTIVE" | "DEPRECATED" | "REVOKED";

export type JurisdictionScope = "FEDERAL" | "STATE" | "MUNICIPAL";

export interface Jurisdiction {
  readonly scope: JurisdictionScope;
  /** UF (estado) ou código IBGE do município; undefined para FEDERAL. */
  readonly code?: string;
}

export type RuleEffect =
  | { readonly type: "applyRate"; readonly rateBp: number }
  | { readonly type: "reduceBasis"; readonly pctBp: number }
  | { readonly type: "exempt" }
  | { readonly type: "nonTaxable" }
  | { readonly type: "zeroRate" };

export interface TaxRule {
  readonly id: string;
  readonly version: number;
  readonly tribute: TributeId;
  readonly name: string;
  readonly description?: string;
  readonly jurisdiction: Jurisdiction;
  readonly condition: SpecJson;
  readonly effects: readonly RuleEffect[];
  readonly priority: number;
  readonly validity: DateRange;
  readonly status: RuleStatus;
  readonly legalBasis?: LegalBasisRef;
  readonly origin: "LEGISLATION" | "MANUAL" | "IMPORTED";
}

export const ENGINE_VERSION = "0.1.0-phase0";
