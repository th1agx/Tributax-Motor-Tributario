/**
 * CLI do importador de MVA de substituição tributária:
 *   npx tsx src/st-import.cli.ts --csv st-mvas.csv [--db DATABASE_URL] [--dry-run]
 * CSV esperado: uf;ncm;mva (MVA em %, decimal vírgula ok).
 * Fonte: protocolos/convênios CONFAZ consolidados por UF (curadoria).
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const csvPath = args[args.indexOf("--csv") + 1];
  const dbIdx = args.indexOf("--db");
  const db = dbIdx !== -1 ? args[dbIdx + 1] : undefined;
  const dryRun = args.includes("--dry-run") || db === undefined;
  if (!csvPath || csvPath === "--") {
    console.error("uso: st-import.cli.ts --csv st-mvas.csv [--db URL] [--dry-run]");
    process.exit(1);
  }

  const { readFile } = await import("node:fs/promises");
  const { parseStCsv, buildStRules, importSt } = await import("./st-import.js");
  const rows = parseStCsv(await readFile(csvPath, "utf-8"));
  if (rows.length === 0) {
    console.error("nenhuma linha válida (esperado: UF válida, NCM 8 dígitos, MVA numérica)");
    process.exit(1);
  }
  const rules = buildStRules(rows);
  console.log(`ICMS-ST: ${rows.length} linhas → ${rules.length} regras`);

  if (dryRun) {
    console.log("dry-run: nada gravado (passe --db para importar)");
    return;
  }
  const inserted = await importSt(db!, rows);
  console.log(`importadas ${inserted} regras ICMS_ST em tax_rules (idempotente por id+versão)`);
}

main().catch((err: unknown) => {
  console.error(`[st-import] falhou: ${(err as Error).message}`);
  process.exit(1);
});
