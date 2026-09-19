import { describe, expect, it } from "vitest";
import { parseStCsv, buildStRules } from "../src/st-import.js";
import { calculateIcmsStWith } from "@tributax/domain";
import type { FiscalContext } from "@tributax/domain";

const CSV = `uf;ncm;mva
SP;30049099;37,54
MG;30049099;40
XX;30049099;30
SP;123;30
SP;30049099;50
`;

function ctx(ncm: string, dest: string): FiscalContext {
  return {
    asOfDate: new Date("2026-09-19T00:00:00Z"),
    issuerState: "MG",
    recipientState: dest as never,
    recipientRole: "CONTRIBUTOR",
    operationKind: "SALE_GOODS",
    fiscalDocumentType: "NFE",
    regime: "NORMAL",
    items: [{ id: "1", description: "Produto", quantity: 1, unitPriceCents: 100000, ncm }],
  };
}

describe("parseStCsv", () => {
  it("aceita ; com decimal vírgula; rejeita UF inválida e NCM curto", () => {
    const rows = parseStCsv(CSV);
    expect(rows).toHaveLength(3); // XX inválido e NCM 123 descartados
  });
});

describe("buildStRules + cálculo ST importado", () => {
  const rules = buildStRules(parseStCsv(CSV));

  it("dedupe por UF+NCM (SP 30049099 fica com a primeira MVA)", () => {
    expect(rules).toHaveLength(2);
    const sp = rules.find((r) => r.id.includes("SP"))!;
    expect(sp.effects[0]).toEqual({ type: "applySt", mvaBp: 3754, rateBp: 1800 }); // MVA da 1ª linha
  });

  it("regra importada calcula ST real (SP: base 1375,40, bruto 247,57)", () => {
    const { icmsSt } = calculateIcmsStWith(ctx("30049099", "SP"), rules);
    expect(icmsSt.outcome.kind).toBe("TAXED");
    if (icmsSt.outcome.kind === "TAXED") {
      expect(icmsSt.outcome.basisCents).toBe(137540);
      expect(icmsSt.outcome.amountCents).toBe(24757);
    }
  });

  it("MG usa a MVA e alíquota interna de MG (18%)", () => {
    const { icmsSt } = calculateIcmsStWith(ctx("30049099", "MG"), rules);
    if (icmsSt.outcome.kind === "TAXED") {
      expect(icmsSt.outcome.rateBp).toBe(1800);
      expect(icmsSt.outcome.basisCents).toBe(140000); // 1000 × 1,40
    }
  });

  it("UF sem regra importada continua NO_RULE_FOUND", () => {
    const { icmsSt } = calculateIcmsStWith(ctx("30049099", "BA"), rules);
    expect(icmsSt.outcome.kind).toBe("NO_RULE_FOUND");
  });
});
