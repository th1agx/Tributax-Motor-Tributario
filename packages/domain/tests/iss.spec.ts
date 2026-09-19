import { describe, expect, it } from "vitest";
import { calculateIss, issRuleCatalog } from "../src/tribute/iss.js";
import { makeCtx } from "./helpers.js";

describe("ISS municipal (LC 116/03)", () => {
  it("serviço prestado com estabelecimento em SP (IBGE 3550308): 2,9%", () => {
    const d = calculateIss(makeCtx({
      operationKind: "SERVICE_PROVISION",
      issuerMunicipality: "3550308",
      items: [{ ...makeCtx().items[0]!, serviceCode: "1.05" }],
    }));
    expect(d.iss.outcome.kind).toBe("TAXED");
    if (d.iss.outcome.kind === "TAXED") {
      expect(d.iss.outcome.rateBp).toBe(290);
      expect(d.iss.outcome.amountCents).toBe(2900); // base 1000,00
    }
  });

  it("sem município informado → NO_RULE_FOUND honesto", () => {
    const d = calculateIss(makeCtx({ operationKind: "SERVICE_PROVISION" }));
    expect(d.iss.outcome.kind).toBe("NO_RULE_FOUND");
  });

  it("município fora do catálogo → NO_RULE_FOUND (tabela municipal é curadoria)", () => {
    const d = calculateIss(makeCtx({
      operationKind: "SERVICE_PROVISION",
      issuerMunicipality: "4205407", // Florianópolis
    }));
    expect(d.iss.outcome.kind).toBe("NO_RULE_FOUND");
  });

  it("Simples/MEI: ISS no DAS/DAS-MEI — sem regra própria", () => {
    for (const regime of ["SIMPLES_NACIONAL", "MEI"] as const) {
      const d = calculateIss(makeCtx({
        operationKind: "SERVICE_PROVISION",
        issuerMunicipality: "3550308",
        regime,
      }));
      expect(d.iss.outcome.kind).toBe("NO_RULE_FOUND");
    }
  });

  it("venda de bens não gera ISS (condição exige SERVICE_PROVISION)", () => {
    const d = calculateIss(makeCtx({ issuerMunicipality: "3550308" }));
    expect(d.iss.outcome.kind).toBe("NO_RULE_FOUND");
  });

  it("regras carregam jurisdição MUNICIPAL e lacuna declarada", () => {
    const sp = issRuleCatalog().find((r) => r.id === "ISS-3550308-290")!;
    expect(sp.jurisdiction).toEqual({ scope: "MUNICIPAL", code: "3550308" });
    expect(sp.reviewReason).toMatch(/NEEDS_REVIEW/);
    expect(sp.legalBasis?.documentType).toBe("LEI_MUNICIPAL");
  });
});
