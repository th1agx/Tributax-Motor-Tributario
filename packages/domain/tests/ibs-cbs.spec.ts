import { describe, expect, it } from "vitest";
import { calculateIbsCbs, ibsCbsRuleCatalog } from "../src/tribute/ibs-cbs.js";
import { makeCtx } from "./helpers.js";

describe("CBS/IBS — alíquotas-teste 2026 (LC 214/25, ADR-015)", () => {
  it("NORMAL em 2026: CBS 0,9% e IBS 0,1% (base 1000,00)", () => {
    const d = calculateIbsCbs(makeCtx());
    expect(d.cbs.outcome.kind).toBe("TAXED");
    expect(d.ibs.outcome.kind).toBe("TAXED");
    if (d.cbs.outcome.kind === "TAXED" && d.ibs.outcome.kind === "TAXED") {
      expect(d.cbs.outcome.rateBp).toBe(90);
      expect(d.ibs.outcome.rateBp).toBe(10);
      expect(d.cbs.outcome.amountCents).toBe(900);
      expect(d.ibs.outcome.amountCents).toBe(100);
    }
  });

  it("vigência limitada a 2026: em 2027 vira NO_RULE_FOUND", () => {
    const d = calculateIbsCbs(makeCtx({ asOfDate: new Date("2027-03-01T00:00:00Z") }));
    expect(d.cbs.outcome.kind).toBe("NO_RULE_FOUND");
    expect(d.ibs.outcome.kind).toBe("NO_RULE_FOUND");
  });

  it("Simples/MEI não pagam alíquotas-teste em 2026 (sem regra, honesto)", () => {
    const d = calculateIbsCbs(makeCtx({ regime: "MEI" }));
    expect(d.cbs.outcome.kind).toBe("NO_RULE_FOUND");
    expect(d.ibs.outcome.kind).toBe("NO_RULE_FOUND");
  });

  it("regras carregam fundamento legal e lacuna declarada (NEEDS_REVIEW)", () => {
    const d = calculateIbsCbs(makeCtx());
    if (d.cbs.outcome.kind === "TAXED") {
      expect(d.cbs.outcome.legalBasis?.number).toBe("214");
    }
    // o trace carrega só id/versão; o reviewReason vive no catálogo
    const applied = d.ibs.appliedRule ?? d.cbs.appliedRule;
    const rule = ibsCbsRuleCatalog().find((r) => r.id === applied?.id);
    expect(rule?.reviewReason).toMatch(/NEEDS_REVIEW/);
  });
});
