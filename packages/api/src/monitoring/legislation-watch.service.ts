/**
 * LegislationWatch — a lógica de diff vive no DOMÍNIO
 * (@tributax/domain monitoring/diff-catalog) desde 2026-09 (auditoria):
 * é compartilhada pela fila de triagem da API e pelos CLIs do collector,
 * que não podem importar a aplicação. Este módulo apenas reexpõe com os
 * tipos da aplicação.
 */
export {
  diffCatalog,
  MIN_PROPOSAL_CONFIDENCE,
  type WatchObservation,
  type WatchReport,
  type WatchResult,
} from "@tributax/domain";

import type { RuleRevisionProposal, WatchReport as DomainReport } from "@tributax/domain";
import type { TaxRule } from "@tributax/domain";
import type { RuleDraftInput } from "../rules/rule-admin.controller.js";

/** Adaptador: propostas do domínio → rascunhos aceitos por POST /v1/rules. */
export async function proposeRevisions(
  report: DomainReport,
  catalog: readonly TaxRule[],
): Promise<readonly RuleDraftInput[]> {
  const { diffCatalog } = await import("@tributax/domain");
  const { proposals } = diffCatalog(report, catalog);
  return proposals satisfies readonly RuleRevisionProposal[] as readonly RuleDraftInput[];
}
