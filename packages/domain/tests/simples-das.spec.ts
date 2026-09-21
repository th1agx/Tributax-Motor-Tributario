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

  it("faixas casam pelos limites da LC 123/06 (LC 155/16) — efetiva = fórmula da lei", () => {
    // Tabela do Anexo I (nominal bp, dedução cents, RBT12 de teste acima do limite inferior)
    const casos: readonly [number, number, number][] = [
      // [rbt12Cents, nominalBp, deducaoCents]
      [18_000_001, 730, 594_000],
      [36_000_001, 950, 1_386_000],
      [72_000_001, 1070, 2_250_000],
      [180_000_001, 1430, 8_730_000],
      [360_000_001, 1900, 37_800_000],
    ];
    for (const [rbt, nominalBp, ded] of casos) {
      const d = calculateSimplesDas(simples(rbt));
      expect(d.das.outcome.kind, `RBT12 ${rbt}`).toBe("TAXED");
      // efetiva (LC 123/06): nominal − dedução × 10000 / RBT12
      const expected = Math.max(0, nominalBp - Math.round((ded * 10000) / rbt));
      if (d.das.outcome.kind === "TAXED") {
        expect(d.das.outcome.rateBp, `RBT12 ${rbt}`).toBe(expected);
        expect(d.das.appliedRule?.id).toContain("ANEXO1");
      }
    }
  });

  it("custo concreto da auditoria: comércio RBT12 2M, venda R$ 10.000 → ~R$ 993,50 (lei), não R$ 1.900", () => {
    const d = calculateSimplesDas(makeCtx({
      regime: "SIMPLES_NACIONAL",
      rbt12Cents: 200_000_000,
      items: [{ id: "1", description: "Produto", quantity: 1, unitPriceCents: 1_000_000 }],
    }));
    expect(d.das.outcome.kind).toBe("TAXED");
    if (d.das.outcome.kind === "TAXED") {
      // efetiva = 1430 − round(8730000×10000/200000000) = 1430 − 437 = 993 bp ≈ 9,93%
      expect(d.das.outcome.rateBp).toBe(993);
      expect(d.das.outcome.amountCents).toBe(99_300);
    }
  });

  it("NÃO existe 7ª faixa — 3,6–4,8M é F6 com dedução; acima de 4,8M fica fora", () => {
    const f6 = calculateSimplesDas(simples(400_000_000));
    expect(f6.das.outcome.kind).toBe("TAXED");
    // efetiva (fórmula da lei) = 1900 − round(37.800.000×10000/400.000.000) = 1900 − 945
    if (f6.das.outcome.kind === "TAXED") expect(f6.das.outcome.rateBp).toBe(955);
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
