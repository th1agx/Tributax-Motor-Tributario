import { describe, expect, it } from "vitest";
import { calculateIpi } from "../src/tribute/ipi.js";
import { makeCtx } from "./helpers.js";

describe("IPI", () => {
  it("não incide sobre serviços (Lei 4.502/64 art. 2º, I)", () => {
    const d = calculateIpi(makeCtx({ operationKind: "SERVICE_PROVISION" }));
    expect(d.ipi.outcome.kind).toBe("NON_TAXABLE");
  });

  it("imune na exportação (CF/88 art. 153, §3º, III)", () => {
    const d = calculateIpi(makeCtx({ operationKind: "EXPORT" }));
    expect(d.ipi.outcome.kind).toBe("EXEMPT");
  });

  it("alíquota zero para medicamentos (NCM cap. 30)", () => {
    const d = calculateIpi(makeCtx({ items: [{ ...makeCtx().items[0]!, ncm: "30049099" }] }));
    expect(d.ipi.outcome.kind).toBe("TAXED");
    if (d.ipi.outcome.kind === "TAXED") {
      expect(d.ipi.outcome.rateBp).toBe(0);
      expect(d.ipi.outcome.amountCents).toBe(0);
    }
  });

  it("NCM fora do catálogo → NO_RULE_FOUND honesto (TIPI é curadoria)", () => {
    const d = calculateIpi(makeCtx({ items: [{ ...makeCtx().items[0]!, ncm: "84713012" }] }));
    expect(d.ipi.outcome.kind).toBe("NO_RULE_FOUND");
  });
});
