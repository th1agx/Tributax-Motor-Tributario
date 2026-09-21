import { calculateIcmsWith, calculatePisCofinsWith, calculateIssRetentionsWith, calculateIpiWith, calculateIbsCbsWith, calculateIssWith, calculateIcmsStWith, calculateSimplesDasWith, icmsRuleCatalog, pisCofinsRuleCatalog, issRetentionRuleCatalog, ipiRuleCatalog, ibsCbsRuleCatalog, issRuleCatalog } from "@tributax/domain";
import type { IcmsDecision, PisCofinsDecision, IssRetentionDecision, IpiDecision, IbsCbsDecision, IssDecision, IcmsStDecision, SimplesDasDecision } from "@tributax/domain";
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
  return [...icmsRuleCatalog(), ...pisCofinsRuleCatalog(), ...issRetentionRuleCatalog(), ...ipiRuleCatalog(), ...ibsCbsRuleCatalog(), ...issRuleCatalog()];
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

export async function resolveIssRetentions(
  ctx: FiscalContext,
  source: RuleSource,
): Promise<IssRetentionDecision> {
  const rules = await source.loadRules(ctx);
  return calculateIssRetentionsWith(ctx, rules);
}

export async function resolveIpi(
  ctx: FiscalContext,
  source: RuleSource,
): Promise<IpiDecision> {
  const rules = await source.loadRules(ctx);
  return calculateIpiWith(ctx, rules);
}

export async function resolveIbsCbs(
  ctx: FiscalContext,
  source: RuleSource,
): Promise<IbsCbsDecision> {
  const rules = await source.loadRules(ctx);
  return calculateIbsCbsWith(ctx, rules);
}

export async function resolveIcmsSt(
  ctx: Parameters<typeof calculateIcmsStWith>[0],
  source: RuleSource,
): Promise<IcmsStDecision> {
  const rules = await source.loadRules(ctx);
  return calculateIcmsStWith(ctx, rules);
}

export async function resolveSimplesDas(
  ctx: Parameters<typeof calculateSimplesDasWith>[0],
  source: RuleSource,
): Promise<SimplesDasDecision> {
  const rules = await source.loadRules(ctx);
  return calculateSimplesDasWith(ctx, rules);
}

export async function resolveIss(
  ctx: FiscalContext,
  source: RuleSource,
): Promise<IssDecision> {
  const rules = await source.loadRules(ctx);
  return calculateIssWith(ctx, rules);
}

/** Decisões de TODOS os tributos para UM item (contexto de item único). */
export interface ItemTaxes {
  readonly icms: IcmsDecision;
  readonly federal: PisCofinsDecision;
  readonly retentions: IssRetentionDecision;
  readonly st: IcmsStDecision;
  readonly ipi: IpiDecision;
  readonly reform: IbsCbsDecision;
  readonly das: SimplesDasDecision;
  readonly iss: IssDecision;
}

/**
 * Resolução POR ITEM (auditoria 2.6): carrega as regras UMA vez (data da
 * operação) e decide cada item isoladamente — base e predicados de item
 * referem-se àquele item. Uma regra por NCM (ex.: IPI medicamento zero)
 * afeta só o item daquele NCM, não a nota inteira.
 */
export async function resolveItemTaxes(
  itemCtx: FiscalContext,
  source: RuleSource,
): Promise<ItemTaxes> {
  const rules = await source.loadRules(itemCtx);
  return {
    icms: calculateIcmsWith(itemCtx, rules),
    federal: calculatePisCofinsWith(itemCtx, rules),
    retentions: calculateIssRetentionsWith(itemCtx, rules),
    st: calculateIcmsStWith(itemCtx, rules),
    ipi: calculateIpiWith(itemCtx, rules),
    reform: calculateIbsCbsWith(itemCtx, rules),
    das: calculateSimplesDasWith(itemCtx, rules),
    iss: calculateIssWith(itemCtx, rules),
  };
}
