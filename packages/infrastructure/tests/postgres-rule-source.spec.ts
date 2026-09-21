import { describe, expect, it } from "vitest";
import { calculateIcmsWith } from "@tributax/domain";
import { PostgresRuleSource, seedRuleCatalog } from "../src/postgres-rule-source.js";

/**
 * Integração com Postgres: seed do catálogo + cálculo contra as regras
 * persistidas (o coração do "regras como dados"). Pula sem DATABASE_URL.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const d = describe.skipIf(!DATABASE_URL);

d("PostgresRuleSource — catálogo persistido alimenta o motor", () => {
  it("seed + load + decisão equivalente ao catálogo gerado", async () => {
    await seedRuleCatalog(DATABASE_URL!);
    const source = new PostgresRuleSource(DATABASE_URL!);

    const ctx = {
      asOfDate: new Date("2026-09-18T12:00:00Z"),
      issuerState: "MG" as const,
      recipientState: "SP" as const,
      recipientRole: "FINAL_CONSUMER" as const,
      operationKind: "SALE_GOODS" as const,
      fiscalDocumentType: "NFCE" as const,
      regime: "NORMAL" as const,
      items: [{ id: "1", description: "Produto", quantity: 1, unitPriceCents: 100000 }],
    };

    const fromDb = await source.loadRules(ctx);
    expect(fromDb.length).toBeGreaterThan(10);

    const decision = calculateIcmsWith(ctx, fromDb);
    expect(decision.icms.outcome).toMatchObject({ kind: "TAXED", rateBp: 1200, amountCents: 12000 });
    // DIFAL base dupla (LC 190/22 art. 13 IX b): 7317 sobre R$ 1.000
    expect(decision.difal?.outcome).toMatchObject({ amountCents: 7317 });
    // SP não cobra FCP geral (correção auditoria) — ausência, não valor
    expect(decision.fcp).toBeUndefined();
  });

  it("asOfDate fora da vigência não retorna regras (viagem no tempo)", async () => {
    const source = new PostgresRuleSource(DATABASE_URL!);
    const ctx = {
      asOfDate: new Date("2020-01-01T00:00:00Z"),
      issuerState: "MG" as const,
      recipientState: "MG" as const,
      recipientRole: "CONTRIBUTOR" as const,
      operationKind: "SALE_GOODS" as const,
      fiscalDocumentType: "NFE" as const,
      regime: "NORMAL" as const,
      items: [{ id: "1", description: "Produto", quantity: 1, unitPriceCents: 100000 }],
    };
    const rules = await source.loadRules(ctx);
    expect(rules).toHaveLength(0);
  });
});
