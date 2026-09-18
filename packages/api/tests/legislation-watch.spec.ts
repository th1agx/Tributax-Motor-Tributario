import { describe, expect, it } from "vitest";
import { diffCatalog, type WatchReport } from "../src/monitoring/legislation-watch.service.js";
import { icmsRuleCatalog } from "@tributax/domain";

const source = { url: "https://exemplo.sefaz.se.gov.br/decreto", publishedAt: new Date("2026-09-10T00:00:00Z"), excerpt: "Decreto altera alíquota" };

function report(observations: WatchReport["observations"]): WatchReport {
  return { generatedAt: "2026-09-18T09:00:00Z", observations };
}

describe("LegislationWatch — diff catálogo × observações", () => {
  it("alíquota divergente gera alerta com diff + proposta DRAFT AI_SUGGESTED", () => {
    const { alerts, proposals } = diffCatalog(
      report([{
        ruleId: "ICMS-INT-MG", tribute: "ICMS", jurisdictionCode: "MG",
        rateBp: 1900, validFrom: "2026-10-01", sources: [source], confidence: 0.9,
      }]),
      icmsRuleCatalog(),
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.summary).toMatch(/1800 bp difere da observada 1900 bp/);
    expect(alerts[0]!.sources[0]!.url).toContain("sefaz");

    expect(proposals).toHaveLength(1);
    const p = proposals[0]!;
    expect(p.proposedBy).toBe("AI_AGENT");
    expect(p.effects).toEqual([{ type: "applyRate", rateBp: 1900 }]);
    expect(p.reviewReason).toMatch(/NEEDS_REVIEW/);
    expect(p.validFrom).toBe("2026-10-01");
  });

  it("observação igual ao catálogo não gera nada", () => {
    const { alerts, proposals } = diffCatalog(
      report([{
        ruleId: "ICMS-INT-MG", tribute: "ICMS", jurisdictionCode: "MG",
        rateBp: 1800, validFrom: "2026-01-01", sources: [source], confidence: 1,
      }]),
      icmsRuleCatalog(),
    );
    expect(alerts).toHaveLength(0);
    expect(proposals).toHaveLength(0);
  });

  it("observação sem regra correspondente vira alerta de lacuna (não proposta)", () => {
    const { alerts, proposals } = diffCatalog(
      report([{
        tribute: "ICMS", jurisdictionCode: "SE",
        rateBp: 1800, validFrom: "2026-01-01", sources: [source], confidence: 0.7,
      }]),
      icmsRuleCatalog().filter((r) => r.id !== "ICMS-INT-SE"),
    );
    expect(alerts[0]!.summary).toMatch(/lacuna/);
    expect(proposals).toHaveLength(0);
  });
});
