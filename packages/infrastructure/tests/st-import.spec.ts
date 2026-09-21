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

  it("dedupe por UF+NCM (SP 30049099 fica com a primeira MVA; 3 variantes por linha)", () => {
    // 2 linhas válidas × 3 variantes (interna, inter12, inter7) = 6 regras
    expect(rules).toHaveLength(6);
    const spInt = rules.find((r) => r.id.includes("SP") && r.id.endsWith("-INT"))!;
    expect(spInt.effects[0]).toEqual({ type: "applySt", mvaBp: 3754, rateBp: 1800 }); // MVA da 1ª linha
    // interestadual 12%: MVA ajustada (Conv. 92/15 art. 2º VIII)
    const spInter = rules.find((r) => r.id.includes("SP") && r.id.endsWith("-INTER12"))!;
    expect((spInter.effects[0] as { mvaBp: number }).mvaBp).toBeGreaterThan(3754);
  });

  it("regra importada calcula ST real — MG→SP interestadual usa MVA AJUSTADA (base 1476,00, bruto 265,68)", () => {
    const { icmsSt } = calculateIcmsStWith(ctx("30049099", "SP"), rules);
    expect(icmsSt.outcome.kind).toBe("TAXED");
    if (icmsSt.outcome.kind === "TAXED") {
      // MVA 37,54% ajustada (inter 12%, interna SP 18%) = 47,60%
      expect(icmsSt.outcome.basisCents).toBe(147600);
      expect(icmsSt.outcome.amountCents).toBe(26568);
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
