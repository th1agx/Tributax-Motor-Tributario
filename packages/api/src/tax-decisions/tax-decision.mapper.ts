import type {
  FiscalContext, FiscalContextItem, FiscalDocumentType, MerchandiseOrigin,
  OperationKind, OperationPurpose, RecipientRole, TaxRegime, Uf,
} from "@tributax/domain";
import type { TaxCalculationRequest } from "./tax-decision.request.js";

/**
 * Mapper do contrato público (payload-spec) para o FiscalContext do domínio.
 * Responsabilidades: validação de coerência (matriz §8), resolução de AUTO
 * (com registro de inferências) e derivação do tier (§9).
 */

export interface Inference {
  readonly field: string;
  readonly value: string;
  readonly evidence: string;
}

export interface MappedContext {
  readonly ctx: FiscalContext;
  readonly derivedTier: "MINIMAL" | "INTERMEDIATE" | "ADVANCED" | "COMPLETE";
  readonly inferences: readonly Inference[];
}

const UFS = new Set(["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"]);

export class PayloadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayloadValidationError";
  }
}

function uf(value: string | undefined, label: string): Uf {
  if (!value || !UFS.has(value)) {
    throw new PayloadValidationError(`${label} deve ser uma UF válida (recebido: ${value ?? "ausente"})`);
  }
  return value as Uf;
}

export function mapRequest(req: TaxCalculationRequest, issuerDefaults: { state: Uf; regime: TaxRegime }): MappedContext {
  const inferences: Inference[] = [];
  const recipient = req.context?.recipient;

  // --- recipient.role: AUTO → resolve por identificação (simplificação v1) ---
  let role: RecipientRole;
  const requestedRole = recipient?.role ?? "AUTO";
  if (requestedRole === "AUTO") {
    role = recipient?.partyRef ? "CONTRIBUTOR" : "FINAL_CONSUMER";
    inferences.push({
      field: "context.recipient.role",
      value: role,
      evidence: recipient?.partyRef
        ? "destinatário identificado por partyRef → presumido contribuinte (v1: consulta cadastral futura)"
        : "destinatário sem identificação → consumidor final",
    });
  } else {
    role = requestedRole;
  }

  // --- operation.kind / fiscalDocumentType: AUTO (matriz §4) ---
  const requestedKind = req.operation?.kind ?? "AUTO";
  let kind: OperationKind;
  if (requestedKind === "AUTO") {
    if (req.items.some((i) => i.classification?.serviceCode)) {
      kind = "SERVICE_PROVISION";
      inferences.push({ field: "operation.kind", value: kind, evidence: "item com serviceCode (LC 116/03)" });
    } else {
      kind = "SALE_GOODS";
      inferences.push({ field: "operation.kind", value: kind, evidence: "itens sem serviceCode → venda de mercadorias" });
    }
  } else {
    kind = requestedKind;
  }
  const requestedDoc = req.operation?.fiscalDocumentType ?? "AUTO";
  let docType: FiscalDocumentType;
  if (requestedDoc === "AUTO") {
    docType = kind === "SERVICE_PROVISION" ? "NFSE"
      : role === "FINAL_CONSUMER" ? "NFCE" : "NFE";
    inferences.push({ field: "operation.fiscalDocumentType", value: docType, evidence: `kind=${kind}, role=${role}` });
  } else {
    docType = requestedDoc;
  }

  // --- coerência matriz §8: NFC-e nunca para contribuinte; NFS-e rejeita NCM ---
  if (docType === "NFCE" && role === "CONTRIBUTOR") {
    throw new PayloadValidationError("NFC-e não admite destinatário contribuinte (matriz documento × campos)");
  }
  if (docType === "NFSE" && req.items.some((i) => i.classification?.ncm)) {
    throw new PayloadValidationError("NFS-e não admite NCM (matriz documento × campos)");
  }
  if (docType !== "NFSE" && kind === "SERVICE_PROVISION" && docType !== "NONE") {
    throw new PayloadValidationError("SERVICE_PROVISION exige NFSE ou NONE (matriz documento × campos)");
  }

  const items: FiscalContextItem[] = req.items.map((i, idx) => {
    const c = i.classification;
    const discounts = i.discounts?.reduce((acc, d) => acc + (d.amount ?? 0), 0);
    const issDeductions = i.deductions?.reduce((acc, d) => acc + (d.amount ?? 0), 0);
    return {
      id: String(i.id ?? idx + 1),
      description: i.description ?? "",
      quantity: i.quantity ?? 1,
      unitPriceCents: i.unitPrice?.amount ?? 0,
      ...(c?.ncm !== undefined ? { ncm: c.ncm } : {}),
      ...(c?.cest !== undefined ? { cest: c.cest } : {}),
      ...(c?.serviceCode !== undefined ? { serviceCode: c.serviceCode } : {}),
      ...(c?.origin !== undefined && c.origin !== "AUTO" ? { origin: c.origin } : {}),
      ...(discounts !== undefined && discounts > 0 ? { discountCents: discounts } : {}),
      ...(issDeductions !== undefined && issDeductions > 0 ? { issDeductionCents: issDeductions } : {}),
      // despesas acessórias por item (base de ICMS/ST, LC 87/96 art. 13 §1º I)
      ...(i.freight !== undefined && i.freight > 0 ? { freightCents: i.freight } : {}),
      ...(i.insurance !== undefined && i.insurance > 0 ? { insuranceCents: i.insurance } : {}),
      ...(i.otherCharges !== undefined && i.otherCharges > 0 ? { otherChargesCents: i.otherCharges } : {}),
    };
  });

  if (items.length === 0) {
    throw new PayloadValidationError("ao menos 1 item é obrigatório");
  }

  const municipality = req.context?.issuer?.address?.cityIbgeCode;
  const ctx: FiscalContext = {
    asOfDate: req.asOfDate ? new Date(req.asOfDate) : new Date(),
    issuerState: issuerDefaults.state,
    recipientState: recipient?.address?.state ? uf(recipient.address.state, "context.recipient.address.state") : issuerDefaults.state,
    ...(municipality !== undefined ? { issuerMunicipality: municipality } : {}),
    ...(req.operation?.cfop !== undefined
      ? (() => {
          if (!/^\d{4}$/.test(req.operation!.cfop!)) {
            throw new PayloadValidationError("operation.cfop deve ter 4 dígitos");
          }
          return { cfop: req.operation!.cfop };
        })()
      : {}),
    ...(req.context?.issuer?.rbt12Cents !== undefined ? { rbt12Cents: req.context.issuer.rbt12Cents } : {}),
    recipientRole: role,
    operationKind: kind,
    ...(req.operation?.purpose ? { purpose: req.operation.purpose as OperationPurpose } : {}),
    fiscalDocumentType: docType,
    regime: issuerDefaults.regime,
    items,
  };

  return { ctx, derivedTier: deriveTier(req), inferences };
}

function deriveTier(req: TaxCalculationRequest): MappedContext["derivedTier"] {
  if (req.overrides || req.items.some((i) => i.importation)) return "COMPLETE";
  const explicitKind = (req.operation?.kind ?? "AUTO") !== "AUTO";
  const hasClassification = req.items.some((i) => i.classification?.ncm || i.classification?.serviceCode || i.classification?.origin);
  const explicitRole = (req.context?.recipient?.role ?? "AUTO") !== "AUTO";
  if (explicitKind || hasClassification) return "ADVANCED";
  if (explicitRole || req.context?.recipient?.address) return "INTERMEDIATE";
  return "MINIMAL";
}
