import { describe, expect, it, beforeAll } from "vitest";
import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { ExpressAdapter } from "@nestjs/platform-express";
import { TaxDecisionsController } from "../src/tax-decisions/tax-decisions.controller.js";
import { PartiesController } from "../src/parties/parties.controller.js";
import { RulesAdminController } from "../src/rules/rule-admin.controller.js";
import { DocsController } from "../src/docs/docs.controller.js";

describe("API e2e — /v1/tax-decisions", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TaxDecisionsController, PartiesController, RulesAdminController, DocsController],
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
    expect(taxes.PIS).toBe(1650);
    expect(taxes.COFINS).toBe(7600);

    expect(body.inferences.length).toBeGreaterThan(0);
    expect(body.totals).toHaveLength(5);
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

  it("/v1/parties: emissor real RJ/Normal calcula 20% interno; asOf antigo usa Simples (sem regra → NO_RULE_FOUND)", async () => {
    const created = await request(app.getHttpServer())
      .post("/v1/parties")
      .send({
        taxId: "12345678000199",
        legalName: "Empresa Teste LTDA",
        type: "COMPANY",
        establishments: [{
          address: { state: "RJ" },
          taxRegimes: [
            { regime: "SIMPLES_NACIONAL", validFrom: "2020-01-01", validTo: "2025-12-31" },
            { regime: "NORMAL", validFrom: "2026-01-01" },
          ],
        }],
      })
      .expect(201);
    expect(created.body.id).toBeDefined();

    // 2026: RJ Normal → ICMS interno RJ 20%
    const now = await request(app.getHttpServer())
      .post("/v1/tax-simulations")
      .send({
        correlationId: "e2e-party-1",
        context: { issuer: { partyRef: "12345678000199" } },
        items: [{ unitPrice: { amount: 100000 } }],
      })
      .expect(201);
    const taxesNow = Object.fromEntries(now.body.items[0].taxes.map((t: { tax: string; amountCents?: number }) => [t.tax, t.amountCents]));
    expect(taxesNow.ICMS).toBe(20000);
    expect(now.body.inferences.map((i: { field: string }) => i.field)).toContain("context.issuer");

    // 2024: Simples Nacional → sem regra de ICMS normal (digno de NO_RULE_FOUND)
    const past = await request(app.getHttpServer())
      .post("/v1/tax-simulations")
      .send({
        correlationId: "e2e-party-2",
        asOfDate: "2024-06-01",
        context: { issuer: { partyRef: "12345678000199" } },
        items: [{ unitPrice: { amount: 100000 } }],
      })
      .expect(201);
    const taxesPast = Object.fromEntries(past.body.items[0].taxes.map((t: { tax: string; outcome: string }) => [t.tax, t.outcome]));
    expect(taxesPast.ICMS).toBe("NO_RULE_FOUND");
  });

  it("partyRef inexistente → 400 com diagnóstico", async () => {
    await request(app.getHttpServer())
      .post("/v1/tax-simulations")
      .send({
        correlationId: "e2e-party-3",
        context: { issuer: { partyRef: "00000000000000" } },
        items: [{ unitPrice: { amount: 1000 } }],
      })
      .expect(400);
  });

  it("/v1/rules: regra isenção SE aprovada passa a valer no cálculo", async () => {
    // SE interna hoje → NO_RULE_FOUND (sem alíquota no catálogo)
    const before = await request(app.getHttpServer())
      .post("/v1/tax-simulations")
      .send({
        correlationId: "e2e-rules-1",
        context: { issuer: { partyRef: "12345678000199" } }, // RJ (normal)
        items: [{ unitPrice: { amount: 100000 } }],
      })
      .expect(201);
    expect(before.body.items[0].taxes[0].outcome).toBe("TAXED"); // RJ 20%

    // cria proposta de isenção para SE, aprova e ativa
    const created = await request(app.getHttpServer())
      .post("/v1/rules")
      .send({
        tribute: "ICMS",
        name: "Isenção interna SE (e2e)",
        jurisdiction: { scope: "STATE", code: "SE" },
        condition: { kind: "and", children: [
          { kind: "predicate", predicate: "isInternal" },
          { kind: "predicate", predicate: "issuerStateIs", args: { uf: "SE" } },
          { kind: "predicate", predicate: "regimeIs", args: { regime: "NORMAL" } },
        ] },
        effects: [{ type: "exempt" }],
        validFrom: "2026-01-01",
        legalBasis: { documentType: "REGULAMENTO_ESTADUAL", number: "RICMS", year: "SE" },
      })
      .expect(201);
    const ruleId = created.body.rule.id;

    for (const to of ["REVIEW", "APPROVED", "ACTIVE"]) {
      await request(app.getHttpServer())
        .post(`/v1/rules/${ruleId}/transitions`)
        .send({ version: 1, to, actor: "HUMAN" })
        .expect(201);
    }

    // simulação com emissor SE: isenção aplicada com fundamento
    const seParty = await request(app.getHttpServer())
      .post("/v1/parties")
      .send({
        taxId: "99999999000199",
        legalName: "Empresa Sergipana",
        type: "COMPANY",
        establishments: [{ address: { state: "SE" }, taxRegimes: [{ regime: "NORMAL", validFrom: "2020-01-01" }] }],
      })
      .expect(201);

    const after = await request(app.getHttpServer())
      .post("/v1/tax-simulations")
      .send({
        correlationId: "e2e-rules-2",
        context: { issuer: { partyRef: "99999999000199" } },
        items: [{ unitPrice: { amount: 100000 } }],
      })
      .expect(201);
    const icms = after.body.items[0].taxes[0];
    expect(icms.outcome).toBe("EXEMPT");
    expect(icms.legalBases.join(" ")).toMatch(/SE/);
  });

  it("condição inválida em /v1/rules → 400 CONDITION_INVALID", async () => {
    await request(app.getHttpServer())
      .post("/v1/rules")
      .send({
        tribute: "ICMS",
        name: "quebrada",
        jurisdiction: { scope: "FEDERAL" },
        condition: { kind: "predicate", predicate: "naoExiste" },
        effects: [{ type: "applyRate", rateBp: 100 }],
        validFrom: "2026-01-01",
      })
      .expect(400);
  });

  it("/openapi.yaml serve o contrato; /docs serve o Swagger UI", async () => {
    const spec = await request(app.getHttpServer()).get("/openapi.yaml").expect(200);
    expect(spec.text).toMatch(/openapi: 3\.1\.0/);
    expect(spec.text).toContain("/v1/tax-decisions");
    expect(spec.text).toContain("/v1/rules/{id}/transitions");

    const ui = await request(app.getHttpServer()).get("/docs").expect(200);
    expect(ui.text).toMatch(/swagger-ui/i);
  });
});
