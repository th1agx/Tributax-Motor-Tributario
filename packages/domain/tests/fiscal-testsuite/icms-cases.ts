import type { FiscalContext } from "../../src/decision/fiscal-context.js";
import { makeCtx } from "../helpers.js";
import { calculatePisCofins } from "../../src/tribute/pis-cofins.js";
import { calculateIssRetentions } from "../../src/tribute/iss-retencoes.js";

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
    readonly pisOutcomeKind?: string;
    readonly cofinsOutcomeKind?: string;
    readonly pisAmountCents?: number;
    readonly cofinsAmountCents?: number;
    readonly irrfOutcomeKind?: string;
    readonly csrfOutcomeKind?: string;
    readonly irrfAmountCents?: number;
    readonly csrfAmountCents?: number;
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
    name: "MG → SP consumidor final: ICMS 12% + DIFAL base dupla (LC 190/22 art. 13 IX b); SP sem FCP",
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
      // base dupla: inter=12000; base_dest=(100000−12000)/0,82=107317;
      // 18%×107317=19317; DIFAL=19317−12000=7317; split 20/80
      difalAmountCents: 7317,
      difalOriginCents: 1463,
      difalDestinationCents: 5854,
    },
    legalBasis: "Res. SF 22/89 art. 1º; LC 190/22 art. 13, IX, b e §6º, II; SP sem FCP geral",
    effectiveFrom: "2026-01-01",
  },
  {
    id: "ICMS-CASE-003",
    name: "PA → SP (origem favorecida) consumidor final: ICMS 7% + DIFAL base dupla; SP sem FCP",
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
      // inter=7000; base_dest=(100000−7000)/0,82=113414; 18%=20414; DIFAL=13414
      difalAmountCents: 13414,
      difalOriginCents: 2682,
      difalDestinationCents: 10732,
    },
    legalBasis: "Res. SF 22/89 art. 2º; LC 190/22 art. 13, IX, b; SP sem FCP geral",
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
    name: "MG → PA consumidor final: ICMS 12%, DIFAL base dupla (interna PA 19%), FCP-PA 2%",
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
      // inter=12000; base_dest=(100000−12000)/(1−0,19)=108641; 19%=20641; DIFAL=8641
      difalAmountCents: 8641,
      difalOriginCents: 1728,
      difalDestinationCents: 6913,
      fcpAmountCents: 2000,
    },
    legalBasis: "Res. SF 22/89 art. 1º; LC 190/22 art. 13, IX, b; LC 87/96 art. 82-A (FCP-PA NEEDS_REVIEW)",
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
  {
    id: "PISCOFINS-CASE-001",
    name: "Regime Normal (não cumulativo): PIS 1,65% + COFINS 7,6%",
    given: makeCtx({ ...base, regime: "NORMAL" }),
    expect: { pisAmountCents: 1650, cofinsAmountCents: 7600 },
    legalBasis: "Lei 10.637/2002 art. 8º I; Lei 10.833/2003 art. 2º (NEEDS_REVIEW)",
    effectiveFrom: "2026-01-01",
  },
  {
    id: "PISCOFINS-CASE-002",
    name: "Lucro Presumido (cumulativo): PIS 0,65% + COFINS 3%",
    given: makeCtx({ ...base, regime: "LUCRO_PRESUMIDO" }),
    expect: { pisAmountCents: 650, cofinsAmountCents: 3000 },
    legalBasis: "Lei 9.718/1998 (artigos a confirmar — NEEDS_REVIEW)",
    effectiveFrom: "2026-01-01",
  },
  {
    id: "PISCOFINS-CASE-003",
    name: "Simples Nacional: PIS/COFINS no DAS — sem regra própria (NO_RULE_FOUND)",
    given: makeCtx({ ...base, regime: "SIMPLES_NACIONAL" }),
    expect: { pisOutcomeKind: "NO_RULE_FOUND", cofinsOutcomeKind: "NO_RULE_FOUND" },
    legalBasis: "LC 123/2006 — tributos unificados no DAS (alíquota por anexo: fase futura)",
    effectiveFrom: "2026-01-01",
  },
  {
    id: "RETENCAO-CASE-001",
    name: "Serviço PJ → PJ (regime Normal): IRRF 1,5% + CSRF 4,65%",
    given: makeCtx({
      operationKind: "SERVICE_PROVISION",
      fiscalDocumentType: "NFSE",
      recipientRole: "CONTRIBUTOR",
      regime: "NORMAL",
      items: [{ id: "1", description: "Consultoria", quantity: 1, unitPriceCents: 200000, serviceCode: "1.05" }],
    }),
    expect: { irrfAmountCents: 3000, csrfAmountCents: 9300 },
    legalBasis: "Lei 9.430/96 art. 67 (NEEDS_REVIEW); Lei 10.833/03 arts. 30 e 36",
    effectiveFrom: "2026-01-01",
  },
  {
    id: "RETENCAO-CASE-002",
    name: "Serviço prestado por MEI: sem retenção federal e ISS fixo no DAS-MEI (sem regra por operação)",
    given: makeCtx({
      operationKind: "SERVICE_PROVISION",
      fiscalDocumentType: "NFSE",
      recipientRole: "CONTRIBUTOR",
      regime: "MEI",
      items: [{ id: "1", description: "Consultoria", quantity: 1, unitPriceCents: 200000, serviceCode: "1.05" }],
    }),
    expect: { irrfOutcomeKind: "NO_RULE_FOUND", csrfOutcomeKind: "NO_RULE_FOUND" },
    legalBasis: "LC 123/2006 art. 18 §5º? (MEI — isenções; verificar) — ISS em valor fixo no DAS-MEI",
    effectiveFrom: "2026-01-01",
  },
  {
    id: "RETENCAO-CASE-003",
    name: "Serviço para consumidor final: sem retenção (tomador não é PJ)",
    given: makeCtx({
      operationKind: "SERVICE_PROVISION",
      fiscalDocumentType: "NFSE",
      recipientRole: "FINAL_CONSUMER",
      regime: "NORMAL",
      items: [{ id: "1", description: "Consultoria", quantity: 1, unitPriceCents: 200000, serviceCode: "1.05" }],
    }),
    expect: { irrfOutcomeKind: "NO_RULE_FOUND", csrfOutcomeKind: "NO_RULE_FOUND" },
    legalBasis: "retenções exigem tomador PJ (Lei 10.833/03 art. 30)",
    effectiveFrom: "2026-01-01",
  },
];
