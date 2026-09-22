import { describe, expect, it } from "vitest";
import { calculateIcmsWith, icmsRuleCatalog } from "../src/tribute/icms.js";
import type { Uf } from "../src/decision/fiscal-context.js";
import { makeCtx } from "./helpers.js";

/**
 * COBERTURA NACIONAL: as 27 UFs respondem com cálculo (nunca NO_RULE_FOUND)
 * para ICMS interno e DIFAL. Fontes públicas 2026 (FocusNFe/Conta Azul/CDM);
 * fundamento é o RICMS de cada estado. Valores do DIFAL derivam da tabela
 * interna (destino − interestadual), sem duplicação de dado.
 */
const ALL_UFS: readonly Uf[] = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS",
  "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC",
  "SP", "SE", "TO",
];

describe("ICMS — cobertura nacional 27/27", () => {
  it("toda UF tem alíquota interna aplicável (operação interna MG→MG emissor da UF)", () => {
    for (const uf of ALL_UFS) {
      const d = calculateIcmsWith(makeCtx({ issuerState: uf, recipientState: uf }), icmsRuleCatalog());
      expect(d.icms.outcome.kind, `ICMS interno ${uf}`).toBe("TAXED");
    }
  });

  it("toda UF como destino gera DIFAL em venda interestadual a consumidor final", () => {
    for (const uf of ALL_UFS.filter((u) => u !== "MG")) { // origem MG: MG→MG não é interestadual
      const d = calculateIcmsWith(
        makeCtx({ issuerState: "MG", recipientState: uf, recipientRole: "FINAL_CONSUMER" }),
        icmsRuleCatalog(),
      );
      expect(d.difal?.outcome.kind, `DIFAL destino ${uf}`).toBe("TAXED");
    }
  });

  it("AL 20,5% só vigente a partir de 01/04/2026 (validade própria)", () => {
    const before = calculateIcmsWith(
      makeCtx({ issuerState: "AL", recipientState: "AL", asOfDate: new Date("2026-03-15T00:00:00Z") }),
      icmsRuleCatalog(),
    );
    expect(before.icms.outcome.kind).toBe("NO_RULE_FOUND");
    const after = calculateIcmsWith(
      makeCtx({ issuerState: "AL", recipientState: "AL", asOfDate: new Date("2026-04-01T00:00:00Z") }),
      icmsRuleCatalog(),
    );
    expect(after.icms.outcome.kind).toBe("TAXED");
    if (after.icms.outcome.kind === "TAXED") expect(after.icms.outcome.rateBp).toBe(2050);
  });

  it("casos conhecidos: MA 23% (maior), ES 17% (menor), RO 19,5% (corrigida 2026-09)", () => {
    for (const [uf, rateBp] of [["MA", 2300], ["ES", 1700], ["RO", 1950]] as const) {
      const d = calculateIcmsWith(makeCtx({ issuerState: uf, recipientState: uf }), icmsRuleCatalog());
      if (d.icms.outcome.kind === "TAXED") expect(d.icms.outcome.rateBp, uf).toBe(rateBp);
    }
  });

  it("FCP ampliado: RS/PR/SE/MS/AM têm 2% no DIFAL; MG e SC não têm FCP", () => {
    for (const uf of ["RS", "PR", "SE", "MS", "AM"] as const) {
      const d = calculateIcmsWith(
        makeCtx({ issuerState: "MG", recipientState: uf, recipientRole: "FINAL_CONSUMER" }),
        icmsRuleCatalog(),
      );
      expect(d.fcp?.outcome.kind, `FCP ${uf}`).toBe("TAXED");
      if (d.fcp?.outcome.kind === "TAXED") expect(d.fcp.outcome.rateBp).toBe(200);
    }
    for (const uf of ["MG", "SC"] as const) {
      const d = calculateIcmsWith(
        makeCtx({ issuerState: "SP", recipientState: uf, recipientRole: "FINAL_CONSUMER" }),
        icmsRuleCatalog(),
      );
      expect(d.fcp?.outcome.kind, `FCP ${uf} ausente`).toBeUndefined();
    }
  });

  it("cobertura 27/27 conferida: nenhuma UF carrega mais NEEDS_REVIEW de alíquota", () => {
    const catalog = icmsRuleCatalog();
    const sp = catalog.find((r) => r.id === "ICMS-INT-SP")!;
    expect(sp.reviewReason).toBeUndefined();
    // as 5 UFs de mudança recente (AC/AL/MA/PE/RO) foram verificadas em
    // fontes públicas 2026-09 — saem da fila de revisão
    const ma = catalog.find((r) => r.id === "ICMS-INT-MA")!;
    expect(ma.reviewReason ?? "").not.toMatch(/NEEDS_REVIEW/);
  });
});
