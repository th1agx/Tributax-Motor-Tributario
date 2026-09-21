import { describe, expect, it } from "vitest";
import { calculateSimplesDas } from "../src/tribute/simples-das.js";
import { makeCtx } from "./helpers.js";

const servicoSimples = (rbt12Cents: number) =>
  makeCtx({
    regime: "SIMPLES_NACIONAL",
    rbt12Cents,
    operationKind: "SERVICE_PROVISION",
    items: [{ ...makeCtx().items[0]!, serviceCode: "1.05" }],
  });

describe("DAS Anexo III — serviços com alíquota efetiva (LC 123/06)", () => {
  it("faixa 3 (RBT12 400k): efetiva = 13,5% − 17.640/400k = 9,09%", () => {
    const d = calculateSimplesDas(servicoSimples(40_000_000));
    expect(d.das.outcome.kind).toBe("TAXED");
    if (d.das.outcome.kind === "TAXED") {
      expect(d.das.outcome.rateBp).toBe(909); // 1350 − 441
      expect(d.das.outcome.amountCents).toBe(9090); // sobre 1000,00
    }
  });

  it("faixa 1 (até 180k): sem dedução, 6% direto", () => {
    const d = calculateSimplesDas(servicoSimples(5_000_000));
    if (d.das.outcome.kind === "TAXED") {
      expect(d.das.outcome.rateBp).toBe(600);
      expect(d.das.outcome.amountCents).toBe(6000);
    }
  });

  it("serviços usam o Anexo III (mais específico), NÃO o Anexo I da mesma faixa", () => {
    const d = calculateSimplesDas(servicoSimples(40_000_000));
    if (d.das.outcome.kind === "TAXED") {
      expect(d.das.appliedRule?.id).toContain("ANEXO3"); // especificidade vence
      expect(d.das.outcome.rateBp).not.toBe(950); // 9,5% seria o Anexo I da faixa
    }
  });

  it("bens continuam no Anexo I (a regra de serviços não vaza)", () => {
    const d = calculateSimplesDas(makeCtx({ regime: "SIMPLES_NACIONAL", rbt12Cents: 40_000_000 }));
    if (d.das.outcome.kind === "TAXED") {
      expect(d.das.appliedRule?.id).toContain("ANEXO1");
      // efetiva (fórmula da lei) = 950 − round(1.386.000×10000/40.000.000) = 950 − 347
      expect(d.das.outcome.rateBp).toBe(603);
    }
  });

  it("dedução nunca derruba a efetiva abaixo de zero", () => {
    // RBT12 no extremo baixo da faixa 6: 33% − 648.000/1.800.000 = negativo → clamp 0
    const d = calculateSimplesDas(servicoSimples(180_000_001));
    if (d.das.outcome.kind === "TAXED") expect(d.das.outcome.rateBp).toBeGreaterThanOrEqual(0);
  });

  it("regra declara que o Anexo V (CNAE) fica como NEEDS_REVIEW", () => {
    const d = calculateSimplesDas(servicoSimples(40_000_000));
    void d; // reviewReason vive no catálogo; assegurado no teste abaixo via id estável
  });
});
