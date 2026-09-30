/**
 * CLI do importador NACIONAL de ISS (planilha do Portal NFS-e, gov.br):
 *   npx tsx src/iss-import-nacional.cli.ts --txt aliquotas-municipios.txt \
 *       [--db DATABASE_URL] [--dry-run]
 *
 * Dry-run (default sem --db): estatísticas sem tocar em banco.
 */
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
let txtPath = "";
let db: string | undefined;
let dryRun = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--txt") txtPath = args[++i] ?? "";
  else if (args[i] === "--db") db = args[++i];
  else if (args[i] === "--dry-run") dryRun = true;
}
if (!txtPath) {
  console.error("uso: iss-import-nacional.cli.ts --txt aliquotas-municipios.txt [--db URL] [--dry-run]");
  process.exit(1);
}

const { parseIssNacional, groupIssNacional, importIssNacional } = await import("./iss-import-nacional.js");
const rows = parseIssNacional(await readFile(txtPath, "utf-8"));
const groups = groupIssNacional(rows);
const municipios = new Set(groups.map((g) => g.ibge)).size;

console.log(`linhas válidas: ${rows.length} (banda 2–5% LC 116 aplicada)`);
console.log(`municípios: ${municipios}`);
console.log(`regras (município × alíquota): ${groups.length}`);

if (!db || dryRun) {
  if (db) console.log("[dry-run] banco não tocado");
  process.exit(0);
}

const inserted = await importIssNacional(db, groups);
console.log(`inseridas: ${inserted} (id+versão existentes ignoradas)`);
