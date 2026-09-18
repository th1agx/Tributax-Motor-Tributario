import type { Uf } from "../decision/fiscal-context.js";
import { calculate, type TaxDecision } from "../decision/pipeline.js";
import type { SpecJson } from "../specification/spec.js";
import type { TaxRule } from "../decision/tax-rule.js";
import { DateRange } from "../shared/date-range.js";
import { REGION_OF } from "./regions.js";

/**
 * Módulo ICMS (Fase 1) — capability que gera as TaxRules a partir dos
 * DADOS de alíquotas e delega a decisão ao pipeline genérico.
 * Comportamento é código; alíquota é dado (ADR-004, item 15 do briefing).
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

function internalRateRules(): TaxRule[] {
  return Object.entries(INTERNAL_RATES).map(([uf, rateBp]) => {
    const rule: TaxRule = {
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
    };
    return rule;
  });
}

/**
 * Interestadual (Resolução SF 22/89): 12% geral; 7% nas operações
 * destinadas a Sul/Sudeste (exceto ES) originadas de N/NE/CO/ES.
 * Origem também 7% para qualquer destino a partir de... — ver reviewReason.
 */
function interstateRules(): TaxRule[] {
  const favouredOrigins: Uf[] = [
    "AC", "AP", "AM", "PA", "RO", "RR", "TO",
    "AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE",
    "DF", "GO", "MT", "MS", "ES",
  ];
  const favouredDestinations: Uf[] = ["SP", "RJ", "MG", "PR", "SC", "RS"];

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
      orOf(...favouredOrigins.map((uf) => pred("issuerStateIs", { uf }))),
      orOf(...favouredDestinations.map((uf) => pred("recipientStateIs", { uf }))),
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
 * DIFAL (LC 87/96 art. 99, incluído pela LC 190/22): aplica-se a operação
 * interestadual destinada a consumidor final NÃO contribuinte, por emitente
 * do regime normal. Simples Nacional não pratica DIFAL (LC 123/11,
 * art. 13, §1º, XIII). Split 2026: 20% origem / 80% destino.
 */
function difalRuleFor(ctx: Parameters<typeof calculate>[0]["ctx"]): TaxRule | undefined {
  const destUf = ctx.recipientState;
  const internalRateBp = INTERNAL_RATES[destUf];
  if (internalRateBp === undefined) return undefined; // catálogo sem alíquota interna do destino → NO_RULE_FOUND honesto

  const interstateBp = interstateRateForOperation(ctx.issuerState, destUf);
  const condition: SpecJson = andOf(
    pred("isInterstate"),
    pred("isFinalConsumer"),
    pred("regimeIs", { regime: "NORMAL" }),
    pred("recipientStateIs", { uf: destUf }),
  );

  return {
    id: `DIFAL-${destUf}`,
    version: 1,
    tribute: "DIFAL",
    name: `DIFAL destino ${destUf}`,
    jurisdiction: { scope: "STATE", code: destUf },
    condition,
    effects: [{ type: "applyRate", rateBp: internalRateBp - interstateBp }],
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
    reviewReason: `split 20/80 de ${destUf} a confirmar (LC 190/22 e Conv. ICMS correspondente) (NEEDS_REVIEW)`,
  };
}

/** Resolução SF 22/89: 7% se origem N/NE/CO/ES → destino S/SE (exceto ES); senão 12%. */
function interstateRateForOperation(origin: Uf, dest: Uf): number {
  const favouredOrigins: Uf[] = [
    "AC", "AP", "AM", "PA", "RO", "RR", "TO",
    "AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE",
    "DF", "GO", "MT", "MS", "ES",
  ];
  const favouredDestinations: Uf[] = ["SP", "RJ", "MG", "PR", "SC", "RS"];
  return favouredOrigins.includes(origin) && favouredDestinations.includes(dest) ? 700 : 1200;
}

/** FCP no DIFAL: interestadual a consumidor final não contribuinte, 100% ao destino. */
function fcpRuleFor(destUf: Uf): TaxRule | undefined {
  const fcpBp = FCP_RATES[destUf];
  if (fcpBp === undefined) return undefined;

  return {
    id: `FCP-DIFAL-${destUf}`,
    version: 1,
    tribute: "FCP",
    name: `FCP ${destUf} (operacional DIFAL)`,
    jurisdiction: { scope: "STATE", code: destUf },
    condition: andOf(
      pred("isInterstate"),
      pred("isFinalConsumer"),
      pred("regimeIs", { regime: "NORMAL" }),
      pred("recipientStateIs", { uf: destUf }),
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
    reviewReason: `alíquota FCP de ${destUf} confirmada em fonte secundária — conferir legislação estadual vigente (NEEDS_REVIEW)`,
  };
}

export interface IcmsDecision {
  readonly icms: TaxDecision;
  readonly difal?: TaxDecision & { readonly split: { readonly originCents: number; readonly destinationCents: number } };
  /** FCP do DIFAL — 100% ao destino (vFCPDif). */
  readonly fcp?: TaxDecision;
}

export function calculateIcms(ctx: Parameters<typeof calculate>[0]["ctx"]): IcmsDecision {
  const rules = [...internalRateRules(), ...interstateRules()];
  const icms = calculate({ ctx, rules, tribute: "ICMS" });

  const difalRule = difalRuleFor(ctx);
  const difalDecision = calculate({
    ctx,
    rules: difalRule ? [...rules, difalRule] : rules,
    tribute: "DIFAL",
  });

  const fcpRule = fcpRuleFor(ctx.recipientState);
  const fcpDecision = calculate({
    ctx,
    rules: fcpRule ? [...rules, fcpRule] : rules,
    tribute: "FCP",
  });

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

export { REGION_OF };
