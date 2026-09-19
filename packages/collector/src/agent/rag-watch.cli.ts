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
import { InMemoryNormStore } from "../store/norm-store.js";
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

  const result = await runWatchCycle({
    target: { tribute: args.tribute, ...(args.uf !== undefined ? { jurisdictionCode: args.uf } : {}) },
    collector: composite,
    store: new InMemoryNormStore(),
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
    const res = await fetch(`${args.api}/v1/monitoring/watch-reports`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(result.report),
    });
    if (res.status === 404) {
      // a API ainda não expõe ingestão de reports; o fluxo oficial hoje é o
      // watch-agent.cli.ts consumindo o arquivo gravado
      console.error(`[rag-watch] API não expõe watch-reports (404); use: npx tsx ../../api/src/monitoring/watch-agent.cli.ts --api ${args.api} --report ${args.out} --apply`);
      process.exit(2);
    }
    if (!res.ok) throw new Error(`apply: HTTP ${res.status} — ${await res.text()}`);
    console.error("[rag-watch] report aplicado — propostas DRAFT criadas (triagem humana pendente)");
  }
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
