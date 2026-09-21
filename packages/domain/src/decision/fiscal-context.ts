/**
 * FiscalContext — entrada normalizada e imutável de uma decisão fiscal.
 * É o alvo de avaliação de todas as specifications (payload-spec §3–§5).
 */
export type Uf = "AC" | "AL" | "AM" | "AP" | "BA" | "CE" | "DF" | "ES" | "GO" | "MA" | "MG" | "MS" | "MT" | "PA" | "PB" | "PE" | "PI" | "PR" | "RJ" | "RN" | "RO" | "RR" | "RS" | "SC" | "SE" | "SP" | "TO";

export type RecipientRole = "CONTRIBUTOR" | "NON_CONTRIBUTOR" | "FINAL_CONSUMER";

export type OperationKind =
  | "SALE_GOODS"
  | "SERVICE_PROVISION"
  | "TRANSFER"
  | "REMITTANCE"
  | "RENTAL"
  | "IMPORT"
  | "EXPORT"
  | "CONSUMPTION_ASSET";

export type OperationPurpose = "SAMPLE" | "GIFT" | "REPAIR" | "TOLL_MANUFACTURING" | "OTHER";

export type FiscalDocumentType = "NFE" | "NFCE" | "NFSE" | "NONE";

export type TaxRegime = "NORMAL" | "SIMPLES_NACIONAL" | "MEI" | "LUCRO_PRESUMIDO" | "LUCRO_REAL";

export type MerchandiseOrigin = "DOMESTIC" | "IMPORTED" | "FOREIGN_SIMILAR";

export interface FiscalContextItem {
  readonly id: string;
  readonly description: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
  readonly ncm?: string;
  readonly cest?: string;
  readonly serviceCode?: string;
  readonly origin?: MerchandiseOrigin;
  readonly discountCents?: number;
  /** Dedução legal da BASE do ISS (materiais fornecidos pelo prestador, LC 116/03) — centavos. */
  readonly issDeductionCents?: number;
  /** Despesas acessórias por item (integram a base do ICMS/ST, LC 87/96 art. 13 §1º I). */
  readonly freightCents?: number;
  readonly insuranceCents?: number;
  readonly otherChargesCents?: number;
}

export interface FiscalContext {
  readonly asOfDate: Date;
  readonly issuerState: Uf;
  readonly recipientState: Uf;
  readonly recipientRole: RecipientRole;
  readonly operationKind: OperationKind;
  readonly purpose?: OperationPurpose;
  readonly fiscalDocumentType: FiscalDocumentType;
  readonly regime: TaxRegime;
  readonly items: readonly FiscalContextItem[];
  /** Município do estabelecimento prestador (IBGE 7 dígitos) — determina o ISS (LC 116/03 art. 3º). */
  readonly issuerMunicipality?: string;
  /** CFOP informado pelo emissor (4 dígitos) — respeitado como trava; ausente, o motor infere. */
  readonly cfop?: string;
  /** Receita bruta acumulada em 12 meses (centavos) — determina a faixa do DAS. */
  readonly rbt12Cents?: number;
}

export function isInterstate(ctx: FiscalContext): boolean {
  return ctx.issuerState !== ctx.recipientState;
}

export function totalGoodsCents(ctx: FiscalContext): number {
  return ctx.items.reduce((acc, i) => acc + i.quantity * i.unitPriceCents - (i.discountCents ?? 0), 0);
}
