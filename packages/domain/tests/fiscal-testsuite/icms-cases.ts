import type { FiscalContext } from "../../src/decision/fiscal-context.js";
import { makeCtx } from "../helpers.js";

/**
 * Fiscal Test Suite (ADR-010) — casos de regressão COMO DADO.
 * Cada caso: input, resultado esperado, fundamento legal, vigência.
 * CI falha se comportamento validado mudar sem bump de regra/motor.
 */
export interface IcmsTestCase {
  readonly id: string;
  readonly name: string;
  readonly given: FiscalContext;
  readonly expect: {
    readonly icmsAmountCents?: number;
    readonly icmsRateBp?: number;
    readonly icmsOutcomeKind?: string;
    readonly difalAmountCents?: number;
    readonly difalOriginCents?: number;
    readonly difalDestinationCents?: number;
    readonly hasDifal?: boolean;
    readonly fcpAmountCents?: number;
  };
  readonly legalBasis: string;
  readonly effectiveFrom: string;
}

const base = { operationKind: "SALE_GOODS", fiscalDocumentType: "NFE" } as const;

export const ICMS_CASES: readonly IcmsTestCase[] = [
  {
    id: "ICMS-CASE-001",
    name: "Venda interna MG → contribuinte: 18%",
    given: makeCtx({
      ...base,
      issuerState: "MG",
      recipientState: "MG",
      recipientRole: "CONTRIBUTOR",
      regime: "NORMAL",
      items: [{ id: "1", description: "Produto", quantity: 1, unitPriceCents: 100000 }],
    }),
    expect: { icmsAmountCents: 18000, icmsRateBp: 1800, hasDifal: false },
    legalBasis: "RICMS-MG, anexo de alíquotas (NEEDS_REVIEW)",
    effectiveFrom: "2026-01-01",
  },
  {
    id: "ICMS-CASE-002",
    name: "Venda interestadual MG → SP, consumidor final: ICMS 12% + DIFAL 6% (20/80)",
    given: makeCtx({
      ...base,
      issuerState: "MG",
      recipientState: "SP",
      recipientRole: "FINAL_CONSUMER",
      regime: "NORMAL",
      items: [{ id: "1", description: "Produto", quantity: 1, unitPriceCents: 100000 }],
    }),
    expect: {
      icmsAmountCents: 12000,
      icmsRateBp: 1200,
      hasDifal: true,
      difalAmountCents: 6000,
      difalOriginCents: 1200,
      difalDestinationCents: 4800,
      fcpAmountCents: 2000,
    },
    legalBasis: "Res. SF 22/89 art. 1º; LC 190/22 (LC 87/96 art. 99 §2º); LC 87/96 art. 82-A",
    effectiveFrom: "2026-01-01",
  },
  {
    id: "ICMS-CASE-003",
    name: "Venda interestadual PA → SP (origem N/NE/CO/ES), consumidor final: ICMS 7% + DIFAL 11%",
    given: makeCtx({
      ...base,
      issuerState: "PA",
      recipientState: "SP",
      recipientRole: "FINAL_CONSUMER",
      regime: "NORMAL",
      items: [{ id: "1", description: "Produto", quantity: 1, unitPriceCents: 100000 }],
    }),
    expect: {
      icmsAmountCents: 7000,
      icmsRateBp: 700,
      hasDifal: true,
      difalAmountCents: 11000,
      difalOriginCents: 2200,
      difalDestinationCents: 8800,
      fcpAmountCents: 2000,
    },
    legalBasis: "Res. SF 22/89 art. 2º; LC 190/22; LC 87/96 art. 82-A",
    effectiveFrom: "2026-01-01",
  },
  {
    id: "ICMS-CASE-004",
    name: "Interestadual para consumidor final pelo Simples: sem DIFAL (LC 123/11)",
    given: makeCtx({
      ...base,
      issuerState: "MG",
      recipientState: "SP",
      recipientRole: "FINAL_CONSUMER",
      regime: "SIMPLES_NACIONAL",
      items: [{ id: "1", description: "Produto", quantity: 1, unitPriceCents: 100000 }],
    }),
    expect: { hasDifal: false, icmsOutcomeKind: "NO_RULE_FOUND" },
    legalBasis: "LC 123/11 art. 13 §1º XIII (Simples não pratica DIFAL; alíquota DAS por anexo: fase futura)",
    effectiveFrom: "2026-01-01",
  },
  {
    id: "ICMS-CASE-005",
    name: "Interestadual MG → PA, contribuinte: 12%, sem DIFAL",
    given: makeCtx({
      ...base,
      issuerState: "MG",
      recipientState: "PA",
      recipientRole: "CONTRIBUTOR",
      regime: "NORMAL",
      items: [{ id: "1", description: "Produto", quantity: 1, unitPriceCents: 100000 }],
    }),
    expect: { icmsAmountCents: 12000, icmsRateBp: 1200, hasDifal: false },
    legalBasis: "Res. SF 22/89 art. 1º",
    effectiveFrom: "2026-01-01",
  },
  {
    id: "ICMS-CASE-006",
    name: "MG → PA consumidor final: ICMS 12%, DIFAL 5% (20/80), FCP-PA 2%",
    given: makeCtx({
      ...base,
      issuerState: "MG",
      recipientState: "PA",
      recipientRole: "FINAL_CONSUMER",
      regime: "NORMAL",
      items: [{ id: "1", description: "Produto", quantity: 1, unitPriceCents: 100000 }],
    }),
    expect: {
      icmsAmountCents: 12000,
      hasDifal: true,
      difalAmountCents: 5000,
      difalOriginCents: 1000,
      difalDestinationCents: 4000,
      fcpAmountCents: 2000,
    },
    legalBasis: "Res. SF 22/89 art. 1º; LC 190/22; LC 87/96 art. 82-A (FCP-PA NEEDS_REVIEW)",
    effectiveFrom: "2026-01-01",
  },
  {
    id: "ICMS-CASE-007",
    name: "Operação interna MG: sem DIFAL e sem FCP (MG não cobra FCP geral)",
    given: makeCtx({
      ...base,
      issuerState: "MG",
      recipientState: "MG",
      recipientRole: "FINAL_CONSUMER",
      regime: "NORMAL",
      items: [{ id: "1", description: "Produto", quantity: 1, unitPriceCents: 100000 }],
    }),
    expect: { icmsAmountCents: 18000, hasDifal: false },
    legalBasis: "RICMS-MG (NEEDS_REVIEW); LC 87/96 art. 82-A",
    effectiveFrom: "2026-01-01",
  },
];
