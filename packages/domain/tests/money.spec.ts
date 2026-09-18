import { describe, expect, it } from "vitest";
import { Money, integerDiv } from "../src/shared/money.js";
import { TaxRate } from "../src/shared/tax-rate.js";

describe("Money", () => {
  it("rejeita centavos não-inteiros", () => {
    expect(() => Money.fromCents(10.5)).toThrow();
  });

  it("soma e subtrai em inteiros", () => {
    expect(Money.fromCents(1000).add(Money.fromCents(500)).cents).toBe(1500);
    expect(Money.fromCents(1000).subtract(Money.fromCents(300)).cents).toBe(700);
  });

  it("18% de R$ 1.000,00 = R$ 180,00 (HALF_UP)", () => {
    const icms = TaxRate.fromPercent(18).applyTo(Money.fromCents(100000));
    expect(icms.cents).toBe(18000);
  });

  it("arredondamento HALF_UP em meio exato vai para cima", () => {
    expect(integerDiv(15, 10, "HALF_UP")).toBe(2);
    expect(integerDiv(14, 10, "HALF_UP")).toBe(1);
  });

  it("aloca proporcionalmente distribuindo o resíduo", () => {
    const parts = Money.fromCents(100).allocate([1, 1, 1]);
    expect(parts.map((p) => p.cents)).toEqual([34, 33, 33]);
  });

  it("rejeita pesos inválidos", () => {
    expect(() => Money.fromCents(100).allocate([0])).toThrow();
  });
});

describe("TaxRate", () => {
  it("rejeita basis points fora de [0, 10000]", () => {
    expect(() => TaxRate.fromBasisPoints(-1)).toThrow();
    expect(() => TaxRate.fromBasisPoints(10001)).toThrow();
  });

  it("alíquota zero é distinguível de isenção", () => {
    expect(TaxRate.fromBasisPoints(0).isZero()).toBe(true);
  });
});
