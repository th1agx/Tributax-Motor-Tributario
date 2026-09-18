import type { FiscalContext } from "../src/decision/fiscal-context.js";

export type CtxOverrides = Partial<FiscalContext>;

export function makeCtx(overrides: CtxOverrides = {}): FiscalContext {
  return {
    asOfDate: new Date("2026-09-18T12:00:00Z"),
    issuerState: "MG",
    recipientState: "MG",
    recipientRole: "CONTRIBUTOR",
    operationKind: "SALE_GOODS",
    fiscalDocumentType: "NFE",
    regime: "NORMAL",
    items: [
      {
        id: "1",
        description: "Produto",
        quantity: 1,
        unitPriceCents: 100000,
        ncm: "84713012",
        origin: "DOMESTIC",
      },
    ],
    ...overrides,
  };
}
