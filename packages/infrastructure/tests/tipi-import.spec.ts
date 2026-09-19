import { describe, expect, it } from "vitest";
import { parseTipiCsv, buildTipiRules } from "../src/tipi-import.js";
import { calculateIpiWith } from "@tributax/domain";
import type { FiscalContext } from "@tributax/domain";

function ctxWithNcm(ncm: string): FiscalContext {
  return {
    ...baseCtx,
    items: [{ ...baseCtx.items[0]!, ncm }],
  };
}

const baseCtx: FiscalContext = {
  asOfDate: new Date("2026-09-19T00:00:00Z"),
  issuerState: "MG",
  recipientState: "MG",
  recipientRole: "CONTRIBUTOR",
  operationKind: "SALE_GOODS",
  fiscalDocumentType: "NFE",
  regime: "NORMAL",
  items: [{ id: "1", description: "Produto", quantity: 1, unitPriceCents: 100000, ncm: "00000000" }],
};

const CSV = `ncm;descricao;aliquota
30049099;Medicamento;0
30045010;Medicamento outro;0
22083000;Whisky;20
84713012;Notebook;0
84713099;Outros computadores;10
`;

describe("parseTipiCsv", () => {
  it("aceita ; com decimal vírgula, com header", () => {
    const rows = parseTipiCsv(CSV);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({ ncm: "30049099", aliquota: 0 });
    expect(rows[2]).toEqual({ ncm: "22083000", aliquota: 20 });
  });

  it("aceita , sem header e decimal ponto", () => {
    const rows = parseTipiCsv("30049099,Medicamento,0\n22083000,Whisky,5.5");
    expect(rows).toHaveLength(2);
    expect(rows[1]!.aliquota).toBe(5.5);
  });

  it("descarta linhas inválidas (NCM curto, alíquota ausente)", () => {
    const rows = parseTipiCsv("ncm;aliquota\n1234;10\n30049099;abc\n22083000;10");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ncm).toBe("22083000");
  });
});

describe("buildTipiRules — compressão por capítulo", () => {
  const rules = buildTipiRules(parseTipiCsv(CSV));

  it("capítulo puro (30, tudo 0%) vira UMA regra ncmStartsWith", () => {
    const ch30 = rules.filter((r) => r.id.includes("CH30"));
    expect(ch30).toHaveLength(1);
    expect(ch30[0]!.condition).toEqual({ kind: "predicate", predicate: "ncmStartsWith", args: { prefix: "30" } });
  });

  it("capítulo misturado (84: 0% e 10%) vira blocos ncmIn por alíquota", () => {
    const ch84 = rules.filter((r) => r.id.includes("BLK84"));
    expect(ch84.length).toBe(2); // um bloco 0%, um bloco 10%
    for (const r of ch84) expect(r.condition.kind).toBe("predicate");
  });

  it("NCM 84713012 (0%) calcula IPI zero; 84713099 (10%) calcula 10%; whisky 20%", () => {
    for (const [ncm, rateBp] of [["84713012", 0], ["84713099", 1000], ["22083000", 2000], ["30049099", 0]] as const) {
      const d = calculateIpiWith(ctxWithNcm(ncm), rules);
      expect(d.ipi.outcome.kind, ncm).toBe("TAXED");
      if (d.ipi.outcome.kind === "TAXED") expect(d.ipi.outcome.rateBp, ncm).toBe(rateBp);
    }
  });

  it("NCM fora da TIPI importada cai nas regras do módulo (não inventa)", () => {
    const d = calculateIpiWith(ctxWithNcm("99999999"), rules);
    expect(d.ipi.outcome.kind).toBe("NO_RULE_FOUND");
  });

  it("regras importadas têm origin IMPORTED e prioridade acima das gerais", () => {
    for (const r of rules) {
      expect(r.origin).toBe("IMPORTED");
      expect(r.priority).toBe(1);
      expect(r.reviewReason).toMatch(/TIPI oficial/);
    }
  });
});
