/**
 * CLI do pipeline RAG (ADR-013) — adapter externo, como o watch-agent.cli.ts.
 *
 * Uso:
 *   npx tsx src/agent/rag-watch.cli.ts --tribute ICMS --uf RJ [--since 7] \
 *       [--topk 8] [--out watch-report.json] [--apply --api http://localhost:3000]
 *
 * Sem --apply: apenas grava o report (dry-run). Com --apply: encadeia o
 * envio à API como o watch-agent.cli.ts faria — nada vira ACTIVE sem humano.
 * Sem OPENAI_API_KEY roda em modo offline com providers fake (útil para
 * demonstrar o pipeline; extração sai vazia).
 */

import { runWatchCycle, type WatchCycleResult } from "./watch-cycle.js";
import { RssCollector } from "../sources/rss-collector.js";
import { DouCollector } from "../sources/dou-collector.js";
import { InMemoryNormStore, type NormStore } from "../store/norm-store.js";
import { FakeEmbeddingProvider, OpenAIEmbeddingProvider } from "../rag/embeddings.js";
import { LlmObservationExtractor, type LlmClient } from "../extract/observation-extractor.js";
import { OpenAiChatClient } from "../extract/openai-client.js";

interface Args {
  tribute: string;
  uf?: string | undefined;
  since: number;
  topk: number;
  out: string;
  api: string;
  apply: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { tribute: "", since: 7, topk: 8, out: "watch-report.json", api: "http://localhost:3000", apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--tribute") args.tribute = argv[++i] ?? "";
    else if (a === "--uf") args.uf = argv[++i];
    else if (a === "--since") args.since = Number(argv[++i]);
    else if (a === "--topk") args.topk = Number(argv[++i]);
    else if (a === "--out") args.out = argv[++i] ?? args.out;
    else if (a === "--api") args.api = argv[++i] ?? args.api;
    else if (a === "--apply") args.apply = true;
  }
  if (!args.tribute) {
    console.error("uso: rag-watch.cli.ts --tribute ICMS [--uf RJ] [--since 7] [--topk 8] [--out arquivo.json] [--apply --api URL]");
    process.exit(1);
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const hasLlm = Boolean(process.env.OPENAI_API_KEY);

  const collectors = [
    new DouCollector(),
    // diários/SEFAZs: alimentar via env WATCH_RSS_FEEDS (URLs separadas por vírgula)
    ...(process.env.WATCH_RSS_FEEDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "")
      .map((url, i) => new RssCollector(`RSS-${i + 1}`, url)),
  ];

  // coletor composto: concatena resultados, tolera fonte individual fora do ar
  const composite = {
    name: "composite",
    async collect(keywords: readonly string[], sinceDays: number) {
      const all = await Promise.allSettled(collectors.map((c) => c.collect(keywords, sinceDays)));
      for (const r of all) if (r.status === "rejected") console.warn(`[warn] coletor falhou: ${String(r.reason)}`);
      return all.flatMap((r) => (r.status === "fulfilled" ? [...r.value] : []));
    },
  };

  const embeddings = hasLlm ? new OpenAIEmbeddingProvider() : new FakeEmbeddingProvider();
  const llm: LlmClient = hasLlm ? new OpenAiChatClient() : { completeJson: async () => [] };

  // NormStore PERSISTENTE quando há banco (auditoria 3.1): pgvector já
  // provisionado e ocioso; memória morre com o processo e re-embeda tudo.
  let store: NormStore = new InMemoryNormStore();
  let storeCloser: (() => Promise<void>) | undefined;
  if (process.env.DATABASE_URL) {
    try {
      // import dinâmico com especificador NÃO-literal: dependência de
      // runtime opcional (infra é construída depois no pipeline de build);
      // o tipo é fixado localmente pelo cast.
      const infraModule = "@tributax/infrastructure";
      const { PostgresNormStore } = (await import(infraModule)) as {
        PostgresNormStore: new (url: string) => NormStore & { close(): Promise<void> };
      };
      store = new PostgresNormStore(process.env.DATABASE_URL);
      storeCloser = () => store === undefined ? Promise.resolve() : (store as unknown as { close(): Promise<void> }).close();
    } catch (e) {
      console.warn(`[rag-watch] PostgresNormStore indisponível (${(e as Error).message}) — usando memória`);
    }
  } else {
    console.warn("[rag-watch] sem DATABASE_URL — NormStore em memória (base não acumula entre execuções)");
  }

  const result = await runWatchCycle({
    target: { tribute: args.tribute, ...(args.uf !== undefined ? { jurisdictionCode: args.uf } : {}) },
    collector: composite,
    store,
    embeddings,
    extractor: new LlmObservationExtractor(llm),
    sinceDays: args.since,
    topK: args.topk,
  });

  const { writeFile } = await import("node:fs/promises");
  await writeFile(args.out, JSON.stringify(result.report, null, 2), "utf-8");

  console.error(`[rag-watch] ${summary(result)} — report em ${args.out}`);
  for (const r of result.rejections) console.error(`[rag-watch] rejeitado: ${r.reason}`);

  if (args.apply) {
    // apply REAL (auditoria 3.2): a rota /v1/monitoring/watch-reports não
    // existe; o fluxo oficial é diff do report contra o catálogo + POST de
    // propostas DRAFT AI_SUGGESTED — exatamente o que o watch-agent faz.
    // Reimplementado aqui para o --apply funcionar de ponta a ponta.
    const adminKey = process.env.TRIBUTAX_ADMIN_KEY ?? process.env.TRIBUTAX_API_KEY ?? "";
    if (!adminKey) {
      console.error("[rag-watch] --apply exige TRIBUTAX_ADMIN_KEY (catálogo é admin-only)");
      if (storeCloser) await storeCloser();
      process.exit(1);
    }
    const authHeaders = { "x-admin-key": adminKey, "content-type": "application/json" };

    const rulesRes = await fetch(`${args.api}/v1/rules`, { headers: authHeaders });
    if (!rulesRes.ok) {
      console.error(`[rag-watch] falha ao ler catálogo: HTTP ${rulesRes.status}`);
      if (storeCloser) await storeCloser();
      process.exit(1);
    }
    const rules = (await rulesRes.json()) as readonly {
      id: string; version: number; tribute: string; name: string;
      jurisdiction: { scope: string; code?: string }; condition: unknown;
      effects: readonly { type: string; rateBp?: number; pctBp?: number }[];
      priority: number; validity: { from: string; to?: string | null };
      status: string; legalBasis?: unknown; origin: string; reviewReason?: string;
    }[];
    const catalog = rules.map((r) => ({
      id: r.id, version: r.version, tribute: r.tribute, name: r.name,
      jurisdiction: { scope: r.jurisdiction.scope, ...(r.jurisdiction.code ? { code: r.jurisdiction.code } : {}) },
      condition: r.condition as never, effects: r.effects as never, priority: r.priority,
      validity: { from: new Date(r.validity.from), ...(r.validity.to ? { to: new Date(r.validity.to) } : {}) },
      status: r.status as never, ...(r.legalBasis ? { legalBasis: r.legalBasis as never } : {}),
      origin: r.origin as never, ...(r.reviewReason ? { reviewReason: r.reviewReason } : {}),
    }));

    const { diffCatalog } = await import("@tributax/domain");
    const normalized = {
      generatedAt: result.report.generatedAt,
      observations: result.report.observations.map((o) => ({
        ...o,
        sources: o.sources.map((s) => ({ ...s, publishedAt: new Date(s.publishedAt) })),
      })),
    };
    const { alerts, proposals } = diffCatalog(normalized, catalog as never);
    for (const a of alerts) console.error(`[rag-watch][ALERT] ${a.summary}`);
    console.error(`[rag-watch] apply: ${alerts.length} alertas, ${proposals.length} propostas`);

    for (const p of proposals) {
      const res2 = await fetch(`${args.api}/v1/rules`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(p),
      });
      const body = (await res2.json()) as { rule?: { id: string }; message?: string };
      console.error(res2.ok ? `[rag-watch][DRAFT] ${body.rule?.id} criada` : `[rag-watch][ERRO] HTTP ${res2.status}: ${body.message}`);
    }
  }

  if (storeCloser) await storeCloser();
}

function summary(r: WatchCycleResult): string {
  return [
    `normas=${r.stats.normsCollected} (novas ${r.stats.normsNew})`,
    `chunks=${r.stats.chunksEmbedded}`,
    `recuperados=${r.stats.chunksRetrieved}`,
    `observações=${r.report.observations.length}`,
    `rejeitadas=${r.rejections.length}`,
  ].join(" ");
}

main().catch((err: unknown) => {
  console.error(`[rag-watch] falhou: ${(err as Error).message}`);
  process.exit(1);
});
