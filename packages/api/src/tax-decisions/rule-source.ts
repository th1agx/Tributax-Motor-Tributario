import { calculateIcmsWith, calculatePisCofinsWith, icmsRuleCatalog, pisCofinsRuleCatalog } from "@tributax/domain";
import type { IcmsDecision, PisCofinsDecision } from "@tributax/domain";
import type { FiscalContext, TaxRule } from "@tributax/domain";

/**
 * Port — fonte das regras aplicáveis a uma decisão (ADR-004: regras são
 * dado; o motor apenas interpreta). Adapters: GeneratedRuleSource (seed/
 * fallback, catálogo em código) e o Postgres do @tributax/infrastructure
 * (catálogo persistido em tax_rules, com workflow de aprovação).
 */
export interface RuleSource {
  /** Regras vigentes para o contexto (a implementação filtra por data). */
  loadRules(ctx: FiscalContext): Promise<readonly TaxRule[]>;
}

/** Catálogo completo gerado em código (fallback de desenvolvimento). */
export function generatedCatalog(): readonly TaxRule[] {
  return [...icmsRuleCatalog(), ...pisCofinsRuleCatalog()];
}

export class GeneratedRuleSource implements RuleSource {
  async loadRules(_ctx: FiscalContext): Promise<readonly TaxRule[]> {
    return generatedCatalog();
  }
}

/** Resolução das decisões de tributo contra a fonte de regras informada. */
export async function resolveIcms(
  ctx: FiscalContext,
  source: RuleSource,
): Promise<IcmsDecision> {
  const rules = await source.loadRules(ctx);
  return calculateIcmsWith(ctx, rules);
}

export async function resolvePisCofins(
  ctx: FiscalContext,
  source: RuleSource,
): Promise<PisCofinsDecision> {
  const rules = await source.loadRules(ctx);
  return calculatePisCofinsWith(ctx, rules);
}
