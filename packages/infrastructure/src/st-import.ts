import type { TaxRule, Uf } from "@tributax/domain";
import { icmsStRule } from "@tributax/domain";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { taxRules } from "./schema.js";

/**
 * Importador da tabela de substituição tributária (ADR-004: regras como
 * dados). Fonte curada de protocolos/convênios (CONFAZ) por UF:
 *   uf;ncm;mva
 *   SP;30049099;37,54
 * A alíquota interna do destino é resolvida do catálogo do domínio
 * (internalRateOf) — um único lugar guarda a alíquota.
 *
 * Uso:
 *   npx tsx src/st-import.cli.ts --csv st-mvas.csv [--db URL] [--dry-run]
 */

export interface StRow {
  readonly uf: string;
  readonly ncm: string; // 8 dígitos
  readonly mva: number; // %
}

const VALID_UFS: ReadonlySet<string> = new Set([
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB",
  "PE","PI","PR","RJ","RN","RO","RR","RS","SC","SP","SE","TO",
]);

export function parseStCsv(csv: string): readonly StRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const sep = (lines[0]!.match(/;/g)?.length ?? 0) >= (lines[0]!.match(/,/g)?.length ?? 0) ? ";" : ",";
  const hasHeader = lines[0]!.toLowerCase().includes("uf") || lines[0]!.toLowerCase().includes("mva");
  const rows: StRow[] = [];
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const cols = line.split(sep);
    const uf = (cols[0] ?? "").trim().toUpperCase();
    const ncm = (cols[1] ?? "").replace(/\D/g, "");
    const mva = Number((cols[2] ?? "").replace(",", "."));
    if (!VALID_UFS.has(uf) || ncm.length !== 8 || Number.isNaN(mva) || mva < 0 || mva > 1000) continue;
    rows.push({ uf, ncm, mva });
  }
  return rows;
}

export function buildStRules(rows: readonly StRow[], validFrom?: string): readonly TaxRule[] {
  const seen = new Set<string>();
  const rules: TaxRule[] = [];
  for (const { uf, ncm, mva } of rows) {
    const key = `${uf}|${ncm}`;
    if (seen.has(key)) continue; // primeira ocorrência vence
    seen.add(key);
    rules.push(icmsStRule(uf as Uf, ncm, Math.round(mva * 100), validFrom));
  }
  return rules;
}

/** Importa para tax_rules (idempotente por id+versão). */
export async function importSt(
  databaseUrl: string,
  rows: readonly StRow[],
  validFrom?: string,
): Promise<number> {
  const rules = buildStRules(rows, validFrom);
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);
  await db
    .insert(taxRules)
    .values(
      rules.map((r) => ({
        id: r.id,
        version: String(r.version),
        tribute: r.tribute,
        name: r.name,
        jurisdictionScope: r.jurisdiction.scope,
        ...(r.jurisdiction.code ? { jurisdictionCode: r.jurisdiction.code } : {}),
        condition: r.condition,
        effects: r.effects,
        priority: String(r.priority),
        validity: { from: r.validity.from.toISOString().slice(0, 10), to: null },
        status: r.status,
        ...(r.legalBasis ? { legalBasis: r.legalBasis } : {}),
        origin: r.origin,
        ...(r.reviewReason ? { reviewReason: r.reviewReason } : {}),
      })),
    )
    .onConflictDoNothing();
  await pool.end();
  return rules.length;
}
