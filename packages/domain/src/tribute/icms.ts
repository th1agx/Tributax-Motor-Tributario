import type { Uf } from "../decision/fiscal-context.js";
import { calculate, type TaxDecision } from "../decision/pipeline.js";
import type { SpecJson } from "../specification/spec.js";
import type { TaxRule } from "../decision/tax-rule.js";
import { DateRange } from "../shared/date-range.js";

/**
 * Módulo ICMS (Fase 1) — o catálogo é DADO (lista de TaxRules), consumido
 * pelo pipeline genérico. Comportamento é código; alíquota é dado (ADR-004).
 *
 * `icmsRuleCatalog()` gera o catálogo-padrão em código (usado como seed do
 * banco e como fallback quando não há RuleSource persistido); em produção
 * as regras vigem em tax_rules e chegam pelo port RuleSource.
 *
 * Regra 44: valores ainda não conferidos contra o regulamento estadual
 * vigente carregam reviewReason NEEDS_REVIEW — suposição nunca é silenciosa.
 */

const VALID_FROM_2026 = () => DateRange.from(new Date("2026-01-01T00:00:00Z"));

/**
 * Alíquotas internas por UF (base: RICMS de cada estado).
 * COBERTURA GRADUAL: entram apenas UFs com valor confirmado em fonte
 * pública (agregadores contábeis, 2026); lacunas produzem NO_RULE_FOUND
 * honesto — chute nunca. Toda entrada aguarda conferência no RICMS.
 */
const INTERNAL_RATES: Partial<Record<Uf, number>> = {
  // confirmadas em testes/fonte
  MG: 1800, SP: 1800, RJ: 2000, PA: 1700, BA: 1800,
  // fonte: agregadores contábeis (Cdm/Contabilizei, 2026) — NEEDS_REVIEW
  CE: 2000, DF: 2000, ES: 1700, GO: 1900, PR: 1800, RS: 1800, SC: 1700,
};

/**
 * FCP — parcela adicional do ICMS destinada ao Fundo de Combate à Pobreza
 * (LC 87/96 art. 82-A; EC 87/2019 para DIFAL). Mecânica de NF-e: FCP é
 * campo SEPARADO do DIFAL (vFCPDif ≠ vICMSDif), 100% ao estado destino.
 * Estados com 2% fixo conforme fontes públicas (Avalara, 2025);
 * AM (2%/1,5% por NCM), GO (até 2%) e RJ (até 4%) ficam fora até
 * modelagem por produto — NEEDS_REVIEW em toda a tabela.
 */
const FCP_RATES: Partial<Record<Uf, number>> = {
  AP: 200, BA: 200, CE: 200, DF: 200, ES: 200, MA: 200, PA: 200, PB: 200,
  PE: 200, PI: 200, RN: 200, RO: 200, RR: 200, SP: 200, TO: 200,
};

/** Res. SF 22/89 art. 2º: origens favorecidas (7% → S/SE exceto ES). */
const FAVOURED_ORIGINS: readonly Uf[] = [
  "AC", "AP", "AM", "PA", "RO", "RR", "TO",
  "AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE",
  "DF", "GO", "MT", "MS", "ES",
];
const FAVOURED_DESTINATIONS: readonly Uf[] = ["SP", "RJ", "MG", "PR", "SC", "RS"];

/** Catálogo-padrão completo (seed/fallback): ICMS, DIFAL e FCP. */
export function icmsRuleCatalog(): TaxRule[] {
  return [
    ...internalRateRules(),
    ...interstateRules(),
    ...difalRules(),
    ...fcpRules(),
  ];
}

function internalRateRules(): TaxRule[] {
  return Object.entries(INTERNAL_RATES).map(([uf, rateBp]): TaxRule => ({
    id: `ICMS-INT-${uf}`,
    version: 1,
    tribute: "ICMS",
    name: `ICMS interno ${uf}`,
    jurisdiction: { scope: "STATE", code: uf },
    condition: andOf(
      pred("isInternal"),
      pred("issuerStateIs", { uf }),
      pred("regimeIs", { regime: "NORMAL" }),
    ),
    effects: [{ type: "applyRate", rateBp }],
    priority: 0,
    validity: VALID_FROM_2026(),
    status: "ACTIVE",
    origin: "LEGISLATION",
    legalBasis: {
      documentType: "REGULAMENTO_ESTADUAL",
      number: "RICMS",
      year: uf,
      provision: "anexo de alíquotas",
    },
    reviewReason: `alíquota interna de ${uf} a conferir no RICMS vigente (NEEDS_REVIEW)`,
  }));
}

