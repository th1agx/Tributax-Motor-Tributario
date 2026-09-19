import { describe, expect, it } from "vitest";
import { InMemoryRuleCatalog, type RuleDraftInput } from "../src/rules/rule-admin.controller.js";

const draft: RuleDraftInput = {
  tribute: "ICMS",
  name: "Revisão de alíquota (teste)",
  jurisdiction: { scope: "STATE", code: "SE" },
  condition: { kind: "predicate", predicate: "isInternal" },
  effects: [{ type: "applyRate", rateBp: 1800 }],
  validFrom: "2026-01-01",
  legalBasis: { documentType: "LEI_ESTADUAL", number: "1.234", year: "2026", provision: "art. 1" },
};

describe("fila de triagem humana (ADR-012 §3)", () => {
  it("pendentes DRAFT/REVIEW com IA primeiro e próximas transições", async () => {
    const catalog = new InMemoryRuleCatalog([]);
    const humana = await catalog.create(draft);
    const ia = await catalog.create({
      ...draft,
      name: "Proposta IA",
      proposedBy: "AI_AGENT",
      reviewReason: "observação com confiança 0.9 (NEEDS_REVIEW)",
    });
    const ativa = await catalog.create(draft);
    await catalog.transition(ativa.id, 1, "REVIEW", "HUMAN");
    await catalog.transition(ativa.id, 1, "APPROVED", "HUMAN");
    await catalog.transition(ativa.id, 1, "ACTIVE", "HUMAN"); // fora da fila

    const pending = (await catalog.list())
      .filter((r) => r.status === "DRAFT" || r.status === "REVIEW")
      .sort((a, b) => Number(b.origin === "AI_SUGGESTED") - Number(a.origin === "AI_SUGGESTED"));

    expect(pending).toHaveLength(2);
    expect(pending[0]!.id).toBe(ia.id);
    expect(pending[0]!.origin).toBe("AI_SUGGESTED");
    expect(pending[0]!.reviewReason).toContain("NEEDS_REVIEW");
    expect(pending[1]!.id).toBe(humana.id);
  });

  it("proposta IA segue a fila até ACTIVE somente com humano", async () => {
    const catalog = new InMemoryRuleCatalog([]);
    const rule = await catalog.create({ ...draft, proposedBy: "AI_AGENT" });
    await catalog.transition(rule.id, 1, "REVIEW", "HUMAN");
    await expect(catalog.transition(rule.id, 1, "APPROVED", "AI_AGENT")).rejects.toThrow(/HUMAN/);
    await catalog.transition(rule.id, 1, "APPROVED", "HUMAN");
    expect((await catalog.transition(rule.id, 1, "ACTIVE", "HUMAN")).status).toBe("ACTIVE");
  });
});
