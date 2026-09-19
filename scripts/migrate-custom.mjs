/**
 * Aplica as migrations custom (01_no_overlap, 02_pgvector, 03_tenants) via
 * node+pg — elimina a dependência de psql local. Uso:
 *   DATABASE_URL="postgres://..." node scripts/migrate-custom.mjs
 * Idempotente: todas as migrations usam IF NOT EXISTS / guardas.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL ausente");
  process.exit(1);
}

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../packages/infrastructure/drizzle/custom");
const files = ["01_no_overlap.sql", "02_pgvector.sql", "03_tenants.sql"];

const pool = new pg.Pool({ connectionString: url });
try {
  for (const f of files) {
    const sql = await readFile(path.join(dir, f), "utf-8");
    try {
      await pool.query(sql);
      console.log(`ok: ${f}`);
    } catch (err) {
      // 01 depende do schema base (drizzle-kit migrate) — falha explicíta se pendente
      if (/relation .* does not exist/i.test(String(err))) {
        console.error(`pendente: ${f} requer "npx drizzle-kit migrate" antes (erro: ${err.message})`);
        process.exit(2);
      }
      if (/extension .* not available/i.test(String(err))) {
        console.error(`sem pgvector: ${f} requer imagem/extension pgvector (${err.message})`);
        process.exit(3);
      }
      throw err;
    }
  }
  console.log("migrations custom aplicadas.");
} finally {
  await pool.end();
}