/**
 * Interestadual (Resolução SF 22/89): 12% geral (art. 1º); 7% nas
 * operações destinadas a Sul/Sudeste (exceto ES) originadas de N/NE/CO/ES
 * (art. 2º, I e II).
 */
function interstateRules(): TaxRule[] {
  const general: TaxRule = {
    id: "ICMS-INTER-GENERAL-12",
    version: 1,
    tribute: "ICMS",
    name: "ICMS interestadual 12%",
    jurisdiction: { scope: "FEDERAL" },
    condition: andOf(
      pred("isInterstate"),
      pred("regimeIs", { regime: "NORMAL" }),
    ),
    effects: [{ type: "applyRate", rateBp: 1200 }],
    priority: 0,
    validity: VALID_FROM_2026(),
    status: "ACTIVE",
    origin: "LEGISLATION",
    legalBasis: {
      documentType: "RESOLUCAO",
      number: "22",
      year: "1989",
      provision: "art. 1º",
    },
  };

  const favoured: TaxRule = {
    id: "ICMS-INTER-FAVOURED-07",
    version: 1,
    tribute: "ICMS",
    name: "ICMS interestadual 7% (origem N/NE/CO/ES → S/SE exceto ES)",
    jurisdiction: { scope: "FEDERAL" },
    condition: andOf(
      pred("isInterstate"),
      pred("regimeIs", { regime: "NORMAL" }),
      orOf(...FAVOURED_ORIGINS.map((uf) => pred("issuerStateIs", { uf }))),
      orOf(...FAVOURED_DESTINATIONS.map((uf) => pred("recipientStateIs", { uf }))),
    ),
    effects: [{ type: "applyRate", rateBp: 700 }],
    priority: 0,
    validity: VALID_FROM_2026(),
    status: "ACTIVE",
    origin: "LEGISLATION",
    legalBasis: {
      documentType: "RESOLUCAO",
      number: "22",
      year: "1989",
      provision: "art. 2º, I e II",
    },
    reviewReason: "enquadramento regional da Res. SF 22/89 a validar na íntegra (NEEDS_REVIEW)",
  };

  return [general, favoured];
}

/**
 * DIFAL (LC 87/96 art. 99, incluído pela LC 190/22): operação interestadual
 * a consumidor final não contribuinte, regime normal. Simples não pratica
 * DIFAL (LC 123/11 art. 13 §1º XIII). Duas regras por UF-destino: geral
 * (alíquota interna − 12%) e favorecida (interna − 7%) quando a origem é
 * N/NE/CO/ES — a resolução por especificidade (ADR-005) escolhe.
 */
function difalRules(): TaxRule[] {
  const rules: TaxRule[] = [];
  for (const [uf, internalBp] of Object.entries(INTERNAL_RATES)) {
    const common = [
      pred("isInterstate"),
      pred("isFinalConsumer"),
      pred("regimeIs", { regime: "NORMAL" }),
      pred("recipientStateIs", { uf }),
    ];
    rules.push({
      id: `DIFAL-${uf}-GENERAL`,
      version: 1,
      tribute: "DIFAL",
      name: `DIFAL destino ${uf} (alíquota geral)`,
      jurisdiction: { scope: "STATE", code: uf },
      condition: andOf(...common),
      effects: [{ type: "applyRate", rateBp: internalBp - 1200 }],
      priority: 0,
      validity: VALID_FROM_2026(),
      status: "ACTIVE",
      origin: "LEGISLATION",
      legalBasis: {
        documentType: "LEI_COMPLEMENTAR",
        number: "190",
        year: "2022",
        provision: "art. 3º (incluído na LC 87/96, art. 99, §2º)",
      },
      reviewReason: `split 20/80 de ${uf} a confirmar (LC 190/22 e Conv. ICMS correspondente) (NEEDS_REVIEW)`,
    });
    if (FAVOURED_DESTINATIONS.includes(uf as Uf)) {
      rules.push({
        id: `DIFAL-${uf}-FAVOURED`,
        version: 1,
        tribute: "DIFAL",
        name: `DIFAL destino ${uf} (origem favorecida 7%)`,
        jurisdiction: { scope: "STATE", code: uf },
        condition: andOf(
          ...common,
          orOf(...FAVOURED_ORIGINS.map((o) => pred("issuerStateIs", { uf: o }))),
        ),
        effects: [{ type: "applyRate", rateBp: internalBp - 700 }],
        priority: 0,
        validity: VALID_FROM_2026(),
        status: "ACTIVE",
        origin: "LEGISLATION",
        legalBasis: {
          documentType: "LEI_COMPLEMENTAR",
          number: "190",
          year: "2022",
          provision: "art. 3º c/c Res. SF 22/89, art. 2º",
        },
        reviewReason: `split 20/80 de ${uf} a confirmar (LC 190/22) (NEEDS_REVIEW)`,
      });
    }
  }
  return rules;
}

