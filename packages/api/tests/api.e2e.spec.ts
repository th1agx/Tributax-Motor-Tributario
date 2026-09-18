import { describe, expect, it, beforeAll } from "vitest";
import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { ExpressAdapter } from "@nestjs/platform-express";
import { TaxDecisionsController } from "../src/tax-decisions/tax-decisions.controller.js";

describe("API e2e — /v1/tax-decisions", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TaxDecisionsController],
    }).compile();
    app = moduleRef.createNestApplication(new ExpressAdapter());
    await app.init();
  });

  it("venda interestadual MG → SP consumidor final: 12% + DIFAL 20/80 + FCP 2%", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/tax-decisions")
      .send({
        correlationId: "e2e-1",
        context: { recipient: { address: { state: "SP" } } },
        items: [{ description: "Produto", quantity: 1, unitPrice: { amount: 100000 } }],
      })
      .expect(201);

    const body = res.body;
    expect(body.correlationId).toBe("e2e-1");
    expect(body.derivedTier).toBe("INTERMEDIATE");
    expect(body.fiscalDocumentType).toBe("NFCE");
    expect(body.engineVersion).toMatch(/^0\.1\.0/);
    expect(body.rulesetHash).toMatch(/^[0-9a-f]{8}$/);

    const taxes = Object.fromEntries(body.items[0].taxes.map((t: { tax: string; amountCents?: number }) => [t.tax, t.amountCents]));
    expect(taxes.ICMS).toBe(12000);
    expect(taxes.DIFAL).toBe(6000);
    expect(taxes.FCP).toBe(2000);

    expect(body.inferences.length).toBeGreaterThan(0);
    expect(body.totals).toHaveLength(3);
  });

  it("payload mínimo sem endereço: operação interna MG 18%, sem DIFAL", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/tax-simulations")
      .send({
        correlationId: "e2e-2",
        items: [{ description: "Produto", unitPrice: { amount: 50000 } }],
      })
      .expect(201);

    const taxes = Object.fromEntries(res.body.items[0].taxes.map((t: { tax: string; amountCents?: number }) => [t.tax, t.amountCents]));
    expect(taxes.ICMS).toBe(9000); // 18% de R$ 500
    expect(taxes.DIFAL).toBeUndefined();
    expect(res.body.derivedTier).toBe("MINIMAL");
  });

  it("detailLevel FULL_TRACE inclui o trace da decisão", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/tax-simulations")
      .send({
        correlationId: "e2e-3",
        options: { detailLevel: "FULL_TRACE" },
        items: [{ description: "Produto", unitPrice: { amount: 100000 } }],
      })
      .expect(201);
    expect(Array.isArray(res.body.trace)).toBe(true);
    expect(res.body.trace.map((s: { phase: string }) => s.phase)).toContain("MATCHING");
  });

  it("sem correlationId → erro de validação", async () => {
    await request(app.getHttpServer())
      .post("/v1/tax-simulations")
      .send({ items: [{ unitPrice: { amount: 1 } }] })
      .expect(400);
  });

  it("decisão persistida é recuperável por id; id inexistente → 400", async () => {
    const created = await request(app.getHttpServer())
      .post("/v1/tax-decisions")
      .send({ correlationId: "e2e-4", items: [{ unitPrice: { amount: 100000 } }] })
      .expect(201);

    const found = await request(app.getHttpServer())
      .get(`/v1/tax-decisions/${created.body.decisionId}`)
      .expect(200);
    expect(found.body.correlationId).toBe("e2e-4");

    await request(app.getHttpServer())
      .get("/v1/tax-decisions/00000000-0000-4000-8000-000000000000")
      .expect(400);
  });
});
