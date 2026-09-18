import { calculateIcmsWith, icmsRuleCatalog } from "@tributax/domain";
import type { IcmsDecision } from "@tributax/domain";
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

export class GeneratedRuleSource implements RuleSource {
  async loadRules(_ctx: FiscalContext): Promise<readonly TaxRule[]> {
    return icmsRuleCatalog();
  }
}

/** Resolução da decisão contra a fonte de regras informada. */
export async function resolveIcms(
  ctx: FiscalContext,
  source: RuleSource,
): Promise<IcmsDecision> {
  const rules = await source.loadRules(ctx);
  return calculateIcmsWith(ctx, rules);
}
