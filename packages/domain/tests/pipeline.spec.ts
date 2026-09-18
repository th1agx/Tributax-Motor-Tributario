import { describe, expect, it } from "vitest";
import { calculate } from "../src/decision/pipeline.js";
import type { TaxRule } from "../src/decision/tax-rule.js";
import { DateRange } from "../src/shared/date-range.js";
import { makeCtx } from "./helpers.js";

const VALIDITY = DateRange.from(new Date("2026-01-01T00:00:00Z"));

function rule(overrides: Partial<TaxRule> & Pick<TaxRule, "id" | "condition">): TaxRule {
  return {
    version: 1,
    tribute: "STUB",
    name: overrides.id,
    jurisdiction: { scope: "FEDERAL" },
    effects: [{ type: "applyRate", rateBp: 1800 }],
    priority: 0,
    validity: VALIDITY,
    status: "ACTIVE",
    origin: "LEGISLATION",
    legalBasis: {
      documentType: "LEI_COMPLEMENTAR",
      number: "87",
      year: "1996",
      provision: "art. 2º",
    },
    ...overrides,
  };
}

describe("pipeline — decisão com trace", () => {
  it("regra mais específica (maior profundidade) vence", () => {
    const generic = rule({
      id: "R-GENERIC",
      condition: { kind: "predicate", predicate: "isInternal" },
    });
    const specific = rule({
      id: "R-SPECIFIC",
      condition: {
        kind: "and",
        children: [
          { kind: "predicate", predicate: "isInternal" },
          { kind: "predicate", predicate: "recipientRoleIs", args: { role: "CONTRIBUTOR" } },
        ],
      },
    });

    const decision = calculate({
      ctx: makeCtx(),
      rules: [generic, specific],
      tribute: "STUB",
    });

    expect(decision.appliedRule?.id).toBe("R-SPECIFIC");
    expect(decision.outcome).toMatchObject({
      kind: "TAXED",
      basisCents: 100000,
      rateBp: 1800,
      amountCents: 18000,
    });
    const matching = decision.trace.find((s) => s.phase === "MATCHING");
    expect(matching?.evaluatedRules).toHaveLength(2);
  });

  it("ausência de regra produz NO_RULE_FOUND com diagnóstico, nunca zero", () => {
    const expired = rule({
      id: "R-OLD",
      condition: { kind: "predicate", predicate: "isInternal" },
      validity: DateRange.from(
        new Date("2020-01-01T00:00:00Z"),
        new Date("2020-12-31T00:00:00Z"),
      ),
    });

    const decision = calculate({
      ctx: makeCtx(),
      rules: [expired],
      tribute: "STUB",
    });

    expect(decision.outcome.kind).toBe("NO_RULE_FOUND");
    if (decision.outcome.kind === "NO_RULE_FOUND") {
      expect(decision.outcome.evaluatedRules).toHaveLength(0); // filtrada por vigência
    }
  });

  it("regra inativa e regra de outro tributo são filtradas", () => {
    const draft = rule({
      id: "R-DRAFT",
      condition: { kind: "predicate", predicate: "isInternal" },
      status: "DRAFT",
    });
    const otherTribute = rule({
      id: "R-ICMS",
      condition: { kind: "predicate", predicate: "isInternal" },
      tribute: "ICMS",
    });

    const decision = calculate({ ctx: makeCtx(), rules: [draft, otherTribute], tribute: "STUB" });
    expect(decision.outcome.kind).toBe("NO_RULE_FOUND");
  });

  it("estado não-tributado exige fundamento legal", () => {
    const exempt = rule({
      id: "R-EXEMPT",
      condition: { kind: "predicate", predicate: "isInternal" },
      effects: [{ type: "exempt" }],
    });

    const decision = calculate({ ctx: makeCtx(), rules: [exempt], tribute: "STUB" });
    expect(decision.outcome).toMatchObject({
      kind: "EXEMPT",
      legalBasis: { number: "87", year: "1996" },
    });

    const noBasis = { ...exempt, legalBasis: undefined } as TaxRule;
    expect(() => calculate({ ctx: makeCtx(), rules: [noBasis], tribute: "STUB" })).toThrow(
      /fundamento legal/,
    );
  });

  it("mesma entrada + mesmo ruleset = mesmo resultado (determinismo)", () => {
    const rules = [
      rule({ id: "R-A", condition: { kind: "predicate", predicate: "isInternal" } }),
    ];
    const ctx = makeCtx();
    const d1 = calculate({ ctx, rules, tribute: "STUB" });
    const d2 = calculate({ ctx, rules, tribute: "STUB" });
    expect(d1.rulesetHash).toBe(d2.rulesetHash);
    expect(d1.outcome).toEqual(d2.outcome);
  });

  it("regra com predicado inválido não carrega e gera warning", () => {
    const broken = rule({
      id: "R-BROKEN",
      condition: { kind: "predicate", predicate: "naoExiste" },
    });
    const good = rule({
      id: "R-GOOD",
      condition: { kind: "predicate", predicate: "isInternal" },
    });

    const decision = calculate({ ctx: makeCtx(), rules: [broken, good], tribute: "STUB" });
    expect(decision.appliedRule?.id).toBe("R-GOOD");
    expect(decision.warnings.join(" ")).toMatch(/R-BROKEN/);
  });

  it("trace cobre todas as fases da decisão", () => {
    const r = rule({ id: "R1", condition: { kind: "predicate", predicate: "isInternal" } });
    const decision = calculate({ ctx: makeCtx(), rules: [r], tribute: "STUB" });
    const phases = decision.trace.map((s) => s.phase);
    expect(phases).toContain("DISCOVERY");
    expect(phases).toContain("MATCHING");
    expect(phases).toContain("COMPUTATION");
    expect(phases).toContain("RESULT");
    expect(decision.engineVersion).toMatch(/^0\.1\.0/);
  });
});
