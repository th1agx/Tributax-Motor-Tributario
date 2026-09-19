/**
 * CLI do importador municipal de ISS:
 *   npx tsx src/iss-import.cli.ts --csv iss-municipios.csv [--db DATABASE_URL] [--dry-run]
 * CSV esperado: ibge;uf;nome;aliquota (alíquota em %, decimal vírgula ok).
 * Sem --db, apenas converte e reporta (dry-run implícito).
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const csvPath = args[args.indexOf("--csv") + 1];
  const dbIdx = args.indexOf("--db");
  const db = dbIdx !== -1 ? args[dbIdx + 1] : undefined;
  const dryRun = args.includes("--dry-run") || db === undefined;
  if (!csvPath || csvPath === "--") {
    console.error("uso: iss-import.cli.ts --csv iss-municipios.csv [--db URL] [--dry-run]");
    process.exit(1);
  }

  const { readFile } = await import("node:fs/promises");
  const { parseIssCsv, buildIssMunicipalRules, importIss } = await import("./iss-import.js");
  const rows = parseIssCsv(await readFile(csvPath, "utf-8"));
  if (rows.length === 0) {
    console.error("nenhuma linha válida (esperado: ibge 7 dígitos e alíquota entre 2 e 5)");
    process.exit(1);
  }
  const rules = buildIssMunicipalRules(rows);
  console.log(`ISS: ${rows.length} municípios → ${rules.length} regras`);

  if (dryRun) {
    console.log("dry-run: nada gravado (passe --db para importar)");
    return;
  }
  const inserted = await importIss(db!, rows);
  console.log(`importadas ${inserted} regras ISS em tax_rules (idempotente por id+versão)`);
}

main().catch((err: unknown) => {
  console.error(`[iss-import] falhou: ${(err as Error).message}`);
  process.exit(1);
});
