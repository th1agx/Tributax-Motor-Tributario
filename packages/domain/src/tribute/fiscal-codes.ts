import type { FiscalContext, TaxRegime } from "../decision/fiscal-context.js";
import { isInterstate } from "../decision/fiscal-context.js";
import type { TaxOutcome, TributeId } from "../decision/tax-outcome.js";

/**
 * Códigos fiscais do documento (fase "emissão-grade"):
 *
 * 1. CFOP — Código Fiscal da Operação e Prestação. Se o emissor já sabe o
 *    CFOP, ele entra no payload e é respeitado (trava validada, payload-spec
 *    §overrides). Se não sabe, o motor INFERE do contexto — a inferência é
 *    sinalizada em `basis` (e ambiguidades como produzir×revender ficam em
 *    `review`, nunca silenciosas).
 *
 * 2. CST/CSOSN — Código de Situação Tributária, exigido por imposto no
 *    documento fiscal. Deriva do OUTCOME da decisão (mesma fonte da verdade):
 *    regime normal → CST; Simples/MEI → CSOSN. NO_RULE_FOUND não gera código
 *    (honestidade: sem regra não há situação tributária declarável).
 */

export interface CfopResult {
  readonly code: string; // 4 dígitos
  readonly basis: string; // por que este CFOP
  readonly review?: string; // ambiguidade conhecida (NEEDS_REVIEW)
}

/** Inferência de CFOP a partir do contexto normalizado. */
export function inferCfop(ctx: FiscalContext): CfopResult | undefined {
  if (ctx.fiscalDocumentType === "NFSE" || ctx.operationKind === "SERVICE_PROVISION") {
    return undefined; // NFS-e não usa CFOP
  }

  // primeiro dígito: 5 interna, 6 interestadual, 7 exportação (saídas)
  const inter = isInterstate(ctx);

  if (ctx.operationKind === "EXPORT") {
    return { code: "7101", basis: "exportação de mercadoria nacional", review: "confirmar se produção própria (7101) ou revenda (7102) (NEEDS_REVIEW)" };
  }
  if (ctx.operationKind === "IMPORT") {
    return { code: inter ? "2101" : "1101", basis: "entrada por compra (importação)", review: "CFOP de entrada depende do remetente estrangeiro — validar com o documento de importação (NEEDS_REVIEW)" };
  }
  if (ctx.operationKind !== "SALE_GOODS") {
    return undefined; // transferência/remessa/locação: mapeamento dedicado é fase futura
  }

  const prefix = inter ? "6" : "5";
  if (ctx.recipientRole === "FINAL_CONSUMER") {
    return {
      code: `${prefix}102`,
      basis: `venda a consumidor final, operação ${inter ? "interestadual" : "interna"}`,
      review: "5.102/6.102 presume revenda; produção própria seria 5.101/6.101 (NEEDS_REVIEW)",
    };
  }
  return {
    code: `${prefix}101`,
    basis: `venda de mercadoria, operação ${inter ? "interestadual" : "interna"}, destinatário contribuinte`,
    review: "5.101/6.101 presume produção própria; revenda seria 5.102/6.102 (NEEDS_REVIEW)",
  };
}

export interface FiscalCodeResult {
  readonly kind: "CST" | "CSOSN";
  readonly code: string;
}

const SIMPLES: readonly TaxRegime[] = ["SIMPLES_NACIONAL", "MEI"];

/**
 * CST/CSOSN por tributo a partir do outcome. Regra geral:
 * - Simples/MEI → CSOSN (ICMS); demais tributos do Simples não têm CST próprio no documento (exceto IPI).
 * - NORMAL/LUCRO_* → CST.
 * - Mapeamentos ambíguos ou excepcionais carregam o valor padrão da prática
 *   documental; refinar para os códigos especiais (10/60/70, 900) é a fase
 *   seguinte com ICMS-ST e reduções.
 */
export function fiscalCodeFor(
  tribute: TributeId,
  outcome: TaxOutcome,
  regime: TaxRegime,
): FiscalCodeResult | undefined {
  if (outcome.kind === "NO_RULE_FOUND") return undefined;
  if (tribute === "ISS" || tribute === "DIFAL" || tribute === "FCP" || tribute === "CSRF" || tribute === "IRRF") {
    return undefined; // não têm CST próprio no documento (viajam no grupo do ICMS/retenções)
  }

  const isSimples = SIMPLES.includes(regime);

  if (tribute === "ICMS") {
    if (isSimples) {
      switch (outcome.kind) {
        case "TAXED": return { kind: "CSOSN", code: "102" };
        case "EXEMPT": return { kind: "CSOSN", code: "103" };
        case "IMMUNE": return { kind: "CSOSN", code: "400" };
        case "NON_TAXABLE": return { kind: "CSOSN", code: "103" };
        case "ZERO_RATED": return { kind: "CSOSN", code: "102" };
        default: return undefined;
      }
    }
    switch (outcome.kind) {
      case "TAXED": return { kind: "CST", code: "00" };
      case "EXEMPT": return { kind: "CST", code: "40" };
      case "IMMUNE": return { kind: "CST", code: "40" }; // imunidade declara-se em CST 40 com moto
      case "NON_TAXABLE": return { kind: "CST", code: "41" };
      case "ZERO_RATED": return { kind: "CST", code: "40" };
      case "SUSPENDED": return { kind: "CST", code: "50" };
      case "DEFERRED": return { kind: "CST", code: "51" };
      case "RETAINED": return { kind: "CST", code: "60" };
      default: return undefined;
    }
  }

  // IPI: Simples não gera CST de IPI (grupo não informado); normal segue CST
  if (tribute === "IPI" && isSimples) return undefined;
  if (tribute === "IPI") {
    switch (outcome.kind) {
      case "TAXED": return { kind: "CST", code: "99" }; // tributação normal c/ recolhimento (ou 50 se a prazo)
      case "EXEMPT": return { kind: "CST", code: "40" };
      case "IMMUNE": return { kind: "CST", code: "40" };
      case "NON_TAXABLE": return { kind: "CST", code: "41" };
      case "ZERO_RATED": return { kind: "CST", code: "00" };
      default: return undefined;
    }
  }

  // PIS/COFINS: 01 tributável alíquota básica (não cumulativo),
  // 03 alíquota diferenciada (cumulativo), 04/06/07 não tributável/zero/isenta
  if (tribute === "PIS" || tribute === "COFINS") {
    switch (outcome.kind) {
      case "TAXED": return { kind: "CST", code: "01" };
      case "EXEMPT": return { kind: "CST", code: "07" };
      case "IMMUNE": return { kind: "CST", code: "07" };
      case "NON_TAXABLE": return { kind: "CST", code: "04" };
      case "ZERO_RATED": return { kind: "CST", code: "06" };
      default: return undefined;
    }
  }

  // CBS/IBS: códigos próprios da LC 214 em regulamentação — sem CST ainda
  return undefined;
}
