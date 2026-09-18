import { describe, expect, it } from "vitest";
import { regimeAt, issuerProfileAt, type Party } from "../src/parties/parties.controller.js";

const party: Party = {
  taxId: "12345678000199",
  legalName: "Empresa Teste LTDA",
  type: "COMPANY",
  establishments: [
    {
      address: { state: "RJ" },
      taxRegimes: [
        { regime: "SIMPLES_NACIONAL", validFrom: "2020-01-01", validTo: "2025-12-31" },
        { regime: "NORMAL", validFrom: "2026-01-01" },
      ],
    },
  ],
};

describe("parties — regimes como intervalos temporais", () => {
  it("regime vigente em 2024 é Simples; em 2026 é Normal (mudança respeita a data)", () => {
    expect(regimeAt(party.establishments[0]!, new Date("2024-06-01"))).toBe("SIMPLES_NACIONAL");
    expect(regimeAt(party.establishments[0]!, new Date("2026-06-01"))).toBe("NORMAL");
  });

  it("lacuna temporal não tem regime — explicitamente undefined", () => {
    expect(regimeAt(party.establishments[0]!, new Date("2019-06-01"))).toBeUndefined();
  });

  it("issuerProfileAt expõe UF + regime para a decisão", () => {
    expect(issuerProfileAt(party, new Date("2026-06-01"))).toEqual({ state: "RJ", regime: "NORMAL" });
  });
});
