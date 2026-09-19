import { describe, expect, it } from "vitest";
import { calculateIss } from "../src/tribute/iss.js";
import { makeCtx } from "./helpers.js";

const servico = (over: Partial<ReturnType<typeof makeCtx>["items"][number]> = {}) =>
  ({ ...makeCtx().items[0]!, serviceCode: "1.05", ...over });

const nfseSp = (over: Partial<ReturnType<typeof makeCtx>> = {}) =>
  makeCtx({
    operationKind: "SERVICE_PROVISION",
    issuerMunicipality: "3550308",
    items: [servico()],
    ...over,
  });

describe("NFS-e completa — deduções, exportação e retenção", () => {
  it("dedução de materiais reduz a base do ISS (LC 116/03)", () => {
    const d = calculateIss(nfseSp({ items: [servico({ issDeductionCents: 40000 })] })); // -400,00
    expect(d.iss.outcome.kind).toBe("TAXED");
    if (d.iss.outcome.kind === "TAXED") {
      expect(d.iss.outcome.basisCents).toBe(60000); // 1000,00 − 400,00
      expect(d.iss.outcome.amountCents).toBe(1740); // 2,9% de 600,00
    }
    expect(d.iss.warnings.join(" ")).toMatch(/dedução legal de materiais/);
  });

  it("dedução maior que a base nunca gera base negativa", () => {
    const d = calculateIss(nfseSp({ items: [servico({ issDeductionCents: 999_000 })] }));
    if (d.iss.outcome.kind === "TAXED") {
      expect(d.iss.outcome.basisCents).toBe(0);
      expect(d.iss.outcome.amountCents).toBe(0);
    }
  });

  it("tomador PJ: sinaliza possível retenção na fonte (lei municipal)", () => {
    const d = calculateIss(nfseSp()); // recipientRole default CONTRIBUTOR (PJ)
    expect(d.iss.warnings.join(" ")).toMatch(/retenção de ISS na fonte/);
  });

  it("consumidor final não gera aviso de retenção", () => {
    const d = calculateIss(nfseSp({ recipientRole: "FINAL_CONSUMER" }));
    expect(d.iss.warnings.join(" ")).not.toMatch(/retenção de ISS na fonte/);
  });

  it("exportação de serviço não incide ISS (LC 116 art. 2º, I)", () => {
    const d = calculateIss(makeCtx({
      operationKind: "EXPORT",
      issuerMunicipality: "3550308",
      items: [servico()],
    }));
    expect(d.iss.outcome.kind).toBe("NON_TAXABLE");
  });

  it("exportação de BEM continua sem essa regra (não vaza para mercadoria)", () => {
    const d = calculateIss(makeCtx({ operationKind: "EXPORT" })); // NCM, sem serviceCode
    expect(d.iss.outcome.kind).toBe("NO_RULE_FOUND");
  });
});
