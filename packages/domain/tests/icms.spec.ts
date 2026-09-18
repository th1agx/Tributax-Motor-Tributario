import { describe, expect, it } from "vitest";
import { calculateIcms } from "../src/tribute/icms.js";
import { makeCtx } from "./helpers.js";

describe("módulo ICMS — unidade", () => {
  it("regra favorecida (7%) vence a geral (12%) por especificidade", () => {
    const result = calculateIcms(
      makeCtx({ issuerState: "PA", recipientState: "SP", recipientRole: "CONTRIBUTOR" }),
    );
    expect(result.icms.outcome).toMatchObject({ rateBp: 700, amountCents: 7000 });
    expect(result.icms.appliedRule?.id).toBe("ICMS-INTER-FAVOURED-07");
    // a regra geral aparece no trace como casada mas descartada na resolução
    const matching = result.icms.trace.find((s) => s.phase === "MATCHING");
    expect(
      matching?.evaluatedRules?.find((r) => r.ruleId === "ICMS-INTER-GENERAL-12")?.matched,
    ).toBe(true);
  });

  it("UF sem alíquota interna no catálogo → NO_RULE_FOUND honesto, nunca chute", () => {
    const result = calculateIcms(makeCtx({ issuerState: "SE", recipientState: "SE" }));
    expect(result.icms.outcome.kind).toBe("NO_RULE_FOUND");
  });

  it("decisão carrega fundamento legal e regra vencedora", () => {
    const result = calculateIcms(makeCtx({ issuerState: "MG", recipientState: "MG" }));
    expect(result.icms.outcome).toHaveProperty("kind", "TAXED");
    if (result.icms.outcome.kind === "TAXED") {
      expect(result.icms.outcome.legalBasis).toBeDefined();
    }
    expect(result.icms.appliedRule?.id).toBe("ICMS-INT-MG");
  });

  it("mesma entrada gera mesma decisão (determinismo do módulo)", () => {
    const ctx = makeCtx({ issuerState: "MG", recipientState: "SP", recipientRole: "FINAL_CONSUMER" });
    const a = calculateIcms(ctx);
    const b = calculateIcms(ctx);
    expect(a.icms.outcome).toEqual(b.icms.outcome);
    expect(a.icms.rulesetHash).toBe(b.icms.rulesetHash);
  });
});

describe("LegislationWatch (ADR-012) — invariante de aprovação", () => {
  it("agente de IA nunca aprova proposta", async () => {
    const { canApprove } = await import("../src/monitoring/legislation-watch.js");
    expect(canApprove({ proposedBy: "AI_AGENT" } as never, "AI_AGENT")).toBe(false);
    expect(canApprove({ proposedBy: "AI_AGENT" } as never, "HUMAN")).toBe(true);
  });
});
