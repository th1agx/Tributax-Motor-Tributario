import { describe, expect, it } from "vitest";
import { parseIssCsv, buildIssMunicipalRules } from "../src/iss-import.js";
import { calculateIssWith } from "@tributax/domain";
import type { FiscalContext } from "@tributax/domain";

function ctxService(ibge: string): FiscalContext {
  return {
    asOfDate: new Date("2026-09-19T00:00:00Z"),
    issuerState: "MG",
    recipientState: "MG",
    ...(ibge !== "" ? { issuerMunicipality: ibge } : {}),
    recipientRole: "CONTRIBUTOR",
    operationKind: "SERVICE_PROVISION",
    fiscalDocumentType: "NFSE",
    regime: "NORMAL",
    items: [{ id: "1", description: "Serviço", quantity: 1, unitPriceCents: 100000, serviceCode: "1.05" }],
  };
}

const CSV = `ibge;uf;nome;aliquota
3550308;SP;São Paulo;2,9
3106200;MG;Belo Horizonte;3
5208707;GO;Goiânia;3
9999999;XX;Fora;9
`;

describe("parseIssCsv", () => {
  it("aceita ; com decimal vírgula e deduplica ibge", () => {
    const rows = parseIssCsv(CSV + "3550308;SP;São Paulo repetido;5");
    expect(rows).toHaveLength(4); // 3 válidos + o repetido (dedupe é no build)
  });

  it("rejeita alíquota fora da banda 2–5% da LC 116 (linha 'Fora' 9%)", () => {
    const rows = parseIssCsv(CSV);
    expect(rows.every((r) => r.aliquota >= 2 && r.aliquota <= 5)).toBe(true);
  });
});

describe("buildIssMunicipalRules + cálculo", () => {
  const rules = buildIssMunicipalRules(parseIssCsv(CSV + "3550308;SP;São Paulo repetido;5"));

  it("um município por regra, dedupe pela primeira ocorrência", () => {
    expect(rules).toHaveLength(3);
    const sp = rules.find((r) => r.id.includes("3550308"))!;
    expect(sp.name).toContain("2.9%"); // não a repetida de 5%
    expect(sp.jurisdiction).toEqual({ scope: "MUNICIPAL", code: "3550308" });
  });

  it("serviço em Goiânia (5208707) calcula 3% com a regra importada", () => {
    const d = calculateIssWith(ctxService("5208707"), rules);
    expect(d.iss.outcome.kind).toBe("TAXED");
    if (d.iss.outcome.kind === "TAXED") {
      expect(d.iss.outcome.rateBp).toBe(300);
      expect(d.iss.outcome.amountCents).toBe(3000);
    }
  });

  it("município não importado continua NO_RULE_FOUND (não inventa)", () => {
    const d = calculateIssWith(ctxService("4205407"), rules);
    expect(d.iss.outcome.kind).toBe("NO_RULE_FOUND");
  });

  it("regras importadas têm prioridade sobre as do módulo e origin IMPORTED", () => {
    for (const r of rules) {
      expect(r.origin).toBe("IMPORTED");
      expect(r.priority).toBe(1);
    }
  });
});
