/**
 * CLI do importador de TIPI:
 *   npx tsx src/tipi-import.cli.ts --csv tipi.csv [--db DATABASE_URL] [--dry-run]
 *
 * A TIPI oficial (XLSX) está em:
 *   https://www.gov.br/receitafederal/pt-br/assuntos/aduaneira-e-comercio-exterior/classificacao-fiscal-de-mercadorias/tipi
 * Exporte a aba como CSV (ncm;descricao;aliquota) e aponte --csv.
 * Sem --db, apenas converte e reporta (dry-run implícito).
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const csvPath = args[args.indexOf("--csv") + 1];
  const dbIdx = args.indexOf("--db");
  const db = dbIdx !== -1 ? args[dbIdx + 1] : undefined;
  const dryRun = args.includes("--dry-run") || db === undefined;
  if (!csvPath || csvPath === "--") {
    console.error("uso: tipi-import.cli.ts --csv tipi.csv [--db URL] [--dry-run]");
    process.exit(1);
  }

  const { readFile } = await import("node:fs/promises");
  const { parseTipiCsv, buildTipiRules, importTipi } = await import("./tipi-import.js");
  const rows = parseTipiCsv(await readFile(csvPath, "utf-8"));
  if (rows.length === 0) {
    console.error("nenhuma linha válida (esperado: ncm de 8 dígitos e alíquota numérica)");
    process.exit(1);
  }
  const rules = buildTipiRules(rows);
  console.log(`TIPI: ${rows.length} NCMs → ${rules.length} regras`);

  if (dryRun) {
    console.log("dry-run: nada gravado (passe --db para importar)");
    return;
  }
  const inserted = await importTipi(db!, rows);
  console.log(`importadas ${inserted} regras IPI em tax_rules (idempotente por id+versão)`);
}

main().catch((err: unknown) => {
  console.error(`[tipi-import] falhou: ${(err as Error).message}`);
  process.exit(1);
});
