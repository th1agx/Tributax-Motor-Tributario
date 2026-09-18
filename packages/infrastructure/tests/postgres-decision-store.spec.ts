import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PostgresDecisionStore } from "../src/postgres-decision-store.js";

/**
 * Integração real com Postgres (ADR-003). Roda apenas com DATABASE_URL
 * (ex.: via docker compose up postgres); sem ela, pula — o CI local de
 * domínio/API não exige banco.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const d = describe.skipIf(!DATABASE_URL);

d("PostgresDecisionStore — integração", () => {
  it("salva e recupera uma decisão (append-only)", async () => {
    const store = new PostgresDecisionStore(DATABASE_URL!);
    const decision = {
      decisionId: randomUUID(),
      correlationId: "it-1",
      engineVersion: "0.1.0-phase0",
      rulesetHash: "deadbeef",
      asOfDate: new Date(),
      derivedTier: "MINIMAL",
      response: { outcome: "TAXED", amountCents: 18000 },
    };
    await store.save(decision);
    const found = await store.findById(decision.decisionId);
    expect(found).toBeDefined();
    expect(found?.correlationId).toBe("it-1");
    expect((found?.response as { amountCents: number }).amountCents).toBe(18000);
  });

  it("id inexistente → undefined; id não-UUID → erro claro", async () => {
    const store = new PostgresDecisionStore(DATABASE_URL!);
    expect(await store.findById(randomUUID())).toBeUndefined();
    await expect(store.findById("não-uuid")).rejects.toThrow(/UUID/);
  });
});
