import { describe, expect, it } from "vitest";
import { mapRequest, PayloadValidationError } from "../src/tax-decisions/tax-decision.mapper.js";
import type { TaxCalculationRequest } from "../src/tax-decisions/tax-decision.request.js";

const ISSUER = { state: "MG" as const, regime: "NORMAL" as const };

function base(overrides: Partial<TaxCalculationRequest>): TaxCalculationRequest {
  return {
    correlationId: "test-1",
    items: [{ description: "Produto", unitPrice: { amount: 100000 } }],
    ...overrides,
  };
}

describe("mapper — resolução de AUTO e tier derivado", () => {
  it("payload mínimo (MEI): infere kind, documento e role, tier MINIMAL", () => {
    const m = mapRequest(base({}), ISSUER);
    expect(m.derivedTier).toBe("MINIMAL");
    expect(m.ctx.operationKind).toBe("SALE_GOODS");
    expect(m.ctx.fiscalDocumentType).toBe("NFCE"); // sem partyRef → consumidor final
    expect(m.ctx.recipientRole).toBe("FINAL_CONSUMER");
    expect(m.inferences.map((i) => i.field)).toContain("operation.kind");
    expect(m.inferences.map((i) => i.field)).toContain("operation.fiscalDocumentType");
  });

  it("serviceCode presente infere SERVICE_PROVISION + NFSE", () => {
    const m = mapRequest(base({
      items: [{ description: "Consultoria", unitPrice: { amount: 200000 }, classification: { serviceCode: "1.05" } }],
    }), ISSUER);
    expect(m.ctx.operationKind).toBe("SERVICE_PROVISION");
    expect(m.ctx.fiscalDocumentType).toBe("NFSE");
    expect(m.derivedTier).toBe("ADVANCED");
  });

  it("destinatário identificado com endereço → INTERMEDIATE e UF destino aplicada", () => {
    const m = mapRequest(base({
      context: { recipient: { partyRef: "party-1", address: { state: "SP" } } },
    }), ISSUER);
    expect(m.derivedTier).toBe("INTERMEDIATE");
    expect(m.ctx.recipientState).toBe("SP");
    expect(m.ctx.recipientRole).toBe("CONTRIBUTOR");
  });

  it("matriz §8: NFC-e rejeita contribuinte", () => {
    expect(() => mapRequest(base({
      context: { recipient: { partyRef: "p1" } }, // AUTO → CONTRIBUTOR
      operation: { fiscalDocumentType: "NFCE" },
    }), ISSUER)).toThrow(PayloadValidationError);
  });

  it("matriz §8: NFS-e rejeita NCM", () => {
    expect(() => mapRequest(base({
      items: [{ description: "x", unitPrice: { amount: 1 }, classification: { serviceCode: "1.05", ncm: "84713012" } }],
    }), ISSUER)).toThrow(/NFS-e não admite NCM/);
  });

  it("UF inválida é rejeitada com diagnóstico", () => {
    expect(() => mapRequest(base({
      context: { recipient: { address: { state: "XX" } } },
    }), ISSUER)).toThrow(/UF/);
  });

  it("asOfDate retroativo é respeitado (viagem no tempo)", () => {
    const m = mapRequest(base({ asOfDate: "2025-06-15" }), ISSUER);
    expect(m.ctx.asOfDate.toISOString().slice(0, 10)).toBe("2025-06-15");
  });
});
