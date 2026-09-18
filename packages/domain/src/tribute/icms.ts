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
 * Cobertura inicial: UFs usadas na Fiscal Test Suite; as demais entram
 * conforme conferência (NEEDS_REVIEW explicita o prazo de verdade).
 */
const INTERNAL_RATES: Partial<Record<Uf, number>> = {
  MG: 1800, SP: 1800, RJ: 2000, PA: 1700, BA: 1800, PR: 1800, RS: 1800, SC: 1700,
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

export interface IcmsDecision {
  readonly icms: TaxDecision;
  readonly difal?: TaxDecision & { readonly split: { readonly originCents: number; readonly destinationCents: number } };
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

  if (difalDecision.outcome.kind === "TAXED") {
    const amount = difalDecision.outcome.amountCents;
    // Split 2026 (LC 190/22): 20% origem / 80% destino — fração 1/5.
    const originCents = Math.trunc(amount / 5);
    return {
      icms,
      difal: { ...difalDecision, split: { originCents, destinationCents: amount - originCents } },
    };
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
