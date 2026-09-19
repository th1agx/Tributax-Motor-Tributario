import type { TaxRule } from "@tributax/domain";
import { DateRange } from "@tributax/domain";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { taxRules } from "./schema.js";

/**
 * Importador da tabela municipal de ISS (ADR-004: regras como dados).
 * Não existe um CSV oficial único (cada município tem sua lei); a fonte é
 * curada por operação (agregadores, prefeituras, convenios) e importada:
 *   ibge;uf;nome;aliquota
 *   3550308;SP;São Paulo;2,9
 * Uma regra por município (LC 116/03 art. 3º: ISS do prestador).
 *
 * Uso:
 *   npx tsx src/iss-import.cli.ts --csv iss-municipios.csv [--db URL] [--dry-run]
 */

export interface IssMunicipalRow {
  readonly ibge: string; // 7 dígitos
  readonly uf: string;
  readonly nome: string;
  readonly aliquota: number; // %
}

export function parseIssCsv(csv: string): readonly IssMunicipalRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const sep = (lines[0]!.match(/;/g)?.length ?? 0) >= (lines[0]!.match(/,/g)?.length ?? 0) ? ";" : ",";
  const hasHeader = lines[0]!.toLowerCase().includes("ibge");
  const rows: IssMunicipalRow[] = [];
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const cols = line.split(sep);
    const ibge = (cols[0] ?? "").replace(/\D/g, "");
    const aliquota = Number((cols[3] ?? "").replace(",", "."));
    if (ibge.length !== 7 || Number.isNaN(aliquota) || aliquota < 2 || aliquota > 5) continue; // banda da LC 116 art. 8º-A
    rows.push({ ibge, uf: (cols[1] ?? "").trim().toUpperCase(), nome: (cols[2] ?? "").trim(), aliquota });
  }
  return rows;
}

export function buildIssMunicipalRules(
  rows: readonly IssMunicipalRow[],
  validFrom = "2026-01-01",
): readonly TaxRule[] {
  const seen = new Set<string>();
  const rules: TaxRule[] = [];
  for (const { ibge, nome, aliquota } of rows) {
    if (seen.has(ibge)) continue; // primeira ocorrência vence (dedupe)
    seen.add(ibge);
    const rateBp = Math.round(aliquota * 100);
    rules.push({
      id: `ISS-${ibge}-${rateBp}`,
      version: 1,
      tribute: "ISS",
      name: `ISS ${nome} ${rateBp / 100}% (prestador)`,
      jurisdiction: { scope: "MUNICIPAL", code: ibge },
      condition: {
        kind: "and",
        children: [
          { kind: "predicate", predicate: "operationKindIs", args: { kind: "SERVICE_PROVISION" } },
          { kind: "predicate", predicate: "issuerMunicipalityIs", args: { ibgeCode: ibge } },
          {
            kind: "or",
            children: [
              { kind: "predicate", predicate: "regimeIs", args: { regime: "NORMAL" } },
              { kind: "predicate", predicate: "regimeIs", args: { regime: "LUCRO_REAL" } },
              { kind: "predicate", predicate: "regimeIs", args: { regime: "LUCRO_PRESUMIDO" } },
            ],
          },
        ],
      },
      effects: [{ type: "applyRate", rateBp }],
      priority: 1, // acima das regras gerais do módulo ISS
      validity: DateRange.from(new Date(`${validFrom}T00:00:00Z`)),
      status: "ACTIVE",
      origin: "IMPORTED",
      legalBasis: { documentType: "LEI_MUNICIPAL", number: `lei de ${nome}`, year: "curada", provision: "lista anexa à LC 116/03" },
      reviewReason: "importado de tabela municipal curada — conferir lei municipal vigente",
    });
  }
  return rules;
}

/** Importa para tax_rules (idempotente por id+versão). */
export async function importIss(
  databaseUrl: string,
  rows: readonly IssMunicipalRow[],
  validFrom?: string,
): Promise<number> {
  const rules = buildIssMunicipalRules(rows, validFrom);
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