/** FCP do DIFAL: interestadual a consumidor final, 100% ao destino. */
function fcpRules(): TaxRule[] {
  return Object.entries(FCP_RATES).map(([uf, fcpBp]): TaxRule => ({
    id: `FCP-DIFAL-${uf}`,
    version: 1,
    tribute: "FCP",
    name: `FCP ${uf} (operacional DIFAL)`,
    jurisdiction: { scope: "STATE", code: uf },
    condition: andOf(
      pred("isInterstate"),
      pred("isFinalConsumer"),
      pred("regimeIs", { regime: "NORMAL" }),
      pred("recipientStateIs", { uf }),
    ),
    effects: [{ type: "applyRate", rateBp: fcpBp }],
    priority: 0,
    validity: VALID_FROM_2026(),
    status: "ACTIVE",
    origin: "IMPORTED",
    legalBasis: {
      documentType: "LEI_COMPLEMENTAR",
      number: "87",
      year: "1996",
      provision: "art. 82-A (incluído pela LC 163/04); EC 87/2019",
    },
    reviewReason: `alíquota FCP de ${uf} confirmada em fonte secundária — conferir legislação estadual vigente (NEEDS_REVIEW)`,
  }));
}

export interface IcmsDecision {
  readonly icms: TaxDecision;
  readonly difal?: TaxDecision & { readonly split: { readonly originCents: number; readonly destinationCents: number } };
  /** FCP do DIFAL — 100% ao destino (vFCPDif). */
  readonly fcp?: TaxDecision;
}

/**
 * Decisão ICMS sobre um conjunto de regras arbitrário — permite calcular
 * contra o catálogo persistido (RuleSource) sem gerar nada em código.
 */
export function calculateIcmsWith(
  ctx: Parameters<typeof calculate>[0]["ctx"],
  rules: readonly TaxRule[],
): IcmsDecision {
  const icms = calculate({ ctx, rules, tribute: "ICMS" });
  const difalDecision = calculate({ ctx, rules, tribute: "DIFAL" });
  const fcpDecision = calculate({ ctx, rules, tribute: "FCP" });

  if (difalDecision.outcome.kind === "TAXED") {
    const amount = difalDecision.outcome.amountCents;
    // Split 2026 (LC 190/22): 20% origem / 80% destino — fração 1/5.
    const originCents = Math.trunc(amount / 5);
    const result: IcmsDecision = {
      icms,
      difal: { ...difalDecision, split: { originCents, destinationCents: amount - originCents } },
    };
    if (fcpDecision.outcome.kind === "TAXED") {
      return { ...result, fcp: fcpDecision };
    }
    return result;
  }
  return { icms };
}

/** Atalho: decisão contra o catálogo-padrão gerado (seed/fallback). */
export function calculateIcms(ctx: Parameters<typeof calculate>[0]["ctx"]): IcmsDecision {
  return calculateIcmsWith(ctx, icmsRuleCatalog());
}

// helpers de construção de SpecJson
function pred(predicate: string, args?: Record<string, unknown>): SpecJson {
  return { kind: "predicate", predicate, ...(args ? { args } : {}) };
}
function andOf(...children: SpecJson[]): SpecJson {
  return { kind: "and", children };
}
function orOf(...children: SpecJson[]): SpecJson {
  return { kind: "or", children };
}
