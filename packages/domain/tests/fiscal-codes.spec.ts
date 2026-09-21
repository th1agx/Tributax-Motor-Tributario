import { describe, expect, it } from "vitest";
import { inferCfop, fiscalCodeFor } from "../src/tribute/fiscal-codes.js";
import { makeCtx } from "./helpers.js";
import type { TaxOutcome } from "../src/decision/tax-outcome.js";

const taxed: TaxOutcome = { kind: "TAXED", basisCents: 100000, rateBp: 1800, amountCents: 18000 };
const exempt: TaxOutcome = { kind: "EXEMPT", legalBasis: { documentType: "LEI", number: "x", year: "2026" } };
const nonTaxable: TaxOutcome = { kind: "NON_TAXABLE", legalBasis: { documentType: "LEI", number: "x", year: "2026" } };
const zeroRated: TaxOutcome = { kind: "ZERO_RATED", legalBasis: { documentType: "LEI", number: "x", year: "2026" } };
const noRule: TaxOutcome = { kind: "NO_RULE_FOUND", evaluatedRules: [] };

describe("inferCfop", () => {
  it("venda interna a contribuinte → 5101 (com ambiguidade produzir×revender declarada)", () => {
    const r = inferCfop(makeCtx({}))!;
    expect(r.code).toBe("5101");
    expect(r.review).toMatch(/NEEDS_REVIEW/);
  });

  it("venda interestadual a consumidor final → 6102", () => {
    const r = inferCfop(makeCtx({ recipientState: "SP", recipientRole: "FINAL_CONSUMER" }))!;
    expect(r.code).toBe("6102");
  });

  it("exportação → 7101; importação → entrada (1xxx/2xxx)", () => {
    expect(inferCfop(makeCtx({ operationKind: "EXPORT" }))!.code).toBe("7101");
    expect(inferCfop(makeCtx({ operationKind: "IMPORT" }))!.code).toBe("1101");
  });

  it("NFS-e/serviço não usa CFOP; transferência ainda não inferida (honesto)", () => {
    expect(inferCfop(makeCtx({ operationKind: "SERVICE_PROVISION" }))).toBeUndefined();
    expect(inferCfop(makeCtx({ operationKind: "TRANSFER" }))).toBeUndefined();
  });
});

describe("fiscalCodeFor — CST/CSOSN", () => {
  it("NORMAL: ICMS tributado → CST 00; isento → 40; não tributado → 41; zero → 40", () => {
    expect(fiscalCodeFor("ICMS", taxed, "NORMAL")).toEqual({ kind: "CST", code: "00" });
    expect(fiscalCodeFor("ICMS", exempt, "NORMAL")).toEqual({ kind: "CST", code: "40" });
    expect(fiscalCodeFor("ICMS", nonTaxable, "NORMAL")).toEqual({ kind: "CST", code: "41" });
    expect(fiscalCodeFor("ICMS", zeroRated, "NORMAL")).toEqual({ kind: "CST", code: "40" });
  });

  it("Simples/MEI: ICMS → CSOSN (102/103/400)", () => {
    expect(fiscalCodeFor("ICMS", taxed, "SIMPLES_NACIONAL")).toEqual({ kind: "CSOSN", code: "102" });
    expect(fiscalCodeFor("ICMS", taxed, "MEI")).toEqual({ kind: "CSOSN", code: "102" });
    expect(fiscalCodeFor("ICMS", exempt, "MEI")).toEqual({ kind: "CSOSN", code: "103" });
    expect(fiscalCodeFor("ICMS", nonTaxable, "SIMPLES_NACIONAL")).toEqual({ kind: "CSOSN", code: "103" });
  });

  it("PIS/COFINS tributado → CST 01; isento → 07; não tributado → 04", () => {
    for (const t of ["PIS", "COFINS"] as const) {
      expect(fiscalCodeFor(t, taxed, "NORMAL")).toEqual({ kind: "CST", code: "01" });
      expect(fiscalCodeFor(t, exempt, "NORMAL")).toEqual({ kind: "CST", code: "07" });
      expect(fiscalCodeFor(t, nonTaxable, "NORMAL")).toEqual({ kind: "CST", code: "04" });
    }
  });

  it("IPI no Simples não gera CST; no normal, tributado → 50 (correção auditoria: 40/41 são de ICMS)", () => {
    expect(fiscalCodeFor("IPI", taxed, "MEI")).toBeUndefined();
    expect(fiscalCodeFor("IPI", taxed, "NORMAL")).toEqual({ kind: "CST", code: "50" });
  });

  it("NO_RULE_FOUND nunca gera código; ISS/DIFAL/FCP/retenções não têm CST próprio", () => {
    expect(fiscalCodeFor("ICMS", noRule, "NORMAL")).toBeUndefined();
    for (const t of ["ISS", "DIFAL", "FCP", "IRRF", "CSRF"] as const) {
      expect(fiscalCodeFor(t, taxed, "NORMAL")).toBeUndefined();
    }
  });
});
