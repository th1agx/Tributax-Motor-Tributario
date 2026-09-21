import { Money, type RoundingPolicy } from "../shared/money.js";
import { TaxRate } from "../shared/tax-rate.js";
import { compile } from "../specification/compiler.js";
import type { Spec } from "../specification/spec.js";
import type { FiscalContext } from "./fiscal-context.js";
import { totalGoodsCents } from "./fiscal-context.js";
import { ENGINE_VERSION, type TaxRule } from "./tax-rule.js";
import type { EvaluatedRule, TaxOutcome, TributeId } from "./tax-outcome.js";

/**
 * TaxCalculationPipeline (Fase 0 — tributo genérico/stub):
 * Discovery → Filtering (temporal/status) → Matching → Resolution →
 * Computation → Result com trace.
 * A resolução segue ADR-005; o trace é append-only (ADR-007).
 */
export type DecisionPhase =
  | "DISCOVERY" | "FILTERING" | "MATCHING" | "RESOLUTION" | "COMPUTATION" | "RESULT";

export interface DecisionStep {
  readonly phase: DecisionPhase;
  readonly summary: string;
  readonly evaluatedRules?: readonly EvaluatedRule[];
}

export interface TaxDecision {
  readonly engineVersion: string;
  readonly rulesetHash: string;
  readonly asOfDate: Date;
  readonly tribute: TributeId;
  readonly outcome: TaxOutcome;
  readonly appliedRule?: { readonly id: string; readonly version: number; readonly reviewReason?: string };
  readonly trace: readonly DecisionStep[];
  readonly warnings: readonly string[];
}

export interface PipelineInput {
  readonly ctx: FiscalContext;
  readonly rules: readonly TaxRule[];
  readonly tribute: TributeId;
  readonly rounding?: RoundingPolicy;
}

interface CompiledRule {
  readonly rule: TaxRule;
  readonly spec: Spec;
}

export function calculate(input: PipelineInput): TaxDecision {
  const trace: DecisionStep[] = [];
  const warnings: string[] = [];
  const { ctx, rules, tribute, rounding = "HALF_UP" } = input;
  const compiled = new Map<string, CompiledRule>();

  // DISCOVERY + FILTERING: vigência (asOfDate), status e tributo.
  const candidates: TaxRule[] = [];
  for (const rule of rules) {
    if (rule.tribute !== tribute) continue;
    if (!rule.validity.contains(ctx.asOfDate)) continue;
    if (rule.status !== "ACTIVE") continue;
    try {
      compiled.set(rule.id, { rule, spec: compile(rule.condition) });
      candidates.push(rule);
    } catch (e) {
      warnings.push(`regra ${rule.id} v${rule.version} não carregou: ${(e as Error).message}`);
    }
  }
  trace.push({
    phase: "DISCOVERY",
    summary: `${candidates.length} regra(s) candidata(s) p/ ${tribute} vigente(s) em ${ctx.asOfDate.toISOString().slice(0, 10)}`,
  });

  // MATCHING: avaliação das condições com motivo registrado.
  const evaluated: EvaluatedRule[] = [];
  const matched: CompiledRule[] = [];
  for (const rule of candidates) {
    const spec = compiled.get(rule.id)!.spec;
    const isMatch = spec.evaluate(ctx);
    evaluated.push({
      ruleId: rule.id,
      ruleVersion: rule.version,
      matched: isMatch,
      reason: isMatch ? "condição satisfeita" : "condição não satisfeita",
    });
    if (isMatch) matched.push(compiled.get(rule.id)!);
  }
  trace.push({
    phase: "MATCHING",
    summary: `${matched.length}/${candidates.length} regra(s) casaram`,
    evaluatedRules: evaluated,
  });

  // RESOLUTION: ordenação total determinística (ADR-005).
  const ordered = [...matched].sort((a, b) => compareRules(a, b, warnings));
  if (ordered.length > 1) {
    trace.push({
      phase: "RESOLUTION",
      summary: `vencedora: ${ordered[0]!.rule.id} (critérios ADR-005)`,
      evaluatedRules: ordered.map((c) => ({
        ruleId: c.rule.id,
        ruleVersion: c.rule.version,
        matched: true,
        reason: describeResolution(c),
      })),
    });
  }

  // COMPUTATION ou NO_RULE_FOUND (nunca zero silencioso).
  if (ordered.length === 0) {
    trace.push({ phase: "COMPUTATION", summary: "nenhuma regra aplicável" });
    trace.push({
      phase: "RESULT",
      summary: "NO_RULE_FOUND — erro de cobertura do catálogo",
    });
    return {
      engineVersion: ENGINE_VERSION,
      rulesetHash: rulesetHash(input.rules),
      asOfDate: ctx.asOfDate,
      tribute,
      outcome: { kind: "NO_RULE_FOUND", evaluatedRules: evaluated },
      trace,
      warnings,
    };
  }

  const winner = ordered[0]!.rule;
  const outcome = compute(winner, ctx, rounding);
  trace.push({
    phase: "COMPUTATION",
    summary: `regra ${winner.id} v${winner.version}: efeitos ${winner.effects.map((e) => e.type).join(", ")}`,
  });
  trace.push({ phase: "RESULT", summary: `outcome=${outcome.kind}` });

  return {
    engineVersion: ENGINE_VERSION,
    rulesetHash: rulesetHash(input.rules),
    asOfDate: ctx.asOfDate,
    tribute,
    outcome,
    appliedRule: {
      id: winner.id,
      version: winner.version,
      ...(winner.reviewReason ? { reviewReason: winner.reviewReason } : {}),
    },
    trace,
    warnings,
  };
}

