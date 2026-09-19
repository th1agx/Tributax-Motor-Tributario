/**
 * Contrato de entrada — espelho tipado do payload-spec (docs/contracts).
 * Fonte de verdade futura: OpenAPI; este arquivo é a v1 do contrato.
 */
export interface TaxCalculationRequest {
  readonly correlationId: string;
  readonly asOfDate?: string; // ISO date
  readonly context?: {
    readonly issuer?: {
      readonly partyRef?: string;
      readonly establishmentRef?: string;
      /** Município do estabelecimento prestador — determina o ISS (LC 116/03 art. 3º). */
      readonly address?: { readonly cityIbgeCode?: string; readonly city?: string };
      /** Receita bruta acumulada em 12 meses (centavos) — determina a faixa do DAS no Simples. */
      readonly rbt12Cents?: number;
    };
    readonly recipient?: {
      readonly partyRef?: string;
      readonly role?: "CONTRIBUTOR" | "NON_CONTRIBUTOR" | "FINAL_CONSUMER" | "AUTO";
      readonly address?: { readonly country?: string; readonly state?: string; readonly city?: string };
    };
  };
  readonly operation?: {
    readonly kind?:
      | "SALE_GOODS" | "SERVICE_PROVISION" | "TRANSFER" | "REMITTANCE" | "RENTAL"
      | "IMPORT" | "EXPORT" | "CONSUMPTION_ASSET" | "AUTO";
    readonly purpose?: "SAMPLE" | "GIFT" | "REPAIR" | "TOLL_MANUFACTURING" | "OTHER";
    readonly fiscalDocumentType?: "NFE" | "NFCE" | "NFSE" | "NONE" | "AUTO";
    /** CFOP de 4 dígitos — se omitido, o motor infere e sinaliza a base da inferência. */
    readonly cfop?: string;
  };
  readonly items: readonly TaxCalculationItem[];
  readonly overrides?: Record<string, unknown>;
  readonly options?: {
    readonly detailLevel?: "SUMMARY" | "FULL_TRACE" | "EXPLANATION";
    readonly explanationAudience?: "DEVELOPER" | "ACCOUNTANT" | "END_USER";
  };
}

export interface TaxCalculationItem {
  readonly id?: string | number;
  readonly description?: string;
  readonly quantity?: number;
  readonly unit?: string;
  readonly unitPrice?: { readonly amount: number; readonly currency?: string };
  readonly classification?: {
    readonly ncm?: string;
    readonly cest?: string;
    readonly serviceCode?: string;
    readonly origin?: "DOMESTIC" | "IMPORTED" | "FOREIGN_SIMILAR" | "AUTO";
  };
  readonly deductions?: readonly { readonly amount?: number; readonly description?: string }[];
  readonly discounts?: readonly { readonly amount?: number; readonly kind?: "UNCONDITIONAL" | "CONDITIONAL" }[];
  readonly freight?: number;
  readonly insurance?: number;
  readonly otherCharges?: number;
  readonly importation?: Record<string, unknown>;
}
