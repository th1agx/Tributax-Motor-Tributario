import type { CatalogDiff, LegislationAlert, LegislationSource } from "@tributax/domain";
import type { RuleDraftInput } from "../rules/rule-admin.controller.js";
import type { TaxRule } from "@tributax/domain";

/**
 * LegislationWatch — núcleo puro do agente de monitoração (ADR-012).
 *
 * Princípio anti-alucinação: o agente NÃO lê legislação livre. Ele consome
 * um WATCH REPORT estruturado (valor observado + fonte primária citada),
 * compara com o catálogo vigente e produz alertas e propostas DRAFT.
 * A leitura das fontes (scraping/LLM) é responsabilidade do coletor,
 * um adapter externo — nunca do motor.
 */

/** Uma observação: "na fonte X, a regra Y vale Z". */
export interface WatchObservation {
  /** Regra do catálogo que a observação diz respeito (por id, ou match semântico). */
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

export interface WatchResult {
  readonly alerts: readonly LegislationAlert[];
  readonly proposals: readonly RuleDraftInput[];
}

export function diffCatalog(
  report: WatchReport,
  catalog: readonly TaxRule[],
  now: Date = new Date(),
): WatchResult {
  const alerts: LegislationAlert[] = [];
  const proposals: RuleDraftInput[] = [];

  for (const [i, obs] of report.observations.entries()) {
    // alvo: regra ACTIVE do catálogo para o tributo/jurisdição observados
    const target = findTarget(obs, catalog);
    if (!target) {
      alerts.push(alert(i, obs, now,
        `observação sem regra correspondente no catálogo (${obs.tribute}${obs.jurisdictionCode ? `/${obs.jurisdictionCode}` : ""}) — possível lacuna`,
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

      // proposta: mesma condição/efeitos da regra vigente, nova alíquota e vigência
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
  return catalog.find(
    (r) =>
      r.status === "ACTIVE" &&
      r.tribute === obs.tribute &&
      r.jurisdiction.code === obs.jurisdictionCode,
  );
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
