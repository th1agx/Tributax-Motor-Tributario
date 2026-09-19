import { describe, expect, it } from "vitest";
import { calculateSimplesDas } from "../src/tribute/simples-das.js";
import { makeCtx } from "./helpers.js";

const simples = (rbt12Cents?: number) =>
  makeCtx({ ...(rbt12Cents !== undefined ? { rbt12Cents } : {}), regime: "SIMPLES_NACIONAL" });

describe("DAS — Simples Nacional Anexo I", () => {
  it("faixa 1 (RBT12 até 180k): 4% sobre a operação", () => {
    const f1 = calculateSimplesDas(simples(5_000_000)); // R$ 50k acumulado
    expect(f1.das.outcome.kind).toBe("TAXED");
    if (f1.das.outcome.kind === "TAXED") {
      expect(f1.das.outcome.rateBp).toBe(400);
      expect(f1.das.outcome.amountCents).toBe(4000); // 4% de 1000,00
    }
  });

  it("faixas 2 a 6 casam pelos limites de RBT12", () => {
    const casos: readonly [number, number][] = [
      [18_000_000, 730],   // 180k → 7,3%
      [36_000_000, 950],   // 360k → 9,5%
      [54_000_000, 1070],  // 540k → 10,7%
      [72_000_000, 1430],  // 720k → 14,3%
      [180_000_000, 1900], // 1,8M → 19%
    ];
    for (const [rbt, rateBp] of casos) {
      const d = calculateSimplesDas(simples(rbt));
      expect(d.das.outcome.kind, `RBT12 ${rbt}`).toBe("TAXED");
      if (d.das.outcome.kind === "TAXED") expect(d.das.outcome.rateBp, `RBT12 ${rbt}`).toBe(rateBp);
    }
  });

  it("7ª faixa (3,6–4,8M) = 22,5% com NEEDS_REVIEW declarado", () => {
    const d = calculateSimplesDas(simples(400_000_000));
    expect(d.das.outcome.kind).toBe("TAXED");
    if (d.das.outcome.kind === "TAXED") expect(d.das.outcome.rateBp).toBe(2250);
  });

  it("sem RBT12 informado → NO_RULE_FOUND (nunca assume faixa por conta própria)", () => {
    const d = calculateSimplesDas(simples());
    expect(d.das.outcome.kind).toBe("NO_RULE_FOUND");
  });

  it("regime NORMAL não gera DAS", () => {
    const d = calculateSimplesDas(makeCtx({ rbt12Cents: 5_000_000 }));
    expect(d.das.outcome.kind).toBe("NO_RULE_FOUND");
  });

  it("MEI não gera DAS por operação (DAS-MEI é fixo mensal)", () => {
    const d = calculateSimplesDas(makeCtx({ regime: "MEI", rbt12Cents: 5_000_000 }));
    expect(d.das.outcome.kind).toBe("NO_RULE_FOUND");
  });

  it("acima do limite (4,8M+) não é Simples — NO_RULE_FOUND", () => {
    const d = calculateSimplesDas(simples(500_000_000));
    expect(d.das.outcome.kind).toBe("NO_RULE_FOUND");
  });
});
