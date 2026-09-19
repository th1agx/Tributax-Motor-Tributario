import { describe, expect, it } from "vitest";
import { icmsStRule, calculateIcmsStWith, netStCents } from "../src/tribute/icms-st.js";
import { calculateIcmsWith as calcIcms, icmsRuleCatalog } from "../src/tribute/icms.js";
import { fiscalCodeFor } from "../src/tribute/fiscal-codes.js";
import { makeCtx } from "./helpers.js";

const stRule = icmsStRule("SP", "30049099", 3754); // MVA 37,54%

describe("ICMS-ST — cálculo (Conv. 92/15)", () => {
  it("base ST = valor × (1+MVA) e bruto = base × alíquota interna do destino", () => {
    const ctx = makeCtx({ recipientState: "SP", items: [{ ...makeCtx().items[0]!, ncm: "30049099" }] });
    const { icmsSt } = calculateIcmsStWith(ctx, [stRule]);
    expect(icmsSt.outcome.kind).toBe("TAXED");
    if (icmsSt.outcome.kind === "TAXED") {
      // base 1000,00 × 1,3754 = 1375,40 → × 18% = 247,57 bruto
      expect(icmsSt.outcome.basisCents).toBe(137540);
      expect(icmsSt.outcome.rateBp).toBe(1800); // alíquota interna SP do catálogo
      expect(icmsSt.outcome.amountCents).toBe(24757);
    }
  });

  it("líquido = bruto − ICMS próprio da mesma operação (vICMSST do documento)", () => {
    const ctx = makeCtx({ recipientState: "SP", items: [{ ...makeCtx().items[0]!, ncm: "30049099" }] });
    const { icmsSt } = calculateIcmsStWith(ctx, [stRule]);
    const proprio = calcIcms(ctx, icmsRuleCatalog()); // MG→SP 12%
    expect(netStCents(icmsSt, proprio.icms)).toBe(24757 - 12000); // 127,57
  });

  it("ICMS próprio isento: líquido = bruto (nada a deduzir)", () => {
    const ctx = makeCtx({ recipientState: "SP", items: [{ ...makeCtx().items[0]!, ncm: "30049099" }] });
    const { icmsSt } = calculateIcmsStWith(ctx, [stRule]);
    const naoTributado = { outcome: { kind: "EXEMPT" as const, legalBasis: { documentType: "LEI" as const, number: "x", year: "1" } } };
    expect(netStCents(icmsSt, naoTributado as never)).toBe(24757);
  });

  it("NCM fora da lista ST → NO_RULE_FOUND (catálogo em código vazio é honesto)", () => {
    const ctx = makeCtx({ recipientState: "SP" }); // NCM 84713012 (notebook)
    const { icmsSt } = calculateIcmsStWith(ctx, [stRule]);
    expect(icmsSt.outcome.kind).toBe("NO_RULE_FOUND");
  });

  it("CST do substituto: ICMS_ST tributado → CST 10 (normal) e CSOSN 500 (Simples)", () => {
    const taxed = { kind: "TAXED" as const, basisCents: 1, rateBp: 1800, amountCents: 1 };
    expect(fiscalCodeFor("ICMS_ST", taxed, "NORMAL")).toEqual({ kind: "CST", code: "10" });
    expect(fiscalCodeFor("ICMS_ST", taxed, "SIMPLES_NACIONAL")).toEqual({ kind: "CSOSN", code: "500" });
  });

  it("builder exige UF com alíquota interna catalogada", () => {
    expect(() => icmsStRule("XX" as never, "30049099", 1000)).toThrow(/alíquota interna/);
  });
});
