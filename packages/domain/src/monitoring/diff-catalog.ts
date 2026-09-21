import type { CatalogDiff, LegislationAlert, LegislationSource } from "./legislation-watch.js";
import type { Jurisdiction, RuleEffect, RuleStatus, TaxRule } from "../decision/tax-rule.js";
import type { LegalBasisRef, TributeId } from "../decision/tax-outcome.js";
import type { SpecJson } from "../specification/spec.js";

/**
 * diffCatalog (ADR-012/013) — núcleo puro do agente de monitoração.
 * Movido para o DOMÍNIO (2026-09, auditoria): a lógica é compartilhada
 * pela API (fila de triagem) e pelos CLIs do collector, que não podem
 * importar a aplicação.
 *
 * Princípio anti-alucinação: o agente NÃO lê legislação livre. Ele consome
 * um WATCH REPORT estruturado (valor observado + fonte primária citada),
 * compara com o catálogo vigente e produz alertas e propostas DRAFT.
 */

/** Uma observação: "na fonte X, a regra Y vale Z". */
export interface WatchObservation {
  readonly ruleId?: string;
  readonly tribute: string;
  readonly jurisdictionCode?: string;
  readonly rateBp: number;
  readonly validFrom: string;
  readonly validTo?: string;
  readonly sources: readonly LegislationSource[];
  readonly confidence: number;
  readonly notes?: string;
}

export interface WatchReport {
  readonly generatedAt: string;
  readonly observations: readonly WatchObservation[];
}

/** Proposta de revisão — forma de rascunho aceita pelo catálogo (DRAFT). */
export interface RuleRevisionProposal {
  readonly tribute: TributeId;
  readonly name: string;
  readonly jurisdiction: Jurisdiction;
  readonly condition: SpecJson;
  readonly effects: readonly RuleEffect[];
  readonly priority: number;
  readonly validFrom: string;
  readonly validTo?: string;
  readonly legalBasis?: LegalBasisRef;
  readonly reviewReason: string;
  readonly proposedBy: "AI_AGENT";
}

export interface WatchResult {
  readonly alerts: readonly LegislationAlert[];
  readonly proposals: readonly RuleRevisionProposal[];
}

/** Confiança mínima para GERAR PROPOSTA; abaixo disso só alerta (auditoria 3.5). */
export const MIN_PROPOSAL_CONFIDENCE = 0.6;

export function diffCatalog(
  report: WatchReport,
  catalog: readonly TaxRule[],
  now: Date = new Date(),
): WatchResult {
  const alerts: LegislationAlert[] = [];
  const proposals: RuleRevisionProposal[] = [];

  for (const [i, obs] of report.observations.entries()) {
    const target = findTarget(obs, catalog);
    if (!target) {
      alerts.push(alert(i, obs, now,
        `observação sem regra correspondente ÚNICA no catálogo (${obs.tribute}${obs.jurisdictionCode ? `/${obs.jurisdictionCode}` : ""}) — lacuna ou ambiguidade; triagem humana`,
        { kind: "RULE_ADDED", ruleId: obs.ruleId ?? "?" }));
      continue;
    }

    const applyRate = target.effects.find((e) => e.type === "applyRate");
    if (!applyRate || applyRate.type !== "applyRate") continue;

    if (applyRate.rateBp !== obs.rateBp) {
      const diff: CatalogDiff = {
        kind: "RATE_CHANGED",
        field: "effects.rateBp",
        from: applyRate.rateBp,
        to: obs.rateBp,
      };
      alerts.push(alert(i, obs, now,
        `${target.id}: alíquota do catálogo ${applyRate.rateBp} bp difere da observada ${obs.rateBp} bp`,
        diff));

      // confiança baixa gera ALERTA, não proposta — o review humano decide
      if (obs.confidence < MIN_PROPOSAL_CONFIDENCE) continue;

      proposals.push({
        tribute: target.tribute,
        name: `${target.name} (revisão proposta por IA — fonte ${obs.sources[0]?.publishedAt.toISOString().slice(0, 10) ?? "?"})`,
        jurisdiction: target.jurisdiction,
        condition: target.condition,
        effects: [{ type: "applyRate", rateBp: obs.rateBp }],
        priority: target.priority,
        validFrom: obs.validFrom,
        ...(obs.validTo ? { validTo: obs.validTo } : {}),
        ...(target.legalBasis ? { legalBasis: target.legalBasis } : {}),
        reviewReason: `proposta automática a partir de observação (confiança ${obs.confidence}); validar fonte antes de aprovar (NEEDS_REVIEW)`,
        proposedBy: "AI_AGENT",
      });
    }
  }

  return { alerts, proposals };
}

function findTarget(obs: WatchObservation, catalog: readonly TaxRule[]): TaxRule | undefined {
  if (obs.ruleId) {
    const byId = catalog.find((r) => r.id === obs.ruleId && r.status === "ACTIVE");
    if (byId) return byId;
  }
  const candidates = catalog.filter(
    (r) =>
      r.status === ("ACTIVE" as RuleStatus) &&
      r.tribute === obs.tribute &&
      r.jurisdiction.code === obs.jurisdictionCode,
  );
  // ambiguidade SEM alvo único (auditoria 3.5): uma observação federal de
  // PIS não pode virar, por acaso, proposta de alterar o não cumulativo —
  // devolve undefined para virar alerta de triagem, não proposta.
  if (candidates.length > 1) return undefined;
  return candidates[0];
}

function alert(
  index: number,
  obs: WatchObservation,
  now: Date,
  summary: string,
  diff: CatalogDiff,
): LegislationAlert {
  return {
    id: `alert-${now.getTime()}-${index}`,
    detectedAt: now,
    tribute: obs.tribute as LegislationAlert["tribute"],
    ...(obs.jurisdictionCode ? { jurisdictionCode: obs.jurisdictionCode } : {}),
    summary,
    sources: obs.sources,
    confidence: obs.confidence,
    status: "OPEN",
  };
}
