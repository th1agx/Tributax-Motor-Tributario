import { describe, expect, it } from "vitest";
import { parseIssNacional, groupIssNacional, buildIssNacionalRules } from "../src/iss-import-nacional.js";
import { calculateIssWith } from "@tributax/domain";
import { compile } from "@tributax/domain";

const SAMPLE = [
  "codigo_ibge;uf;nome_municipio;codigo_servico;incidencia;aliquota;dt_ini;dt_fim",
  "3106200;MG;Belo Horizonte;01.01.01.000;01.01.01.000;5;2026-01-01T00:00:00;",
  "3106200;MG;Belo Horizonte;01.02.01.000;01.02.01.000;3;2026-01-01T00:00:00;",
  "3106200;MG;Belo Horizonte;01.03.01.000;01.03.01.000;3;2026-02-01T00:00:00;",
  "3550308;SP;São Paulo;01.01.01.000;01.01.01.000;2,9;2026-01-01T00:00:00;",
  "3106200;MG;Belo Horizonte;01.04.01.000;01.04.01.000;9;2026-01-01T00:00:00;",  // fora da banda → descarta
  "31;MG;Inválido;01.01.01.000;01.01.01.000;3;2026-01-01T00:00:00;",               // ibge inválido
].join("\n");

describe("importador nacional ISSQN (planilha Portal NFS-e)", () => {
  it("parser aceita formato oficial e descarta fora da banda/ibge inválido", () => {
    const rows = parseIssNacional(SAMPLE);
    expect(rows).toHaveLength(4); // 9% descartado, ibge curto descartado
    expect(rows[0]).toMatchObject({ ibge: "3106200", uf: "MG", codigoServico: "01.01.01.000", aliquota: 5, dtIni: "2026-01-01" });
    expect(rows[3]).toMatchObject({ aliquota: 2.9 }); // vírgula decimal ok
  });

  it("agrupa por município × alíquota com menor dt_ini e lista de códigos", () => {
    const groups = groupIssNacional(parseIssNacional(SAMPLE));
    expect(groups).toHaveLength(3); // BH-500, BH-300, SP-290
    const bh300 = groups.find((g) => g.ibge === "3106200" && g.rateBp === 300)!;
    expect(bh300.validFrom).toBe("2026-01-01"); // menor dt_ini do grupo
    expect(bh300.codes).toEqual(["01.02.01.000", "01.03.01.000"]);
  });

  it("regras casam por município do prestador E código de serviço; código não listado → NO_RULE_FOUND", () => {
    const rules = buildIssNacionalRules(groupIssNacional(parseIssNacional(SAMPLE)));
    // condição compila contra o vocabulário (guarda de carga)
    for (const r of rules) expect(() => compile(r.condition)).not.toThrow();

    const ctx = (ibge: string | undefined, code: string) => ({
      asOfDate: new Date("2026-06-01"),
      issuerState: "MG" as const,
      recipientState: "MG" as const,
      recipientRole: "FINAL_CONSUMER" as const,
      operationKind: "SERVICE_PROVISION" as const,
      fiscalDocumentType: "NFSE" as const,
      regime: "NORMAL" as const,
      ...(ibge ? { issuerMunicipality: ibge } : {}),
      items: [{ id: "1", description: "Serviço", quantity: 1, unitPriceCents: 100000, serviceCode: code }],
    });

    // serviço 5% em BH
    const t5 = calculateIssWith(ctx("3106200", "01.01.01.000"), rules);
    expect(t5.iss.outcome).toMatchObject({ kind: "TAXED", rateBp: 500, amountCents: 5000 });
    // serviço 3% em BH
    const t3 = calculateIssWith(ctx("3106200", "01.02.01.000"), rules);
    expect(t3.iss.outcome).toMatchObject({ kind: "TAXED", rateBp: 300, amountCents: 3000 });
    // código não listado para BH → honesto
    const none = calculateIssWith(ctx("3106200", "09.99.99.000"), rules);
    expect(none.iss.outcome.kind).toBe("NO_RULE_FOUND");
    // sem município informado → honesto
    const semMun = calculateIssWith(ctx(undefined, "01.01.01.000"), rules);
    expect(semMun.iss.outcome.kind).toBe("NO_RULE_FOUND");
  });
});
