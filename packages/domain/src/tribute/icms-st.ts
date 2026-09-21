import { calculate, type TaxDecision } from "../decision/pipeline.js";
import type { SpecJson } from "../specification/spec.js";
import type { TaxRule } from "../decision/tax-rule.js";
import type { Uf } from "../decision/fiscal-context.js";
import { DateRange } from "../shared/date-range.js";
import { internalRateOf } from "./icms.js";

/**
 * Módulo ICMS-ST (fase "emissão-grade") — substituição tributária:
 * antecipação do ICMS das etapas futuras, retida pelo substituto.
 *
 * Fórmula (Conv. ICMS 92/15, art. 2º, IV — efeito applySt no pipeline):
 *   base ST = (valor da operação + acessórias) × (1 + MVA)
 *   ST bruto = base ST × alíquota interna do destino
 *   ST líquido (vICMSST do documento) = ST bruto − ICMS próprio
 *
 * Correções 2026-09 (auditoria 2.4):
 * - ST antecipa etapa SEGUINTE: exige destinatário CONTRIBUINTE — venda a
 *   consumidor final não retém ST (não há etapa a antecipar).
 * - MVA AJUSTADA na operação interestadual (Conv. 92/15, art. 2º, VIII):
 *   MVA_adj = [(1+MVA) × (1−alíq. interestadual)] / (1−alíq. interna) − 1.
 *   Variantes por alíquota interestadual (12% geral; 7% origem favorecida,
 *   Res. SF 22/89 art. 2º) — a resolução por especificidade escolhe.
 * - Base inclui despesas acessórias do item (frete/seguro/outras) no
 *   efeito applySt. IPI devido ainda não compõe (NEEDS_REVIEW).
 *
 * A incidência (quais NCM/CEST, com qual MVA, em qual UF) é DADO de
 * curadoria — o seed vem do importador st-import (CSV uf;ncm;mva); o
 * catálogo em código fica vazio por honestidade (nenhuma MVA é inventada).
 */

const FAVOURED_ORIGINS: readonly Uf[] = [
  "AC", "AP", "AM", "PA", "RO", "RR", "TO",
  "AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE",
  "DF", "GO", "MT", "MS", "ES",
];

/** Alíquota interestadual da operação (Res. SF 22/89 arts. 1º e 2º). */
export function interstateRateBpFor(origin: Uf, dest: Uf): 700 | 1200 {
  const favouredDestinations: readonly Uf[] = ["SP", "RJ", "MG", "PR", "SC", "RS"];
  return FAVOURED_ORIGINS.includes(origin) && favouredDestinations.includes(dest) ? 700 : 1200;
}

/** MVA ajustada para operação interestadual (Conv. 92/15, art. 2º, VIII), em bp. */
export function adjustedMvaBp(mvaBp: number, interstateRateBp: number, internalRateBp: number): number {
  return Math.round(((10000 + mvaBp) * (10000 - interstateRateBp)) / (10000 - internalRateBp)) - 10000;
}

/**
 * Constrói as regras ST de um NCM para um destino: interna (MVA original),
 * interestadual 12% e interestadual 7% (origem favorecida) com MVA ajustada.
 */
export function icmsStRules(uf: Uf, ncm: string, mvaBp: number, validFrom = "2026-01-01"): TaxRule[] {
  const internalBp = internalRateOf(uf);
  if (internalBp === undefined) throw new Error(`UF sem alíquota interna catalogada: ${uf}`);

  const common: SpecJson[] = [
    { kind: "predicate", predicate: "recipientStateIs", args: { uf } },
    { kind: "predicate", predicate: "ncmIn", args: { list: [ncm] } },
    { kind: "predicate", predicate: "regimeIs", args: { regime: "NORMAL" } },
    // ST antecipa a etapa seguinte: exige contribuinte (auditoria 2.4)
    { kind: "predicate", predicate: "recipientRoleIs", args: { role: "CONTRIBUTOR" } },
  ];

  const rule = (id: string, name: string, mva: number, extra: SpecJson[]): TaxRule => ({
    id,
    version: 1,
    tribute: "ICMS_ST",
    name,
    jurisdiction: { scope: "STATE", code: uf },
    condition: { kind: "and", children: [...common, ...extra] },
    effects: [{ type: "applySt", mvaBp: mva, rateBp: internalBp }],
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
    reviewReason: `MVA de ${uf} para o NCM ${ncm} importada de tabela curada — conferir protocolo vigente (NEEDS_REVIEW)`,
  });

  return [
    rule(
      `ICMS-ST-${uf}-${ncm}-${mvaBp}-INT`,
      `ICMS-ST ${uf} NCM ${ncm} interno (MVA ${mvaBp / 100}%)`,
      mvaBp,
      [{ kind: "predicate", predicate: "isInternal" }],
    ),
    rule(
      `ICMS-ST-${uf}-${ncm}-${mvaBp}-INTER12`,
      `ICMS-ST ${uf} NCM ${ncm} interestadual 12% (MVA ajustada)`,
      adjustedMvaBp(mvaBp, 1200, internalBp),
      [{ kind: "predicate", predicate: "isInterstate" }],
    ),
    rule(
      `ICMS-ST-${uf}-${ncm}-${mvaBp}-INTER7`,
      `ICMS-ST ${uf} NCM ${ncm} interestadual 7% origem favorecida (MVA ajustada)`,
      adjustedMvaBp(mvaBp, 700, internalBp),
      [
        { kind: "predicate", predicate: "isInterstate" },
        {
          kind: "or",
          children: FAVOURED_ORIGINS.map((o): SpecJson => ({
            kind: "predicate", predicate: "issuerStateIs", args: { uf: o },
          })),
        },
      ],
    ),
  ];
}

/** Compat: regra ST única (interna) — prefira icmsStRules. */
export function icmsStRule(uf: Uf, ncm: string, mvaBp: number, validFrom = "2026-01-01"): TaxRule {
  return icmsStRules(uf, ncm, mvaBp, validFrom)[0]!;
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
