/**
 * CLI do agente LegislationWatch (ADR-012) — adapter EXTERNO ao core:
 * conversa apenas com a API pública, como qualquer cliente.
 *
 * Uso:
 *   npx tsx src/monitoring/watch-agent.cli.ts --api http://localhost:3000 \
 *       --report watch-report.json [--apply]
 *
 * Sem --apply: apenas reporta alertas (dry-run, sempre seguro).
 * Com --apply: cria propostas DRAFT (origin AI_SUGGESTED) via POST /v1/rules
 * com proposedBy=AI_AGENT — a API garante que nada vira ACTIVE sem humano.
 */

interface CliArgs {
  api: string;
  report: string;
  apply: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = { api: "http://localhost:3000", report: "", apply: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--api") args.api = argv[++i] ?? args.api;
    else if (argv[i] === "--report") args.report = argv[++i] ?? "";
    else if (argv[i] === "--apply") args.apply = true;
  }
  if (!args.report) {
    console.error("uso: watch-agent.cli.ts --api URL --report arquivo.json [--apply]");
    process.exit(1);
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { readFile } = await import("node:fs/promises");
  const report = JSON.parse(await readFile(args.report, "utf-8")) as {
    generatedAt: string;
    observations: readonly {
      ruleId?: string; tribute: string; jurisdictionCode?: string;
      rateBp: number; validFrom: string; validTo?: string;
      sources: readonly { url: string; publishedAt: string; excerpt: string }[];
      confidence: number; notes?: string;
    }[];
  };

  // catálogo via API — /v1/rules exige admin key (auditoria 3.3/3.7)
  const adminKey = process.env.TRIBUTAX_ADMIN_KEY ?? process.env.TRIBUTAX_API_KEY ?? "";
  if (!adminKey) {
    console.error("[watch-agent] TRIBUTAX_ADMIN_KEY ausente — o catálogo é admin-only; configure a env");
    process.exit(1);
  }
  const authHeaders = { "x-admin-key": adminKey, "content-type": "application/json" };

  const res = await fetch(`${args.api}/v1/rules`, { headers: authHeaders });
  if (!res.ok) throw new Error(`falha ao ler catálogo: HTTP ${res.status}`);
  const catalogJson = (await res.json()) as readonly {
    id: string; version: number; tribute: string; name: string;
    jurisdiction: { scope: string; code?: string };
    condition: unknown; effects: readonly { type: string; rateBp?: number; pctBp?: number }[];
    priority: number; validity: { from: string; to?: string | null };
    status: string; legalBasis?: unknown; origin: string; reviewReason?: string;
  }[];

  // desserialização mínima para TaxRule (datas como Date)
  const catalog = catalogJson.map((r) => ({
    id: r.id, version: r.version, tribute: r.tribute, name: r.name,
    jurisdiction: { scope: r.jurisdiction.scope, ...(r.jurisdiction.code ? { code: r.jurisdiction.code } : {}) },
    condition: r.condition as never,
    effects: r.effects as never,
    priority: r.priority,
    validity: { from: new Date(r.validity.from), ...(r.validity.to ? { to: new Date(r.validity.to) } : {}) },
    status: r.status as never,
    ...(r.legalBasis ? { legalBasis: r.legalBasis as never } : {}),
    origin: r.origin as never,
    ...(r.reviewReason ? { reviewReason: r.reviewReason } : {}),
  }));

  const { diffCatalog } = await import("./legislation-watch.service.js");
  const normalized = {
    generatedAt: report.generatedAt,
    observations: report.observations.map((o) => ({
      ...o,
      sources: o.sources.map((s) => ({ ...s, publishedAt: new Date(s.publishedAt) })),
    })),
  };
  const { alerts, proposals } = diffCatalog(normalized, catalog as never);

  console.log(`\n=== LegislationWatch ${args.apply ? "(APPLY)" : "(dry-run)"} ===`);
  for (const a of alerts) {
    console.log(`[ALERT ${a.status}] ${a.summary}`);
    for (const s of a.sources) console.log(`    fonte: ${s.url} (${s.publishedAt.toISOString().slice(0, 10)})`);
  }
  console.log(`alertas: ${alerts.length} | propostas: ${proposals.length}`);

  if (!args.apply) {
    if (proposals.length > 0) console.log("dry-run: use --apply para criar as propostas em DRAFT");
    return;
  }
  for (const p of proposals) {
    const created = await fetch(`${args.api}/v1/rules`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(p),
    });
    const body = (await created.json()) as { rule?: { id: string }; message?: string };
    console.log(created.ok ? `[DRAFT] ${body.rule?.id} criada` : `[ERRO] HTTP ${created.status}: ${body.message}`);
  }
}

void main();