/**
 * Ordenação lexicográfica (ADR-005): profundidade da condição →
 * prioridade explícita → versão mais recente → id ascendente
 * (com warning de ambiguidade quando o id decide).
 * Jurisdição e NCM entrarão como critérios na Fase 1 (dados completos).
 */
function compareRules(a: CompiledRule, b: CompiledRule, warnings: string[]): number {
  const byDepth = b.spec.depth() - a.spec.depth();
  if (byDepth !== 0) return byDepth;
  const byPriority = b.rule.priority - a.rule.priority;
  if (byPriority !== 0) return byPriority;
  const byVersion = b.rule.version - a.rule.version;
  if (byVersion !== 0) return byVersion;
  warnings.push(`ambiguidade entre ${a.rule.id} e ${b.rule.id} — desempate por id`);
  return a.rule.id.localeCompare(b.rule.id);
}

function describeResolution(c: CompiledRule): string {
  return `depth=${c.spec.depth()}, prioridade=${c.rule.priority}, v${c.rule.version}`;
}

function compute(rule: TaxRule, ctx: FiscalContext, rounding: RoundingPolicy): TaxOutcome {
  const basis = applyBasisEffects(rule, Money.fromCents(totalGoodsCents(ctx)));
  const difal = rule.effects.find((e) => e.type === "applyDifal");
  if (difal && difal.type === "applyDifal") {
    // Base dupla (LC 190/22, art. 13, IX, "b" e §6º, II):
    // ICMS interestadual = valor × alíq. inter.
    // base no destino = (valor − ICMS inter) / (1 − alíq. interna)
    // DIFAL = base_dest × alíq. interna − ICMS inter
    const interIcms = Math.trunc((basis.cents * difal.interstateRateBp) / 10000);
    const denom = 10000 - difal.internalRateBp;
    if (denom <= 0) throw new Error(`regra ${rule.id}: alíquota interna >= 100% inválida para base dupla`);
    const baseDest = Math.trunc(((basis.cents - interIcms) * 10000) / denom);
    const internalFull = Math.trunc((baseDest * difal.internalRateBp) / 10000);
    return {
      kind: "TAXED",
      basisCents: baseDest,
      rateBp: difal.internalRateBp - difal.interstateRateBp,
      amountCents: internalFull - interIcms,
      ...(rule.legalBasis ? { legalBasis: rule.legalBasis } : {}),
    };
  }
  const applySt = rule.effects.find((e) => e.type === "applySt");
  if (applySt && applySt.type === "applySt") {
    // base ST = valor da operação × (1 + MVA) — Conv. 92/15, art. 2º, IV
    const stBase = Money.fromCents(Math.round((basis.cents * (10000 + applySt.mvaBp)) / 10000));
    const rate = TaxRate.fromBasisPoints(applySt.rateBp);
    return {
      kind: "TAXED",
      basisCents: stBase.cents,
      rateBp: rate.basisPoints,
      amountCents: rate.applyTo(stBase, rounding).cents, // ST BRUTO; o líquido (−ICMS próprio) é composição do módulo
      ...(rule.legalBasis ? { legalBasis: rule.legalBasis } : {}),
    };
  }
  const dasAnexo = rule.effects.find((e) => e.type === "applyDasAnexo");
  if (dasAnexo && dasAnexo.type === "applyDasAnexo") {
    // Anexos III/V: efetiva = nominal − (dedução × 10000 / RBT12), LC 123/06
    if (!ctx.rbt12Cents || ctx.rbt12Cents <= 0) {
      throw new Error(`regra ${rule.id} exige rbt12Cents no contexto`);
    }
    const effBp = Math.max(0, dasAnexo.nominalBp - Math.round((dasAnexo.deductionCents * 10000) / ctx.rbt12Cents));
    const rate = TaxRate.fromBasisPoints(effBp);
    return {
      kind: "TAXED",
      basisCents: basis.cents,
      rateBp: rate.basisPoints,
      amountCents: rate.applyTo(basis, rounding).cents,
      ...(rule.legalBasis ? { legalBasis: rule.legalBasis } : {}),
    };
  }
  const applyRate = rule.effects.find((e) => e.type === "applyRate");
  if (applyRate && applyRate.type === "applyRate") {
    const rate = TaxRate.fromBasisPoints(applyRate.rateBp);
    return {
      kind: "TAXED",
      basisCents: basis.cents,
      rateBp: rate.basisPoints,
      amountCents: rate.applyTo(basis, rounding).cents,
      ...(rule.legalBasis ? { legalBasis: rule.legalBasis } : {}),
    };
  }
  const nonTaxed = rule.effects.find((e) =>
    e.type === "exempt" || e.type === "nonTaxable" || e.type === "zeroRate",
  );
  if (nonTaxed) {
    if (!rule.legalBasis) {
      throw new Error(`regra ${rule.id} produz estado não-tributado sem fundamento legal`);
    }
    return {
      kind: nonTaxed.type === "exempt" ? "EXEMPT"
        : nonTaxed.type === "nonTaxable" ? "NON_TAXABLE"
        : "ZERO_RATED",
      legalBasis: rule.legalBasis,
    };
  }
  throw new Error(`regra ${rule.id} sem efeito computável`);
}

function applyBasisEffects(rule: TaxRule, basis: Money): Money {
  let result = basis;
  for (const e of rule.effects) {
    if (e.type === "reduceBasis") {
      const reduction = result
        .allocate([e.pctBp, 10000 - e.pctBp])
        .map((m) => m.cents)[0]!;
      result = result.subtract(Money.fromCents(reduction));
    }
  }
  return result;
}

/** Hash determinístico do snapshot de regras (reprodutibilidade, ADR-007). */
function rulesetHash(rules: readonly TaxRule[]): string {
  const canonical = rules
    .map((r) => JSON.stringify([r.id, r.version, r.tribute, r.condition, r.effects, r.priority, r.validity.from.getTime(), r.validity.to?.getTime() ?? null]))
    .sort()
    .join(";");
  let h1 = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h1 ^= canonical.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, "0");
}
