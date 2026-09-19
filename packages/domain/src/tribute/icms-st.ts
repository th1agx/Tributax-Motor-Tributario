import { calculate, type TaxDecision } from "../decision/pipeline.js";
import type { TaxRule } from "../decision/tax-rule.js";
import type { Uf } from "../decision/fiscal-context.js";
import { DateRange } from "../shared/date-range.js";
import { internalRateOf } from "./icms.js";

/**
 * Módulo ICMS-ST (fase "emissão-grade") — substituição tributária:
 * antecipação do ICMS das etapas futuras, retida pelo substituto.
 *
 * Fórmula (Conv. ICMS 92/15, art. 2º, IV — efeito applySt no pipeline):
 *   base ST = valor da operação × (1 + MVA)
 *   ST bruto = base ST × alíquota interna do destino
 *   ST líquido (vICMSST do documento) = ST bruto − ICMS próprio
 *
 * A incidência (quais NCM/CEST, com qual MVA, em qual UF) é DADO de
 * curadoria — milhares de linhas de protocolos/convênios. O seed vem do
 * importador st-import (CSV uf;ncm;mva); o catálogo em código fica vazio
 * por honestidade (nenhuma MVA é inventada).
 */

/** Constrói a regra ST de um NCM para um destino (usado pelo importador). */
export function icmsStRule(uf: Uf, ncm: string, mvaBp: number, validFrom = "2026-01-01"): TaxRule {
  const rateBp = internalRateOf(uf);
  if (rateBp === undefined) throw new Error(`UF sem alíquota interna catalogada: ${uf}`);
  return {
    id: `ICMS-ST-${uf}-${ncm}-${mvaBp}`,
    version: 1,
    tribute: "ICMS_ST",
    name: `ICMS-ST ${uf} NCM ${ncm} (MVA ${mvaBp / 100}%)`,
    jurisdiction: { scope: "STATE", code: uf },
    condition: {
      kind: "and",
      children: [
        { kind: "predicate", predicate: "recipientStateIs", args: { uf } },
        { kind: "predicate", predicate: "ncmIn", args: { list: [ncm] } },
        { kind: "predicate", predicate: "regimeIs", args: { regime: "NORMAL" } },
      ],
    },
    effects: [{ type: "applySt", mvaBp, rateBp }],
    priority: 0,
    validity: DateRange.from(new Date(`${validFrom}T00:00:00Z`)),
    status: "ACTIVE",
    origin: "LEGISLATION",
    legalBasis: {
      documentType: "CONVENIO",
      number: "92",
      year: "2015",
      provision: "art. 2º, IV (protocolos/convênios por UF — ver importação)",
    },
    reviewReason: `MVA de ${uf} para o NCM ${ncm} importada de tabela curada — conferir protocolo vigente`,
  };
}

export interface IcmsStDecision {
  readonly icmsSt: TaxDecision; // amountCents = ST BRUTO
}

export function calculateIcmsStWith(
  ctx: Parameters<typeof calculate>[0]["ctx"],
  rules: readonly TaxRule[],
): IcmsStDecision {
  return { icmsSt: calculate({ ctx, rules, tribute: "ICMS_ST" }) };
}

/**
 * ST líquido (o que vai no documento como vICMSST): ST bruto − ICMS próprio
 * já destacado na mesma operação. Se o ICMS próprio não é TAXED, nada a
 * deduzir (operações isentas/sem regra retêm o bruto).
 */
export function netStCents(st: TaxDecision, icmsProprio: TaxDecision): number | undefined {
  if (st.outcome.kind !== "TAXED") return undefined;
  const gross = st.outcome.amountCents;
  if (icmsProprio.outcome.kind !== "TAXED") return gross;
  return Math.max(0, gross - icmsProprio.outcome.amountCents);
}
