import { describe, expect, it } from "vitest";
import { icmsStRule, icmsStRules, calculateIcmsStWith, netStCents } from "../src/tribute/icms-st.js";
import { calculateIcmsWith as calcIcms, icmsRuleCatalog } from "../src/tribute/icms.js";
import { fiscalCodeFor } from "../src/tribute/fiscal-codes.js";
import { makeCtx } from "./helpers.js";

const stRule = icmsStRule("SP", "30049099", 3754); // MVA 37,54% (variante INTERNA)
const stRules = icmsStRules("SP", "30049099", 3754);

describe("ICMS-ST — cálculo (Conv. 92/15)", () => {
  it("base ST = valor × (1+MVA) e bruto = base × alíquota interna do destino (operação interna)", () => {
    const ctx = makeCtx({ issuerState: "SP", recipientState: "SP", items: [{ ...makeCtx().items[0]!, ncm: "30049099" }] });
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
    const ctx = makeCtx({ issuerState: "SP", recipientState: "SP", items: [{ ...makeCtx().items[0]!, ncm: "30049099" }] });
    const { icmsSt } = calculateIcmsStWith(ctx, [stRule]);
    const proprio = calcIcms(ctx, icmsRuleCatalog()); // SP→SP interno 18%
    expect(netStCents(icmsSt, proprio.icms)).toBe(24757 - 18000); // 67,57
  });

  it("ICMS próprio isento: líquido = bruto (nada a deduzir)", () => {
    const ctx = makeCtx({ issuerState: "SP", recipientState: "SP", items: [{ ...makeCtx().items[0]!, ncm: "30049099" }] });
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

  it("consumidor final NÃO retém ST (auditoria 2.4: sem etapa seguinte a antecipar)", () => {
    const ctx = makeCtx({
      issuerState: "SP", recipientState: "SP", recipientRole: "FINAL_CONSUMER",
      items: [{ ...makeCtx().items[0]!, ncm: "30049099" }],
    });
    const { icmsSt } = calculateIcmsStWith(ctx, stRules);
    expect(icmsSt.outcome.kind).toBe("NO_RULE_FOUND");
  });

  it("interestadual usa MVA AJUSTADA (Conv. 92/15 art. 2º VIII)", () => {
    // MG → SP, MVA 37,54%, inter 12%, interna SP 18%:
    // MVA_adj = round(1,3754 × 0,88 / 0,82) − 1 = 47,60% → base 1476,00
    const ctx = makeCtx({ issuerState: "MG", recipientState: "SP", items: [{ ...makeCtx().items[0]!, ncm: "30049099" }] });
    const { icmsSt } = calculateIcmsStWith(ctx, stRules);
    expect(icmsSt.outcome.kind).toBe("TAXED");
    if (icmsSt.outcome.kind === "TAXED") {
      expect(icmsSt.outcome.basisCents).toBe(147600); // 1000 × 1,4760
      expect(icmsSt.outcome.amountCents).toBe(26568); // 18% de 1476,00
      expect(icmsSt.appliedRule?.id).toContain("INTER12");
    }
  });

  it("despesas acessórias do item integram a base ST (LC 87/96 art. 13 §1º I)", () => {
    const ctx = makeCtx({
      issuerState: "SP", recipientState: "SP",
      items: [{ ...makeCtx().items[0]!, ncm: "30049099", freightCents: 20000 }],
    });
    const { icmsSt } = calculateIcmsStWith(ctx, [stRule]);
    if (icmsSt.outcome.kind === "TAXED") {
      // (1000 + 200 frete) × 1,3754 = 1650,48
      expect(icmsSt.outcome.basisCents).toBe(165048);
    }
  });

  it("builder exige UF com alíquota interna catalogada", () => {
    expect(() => icmsStRule("XX" as never, "30049099", 1000)).toThrow(/alíquota interna/);
  });
});
