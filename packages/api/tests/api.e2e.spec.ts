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
  // /v1/rules agora exige admin key (auditoria 3.7)
  const ADMIN_KEY = "e2e-admin-key";
  process.env.TRIBUTAX_ADMIN_KEY = ADMIN_KEY;
  const adminSet = { "x-admin-key": ADMIN_KEY };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TaxDecisionsController, PartiesController, RulesAdminController, DocsController],
    }).compile();
    app = moduleRef.createNestApplication(new ExpressAdapter());
    await app.init();
    // emissor padrão dos testes (agora OBRIGATÓRIO no payload)
    await request(app.getHttpServer())
      .post("/v1/parties")
      .send({
        taxId: "11111111000111",
        legalName: "Emissor Padrao MG",
        type: "COMPANY",
        establishments: [{ address: { state: "MG" }, taxRegimes: [{ regime: "NORMAL", validFrom: "2020-01-01" }] }],
      })
      .expect(201);
  });

  const EMITTER = { context: { issuer: { partyRef: "11111111000111" } } };

  it("venda interestadual MG → SP consumidor final: 12% + DIFAL base dupla; SP sem FCP", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/tax-decisions")
      .send({
        correlationId: "e2e-1",
        ...EMITTER,
        context: { ...EMITTER.context, recipient: { address: { state: "SP" } } },
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
    // DIFAL base dupla (LC 190/22 art. 13 IX b): 7317 sobre R$ 1.000
    expect(taxes.DIFAL).toBe(7317);
    expect(taxes.FCP).toBeUndefined(); // SP não cobra FCP geral (correção auditoria)
    expect(taxes.PIS).toBe(1650);
    expect(taxes.COFINS).toBe(7600);
    // reforma tributária (LC 214/25): alíquotas-teste 2026 sobre a base
    expect(taxes.CBS).toBe(900);
    expect(taxes.IBS).toBe(100);

    expect(body.inferences.length).toBeGreaterThan(0);
    expect(body.totals).toHaveLength(6);
  });

  it("decisão POR ITEM (fim do itemId '*'): medicamento NCM 30 zera IPI só naquele item", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/tax-simulations")
      .send({
        correlationId: "e2e-per-item",
        ...EMITTER,
        items: [
          { id: "normal", description: "Eletrônico", quantity: 1, unitPrice: { amount: 100000 }, classification: { ncm: "84713012" } },
          { id: "medicamento", description: "Medicamento", quantity: 1, unitPrice: { amount: 50000 }, classification: { ncm: "30049099" } },
        ],
      })
      .expect(201);

    // itens com itemId real, não "*"
    const ids = res.body.items.map((i: { itemId: string }) => i.itemId).sort();
    expect(ids).toEqual(["medicamento", "normal"]);

    const byItem = Object.fromEntries(
      res.body.items.map((i: { itemId: string; taxes: { tax: string; outcome: string; amountCents?: number }[] }) => [
        i.itemId,
        Object.fromEntries(i.taxes.map((t) => [t.tax, t])),
      ]),
    );
    // medicamento (capítulo 30): IPI alíquota zero NAQUELA linha
    expect(byItem.medicamento.IPI.outcome).toBe("TAXED");
    expect(byItem.medicamento.IPI.amountCents).toBe(0);
    expect(byItem.medicamento.IPI.appliedRules.join(" ")).toContain("IPI-MEDICAMENTOS-ZERO");
    // item normal de outro capítulo não é arrastado para a regra do medicamento
    expect(byItem.normal.IPI.appliedRules.join(" ")).not.toContain("IPI-MEDICAMENTOS-ZERO");
    // ICMS interno MG 18% por item: 18000 e 9000
    expect(byItem.normal.ICMS.amountCents).toBe(18000);
    expect(byItem.medicamento.ICMS.amountCents).toBe(9000);
    // total consolida os dois itens
    const totalIcms = res.body.totals.find((t: { tax: string }) => t.tax === "ICMS");
    expect(totalIcms.amountCents).toBe(27000);
  });

  it("sem emissor → 400 explícito (fim do default MG, auditoria 2.7)", async () => {
    await request(app.getHttpServer())
      .post("/v1/tax-simulations")
      .send({ correlationId: "e2e-no-issuer", items: [{ unitPrice: { amount: 50000 } }] })
      .expect(400);
  });

  it("payload mínimo sem endereço: operação interna MG 18%, sem DIFAL", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/tax-simulations")
      .send({
        correlationId: "e2e-2",
        ...EMITTER,
        items: [{ description: "Produto", unitPrice: { amount: 50000 } }],
      })
      .expect(201);

    const taxes = Object.fromEntries(res.body.items[0].taxes.map((t: { tax: string; amountCents?: number }) => [t.tax, t.amountCents]));
    expect(taxes.ICMS).toBe(9000); // 18% de R$ 500
    expect(taxes.DIFAL).toBeUndefined();
  });

  it("detailLevel FULL_TRACE inclui o trace da decisão (agora de TODOS os tributos)", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/tax-simulations")
      .send({
        correlationId: "e2e-3",
        ...EMITTER,
        options: { detailLevel: "FULL_TRACE" },
        items: [{ description: "Produto", unitPrice: { amount: 100000 } }],
      })
      .expect(201);
    expect(Array.isArray(res.body.trace)).toBe(true);
    expect(res.body.trace.map((s: { phase: string }) => s.phase)).toContain("MATCHING");
    // tributos múltiplos presentes no trace agregado
    expect(res.body.trace.some((s: { tribute?: string }) => s.tribute === "PIS")).toBe(true);
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
      .send({ correlationId: "e2e-4", ...EMITTER, items: [{ unitPrice: { amount: 100000 } }] })
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
          { kind: "predicate", predicate: "recipientStateIs", args: { uf: "SE" } },
          { kind: "predicate", predicate: "regimeIs", args: { regime: "NORMAL" } },
        ] },
        effects: [{ type: "exempt" }],
        validFrom: "2026-01-01",
        legalBasis: { documentType: "REGULAMENTO_ESTADUAL", number: "RICMS", year: "SE" },
      })
      .set(adminSet)
      .expect(201);
    const ruleId = created.body.rule.id;

    for (const to of ["REVIEW", "APPROVED", "ACTIVE"]) {
      await request(app.getHttpServer())
        .post(`/v1/rules/${ruleId}/transitions`)
        .send({ version: 1, to, actor: "HUMAN" })
        .set(adminSet)
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

  it("condição inválida em /v1/rules → 400 CONDITION_INVALID; sem admin key → 403/401", async () => {
    await request(app.getHttpServer())
      .post("/v1/rules")
      .set(adminSet)
      .send({
        tribute: "ICMS",
        name: "quebrada",
        jurisdiction: { scope: "FEDERAL" },
        condition: { kind: "predicate", predicate: "naoExiste" },
        effects: [{ type: "applyRate", rateBp: 100 }],
        validFrom: "2026-01-01",
      })
      .expect(400);

    // sem admin key o catálogo global é inacessível (auditoria 3.7)
    await request(app.getHttpServer())
      .post("/v1/rules")
      .send({ tribute: "ICMS", name: "x", jurisdiction: { scope: "FEDERAL" }, condition: { kind: "predicate", predicate: "isInternal" }, effects: [{ type: "applyRate", rateBp: 100 }], validFrom: "2026-01-01" })
      .expect(401);
  });

  it("/openapi.yaml serve o contrato; /docs serve o site; /docs/api serve o Swagger UI", async () => {
    const spec = await request(app.getHttpServer()).get("/openapi.yaml").expect(200);
    expect(spec.text).toMatch(/openapi: 3\.1\.0/);
    expect(spec.text).toContain("/v1/tax-decisions");
    expect(spec.text).toContain("/v1/rules/{id}/transitions");

    const site = await request(app.getHttpServer()).get("/docs").expect(200);
    expect(site.text).toMatch(/Tributax — Documentação/);
    const css = await request(app.getHttpServer()).get("/docs/site/style.css").expect(200);
    expect(css.text).toContain("--mark: #ffd60a");
    expect(css.text).toContain("Fraunces");
    const ui = await request(app.getHttpServer()).get("/docs/api").expect(200);
    expect(ui.text).toMatch(/swagger-ui/i);
  });

  it("jornada do MEI: serviço inferido como NFSE sem retenção federal (DAS-MEI)", async () => {
    await request(app.getHttpServer())
      .post("/v1/parties")
      .send({
        taxId: "12345678901234",
        legalName: "MEI Teste",
        type: "MEI",
        establishments: [{ address: { state: "MG" }, taxRegimes: [{ regime: "MEI", validFrom: "2020-01-01" }] }],
      })
      .expect(201);

    // prestador MEI → tomador PJ identificado (role AUTO → CONTRIBUTOR)
    const decision = await request(app.getHttpServer())
      .post("/v1/tax-simulations")
      .send({
        correlationId: "e2e-mei-2",
        context: { issuer: { partyRef: "12345678901234" }, recipient: { partyRef: "22222222000191" } },
        items: [{ description: "Consultoria", unitPrice: { amount: 200000 }, classification: { serviceCode: "1.05" } }],
      })
      .expect(201);

    expect(decision.body.fiscalDocumentType).toBe("NFSE");
    expect(decision.body.operationKind).toBe("SERVICE_PROVISION");
    const taxes = Object.fromEntries(decision.body.items[0].taxes.map((t: { tax: string; outcome: string }) => [t.tax, t.outcome]));
    expect(taxes.IRRF).toBe("NO_RULE_FOUND"); // MEI não sofre retenção
    expect(taxes.CSRF).toBe("NO_RULE_FOUND");
  });
});
