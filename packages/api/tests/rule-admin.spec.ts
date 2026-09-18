import { describe, expect, it } from "vitest";
import { InMemoryRuleCatalog, validateDraft } from "../src/rules/rule-admin.controller.js";
import type { RuleDraftInput } from "../src/rules/rule-admin.controller.js";

const baseDraft: RuleDraftInput = {
  tribute: "ICMS",
  name: "Isenção interna SE (teste)",
  jurisdiction: { scope: "STATE", code: "SE" },
  condition: { kind: "and", children: [
    { kind: "predicate", predicate: "isInternal" },
    { kind: "predicate", predicate: "issuerStateIs", args: { uf: "SE" } },
    { kind: "predicate", predicate: "regimeIs", args: { regime: "NORMAL" } },
  ] },
  effects: [{ type: "exempt" }],
  validFrom: "2026-01-01",
  legalBasis: { documentType: "REGULAMENTO_ESTADUAL", number: "RICMS", year: "SE", provision: "anexo" },
};

describe("workflow de aprovação de regras", () => {
  it("caminho completo DRAFT → REVIEW → APPROVED → ACTIVE por humano", async () => {
    const catalog = new InMemoryRuleCatalog([]);
    const rule = await catalog.create(baseDraft);
    expect(rule.status).toBe("DRAFT");
    expect((await catalog.transition(rule.id, 1, "REVIEW", "HUMAN")).status).toBe("REVIEW");
    expect((await catalog.transition(rule.id, 1, "APPROVED", "HUMAN")).status).toBe("APPROVED");
    expect((await catalog.transition(rule.id, 1, "ACTIVE", "HUMAN")).status).toBe("ACTIVE");
  });

  it("IA nunca aprova (ADR-012)", async () => {
    const catalog = new InMemoryRuleCatalog([]);
    const rule = await catalog.create({ ...baseDraft, proposedBy: "AI_AGENT" });
    await catalog.transition(rule.id, 1, "REVIEW", "HUMAN");
    await expect(catalog.transition(rule.id, 1, "APPROVED", "AI_AGENT")).rejects.toThrow(/HUMAN/);
    expect((await catalog.transition(rule.id, 1, "APPROVED", "HUMAN")).status).toBe("APPROVED");
  });

  it("APPROVED exige fundamento legal", async () => {
    const catalog = new InMemoryRuleCatalog([]);
    const { legalBasis: _omit, ...semFundamento } = baseDraft;
    const rule = await catalog.create(semFundamento);
    await catalog.transition(rule.id, 1, "REVIEW", "HUMAN");
    await expect(catalog.transition(rule.id, 1, "APPROVED", "HUMAN")).rejects.toThrow(/fundamento legal/);
  });

  it("transições fora da máquina de estados são rejeitadas", async () => {
    const catalog = new InMemoryRuleCatalog([]);
    const rule = await catalog.create(baseDraft);
    await expect(catalog.transition(rule.id, 1, "ACTIVE", "HUMAN")).rejects.toThrow(/transição inválida/);
    await expect(catalog.transition(rule.id, 1, "REVOKED", "HUMAN")).rejects.toThrow(/transição inválida/);
  });

  it("condição que não compila é rejeitada na carga (400, nunca em cálculo)", () => {
    expect(() => validateDraft({ ...baseDraft, condition: { kind: "predicate", predicate: "taxaMagica" } }))
      .toThrow(/CONDITION_INVALID|vocabulário/);
  });

  it("regra criada por IA carrega origin AI_SUGGESTED e só como DRAFT", async () => {
    const catalog = new InMemoryRuleCatalog([]);
    const rule = await catalog.create({ ...baseDraft, proposedBy: "AI_AGENT" });
    expect(rule.origin).toBe("AI_SUGGESTED");
    expect(rule.status).toBe("DRAFT");
  });

  it("regra ACTIVE entra no cálculo; DRAFT não", async () => {
    const catalog = new InMemoryRuleCatalog([]);
    const rule = await catalog.create(baseDraft);
    const ctx = {
      asOfDate: new Date("2026-06-01"),
      issuerState: "SE" as const, recipientState: "SE" as const,
      recipientRole: "CONTRIBUTOR" as const, operationKind: "SALE_GOODS" as const,
      fiscalDocumentType: "NFE" as const, regime: "NORMAL" as const,
      items: [{ id: "1", description: "x", quantity: 1, unitPriceCents: 100 }],
    };
    expect((await catalog.loadRules(ctx)).find((r) => r.id === rule.id)).toBeUndefined();
    await catalog.transition(rule.id, 1, "REVIEW", "HUMAN");
    await catalog.transition(rule.id, 1, "APPROVED", "HUMAN");
    await catalog.transition(rule.id, 1, "ACTIVE", "HUMAN");
    expect((await catalog.loadRules(ctx)).find((r) => r.id === rule.id)).toBeDefined();
  });
});
