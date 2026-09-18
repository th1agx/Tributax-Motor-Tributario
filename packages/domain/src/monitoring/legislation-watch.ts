import type { LegalBasisRef, TributeId } from "../decision/tax-outcome.js";

/**
 * LegislationWatch (ADR-012) — tipos do contexto de monitoração legislativa.
 * O agente de IA produz ALERTAS e PROPOSTAS; aprovação é sempre humana.
 * Este módulo é consumidor do RuleCatalog via port — o core de decisão
 * nunca conhece a IA nem o agendador.
 */

/** Notificação: "algo pode ter mudado". É o piso — sempre seguro. */
export interface LegislationAlert {
  readonly id: string;
  readonly detectedAt: Date;
  readonly tribute: TributeId;
  readonly jurisdictionCode?: string; // UF ou município IBGE
  readonly summary: string;
  readonly sources: readonly LegislationSource[];
  readonly confidence: number; // [0, 1]
  readonly status: "OPEN" | "TRIAGED" | "DISMISSED" | "ACTIONED";
}

/** Proposta: rascunho de alteração no catálogo, com diff e fundamento. */
export interface LegislationChangeProposal {
  readonly id: string;
  readonly alertId?: string;
  readonly createdAt: Date;
  readonly proposedBy: "AI_AGENT" | "HUMAN";
  readonly diff: readonly CatalogDiff[];
  readonly legalBasis: LegalBasisRef;
  readonly sources: readonly LegislationSource[];
  readonly confidence: number;
  readonly status: "DRAFT" | "REVIEW" | "APPROVED" | "REJECTED";
  /** Invariante ADR-012: IA nunca produz APPROVED — transição exige humano. */
}

export interface LegislationSource {
  readonly url: string;
  readonly publishedAt: Date;
  readonly excerpt: string;
}

export type CatalogDiff =
  | { readonly kind: "RATE_CHANGED"; readonly field: string; readonly from: number; readonly to: number }
  | { readonly kind: "VALIDITY_EXTENDED"; readonly ruleId: string; readonly newEnd?: string }
  | { readonly kind: "RULE_ADDED"; readonly ruleId: string }
  | { readonly kind: "RULE_REVOKED"; readonly ruleId: string }
  | { readonly kind: "FIELD_CHANGED"; readonly field: string; readonly from: unknown; readonly to: unknown };

/** Invariante de workflow (enforced na aplicação, testada no domínio). */
export function canApprove(proposal: LegislationChangeProposal, actor: "AI_AGENT" | "HUMAN"): boolean {
  return actor === "HUMAN";
}
