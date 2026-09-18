import { describe, expect, it } from "vitest";
import { DateRange } from "../src/shared/date-range.js";

describe("DateRange", () => {
  const jan1 = new Date("2026-01-01T00:00:00Z");
  const jul1 = new Date("2026-07-01T00:00:00Z");

  it("contém datas dentro do intervalo [from, to)", () => {
    const r = DateRange.from(jan1, jul1);
    expect(r.contains(new Date("2026-03-15T00:00:00Z"))).toBe(true);
    expect(r.contains(jan1)).toBe(true);
    expect(r.contains(jul1)).toBe(false);
  });

  it("vigência aberta contém o futuro", () => {
    const r = DateRange.from(jan1);
    expect(r.isOpenEnded()).toBe(true);
    expect(r.contains(new Date("2030-01-01T00:00:00Z"))).toBe(true);
  });

  it("rejeita fim anterior ou igual ao início", () => {
    expect(() => DateRange.from(jul1, jan1)).toThrow();
    expect(() => DateRange.from(jan1, new Date(jan1.getTime()))).toThrow();
  });

  it("detecta sobreposição entre vigências", () => {
    const a = DateRange.from(jan1, jul1);
    const b = DateRange.from(new Date("2026-06-01T00:00:00Z"));
    expect(a.overlaps(b)).toBe(true);
  });
});
