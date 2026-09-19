import type { SpecJson, TaxRule } from "@tributax/domain";
import { DateRange } from "@tributax/domain";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { taxRules } from "./schema.js";

/**
 * Importador da TIPI (ADR-004: regras como dados): converte a tabela
 * oficial da Receita Federal (XLSX exportado como CSV: ncm;descricao;aliquota)
 * em regras IPI no tax_rules — a TIPI inteira vira DADO, não código.
 *
 * Compressão de prefixos: NCMs do mesmo capítulo com a mesma alíquota são
 * agrupados no maior prefixo comum (ex.: todo o cap. 30 a 0% → uma regra
 * ncmStartsWith "30"), reduzindo ~9 mil linhas para algumas centenas de
 * regras sem perda de precisão.
 *
 * Uso:
 *   npx tsx src/tipi-import.ts --csv tipi.csv [--db URL] [--dry-run]
 * Sem --db: apenas converte e reporta. Sem --dry-run e com --db: upsert.
 */

export interface TipiRow {
  readonly ncm: string;
  readonly aliquota: number; // % (0 = alíquota zero; NaN tratado fora)
}

/** CSV com colunas ncm e aliquota (separador ; ou , decimal , ou .). */
export function parseTipiCsv(csv: string): readonly TipiRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const header = lines[0]!.toLowerCase();
  const sep = (lines[0]!.match(/;/g)?.length ?? 0) >= (lines[0]!.match(/,/g)?.length ?? 0) ? ";" : ",";

  // aceita header (ncm;descricao;aliquota) ou direto dados (última coluna = alíquota)
  const hasHeader = header.includes("ncm");
  const aliquotaIdx = hasHeader
    ? header.split(sep).findIndex((c) => c.includes("aliquota") || c.includes("alíquota"))
    : -1; // sem header: última coluna
  const rows: TipiRow[] = [];
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const cols = line.split(sep);
    const ncm = (cols[0] ?? "").replace(/\D/g, "");
    const rawRate = (cols[aliquotaIdx === -1 ? cols.length - 1 : aliquotaIdx] ?? "").replace(/"/g, "").trim();
    if (ncm.length !== 8 || rawRate === "") continue;
    const aliquota = Number(rawRate.replace(",", "."));
    if (Number.isNaN(aliquota) || aliquota < 0 || aliquota > 100) continue;
    rows.push({ ncm, aliquota });
  }
  return rows;
}

/**
 * Agrupa NCMs por alíquota com compressão SEGURA por capítulo: se todos os
 * NCMs de um capítulo (2 dígitos) têm a mesma alíquota, o capítulo vira uma
 * regra `ncmStartsWith`. NCMs de capítulos misturados viram listas `ncmIn`
 * em blocos de 500 — correto por construção, ~dezenas de regras no total.
 */
export function buildTipiRules(
  rows: readonly TipiRow[],
  validFrom = "2026-01-01",
): readonly TaxRule[] {
  const rules: TaxRule[] = [];
  const chapterRates = new Map<string, Set<number>>();
  for (const { ncm, aliquota } of rows) {
    const bp = Math.round(aliquota * 100);
    const ch = ncm.slice(0, 2);
    const set = chapterRates.get(ch) ?? new Set<number>();
    set.add(bp);
    chapterRates.set(ch, set);
  }

  const byRate = new Map<number, string[]>();
  for (const [ch, rates] of chapterRates) {
    if (rates.size === 1) {
      // capítulo puro: uma regra ncmStartsWith cobre o capítulo inteiro
      const bp = [...rates][0]!;
      push(byRate, bp, `PREFIX:${ch}`);
    } else {
      for (const { ncm, aliquota } of rows) {
        if (ncm.slice(0, 2) !== ch) continue;
        push(byRate, Math.round(aliquota * 100), ncm);
      }
    }
  }

  for (const [rateBp, entries] of byRate) {
    const prefixes = entries.filter((e) => e.startsWith("PREFIX:")).map((e) => e.slice(7));
    const ncms = entries.filter((e) => !e.startsWith("PREFIX:"));
    for (const ch of prefixes) {
      rules.push(tipiRule(`IPI-TIPI-CH${ch}-${rateBp}`, rateBp,
        { kind: "predicate", predicate: "ncmStartsWith", args: { prefix: ch } }, validFrom));
    }
    for (let i = 0; i < ncms.length; i += 500) {
      const list = [...ncms.slice(i, i + 500)];
      rules.push(tipiRule(`IPI-TIPI-BLK${ch0(list[0]!)}-${rateBp}-${i / 500}`, rateBp,
        { kind: "predicate", predicate: "ncmIn", args: { list } }, validFrom));
    }
  }
  return rules;
}

function ch0(ncm: string): string {
  return ncm.slice(0, 2);
}

function push(map: Map<number, string[]>, bp: number, entry: string): void {
  const list = map.get(bp) ?? [];
  list.push(entry);
  map.set(bp, list);
}

function tipiRule(id: string, rateBp: number, condition: SpecJson, validFrom: string): TaxRule {
  return {
    id,
    version: 1,
    tribute: "IPI",
    name: `TIPI ${rateBp / 100}% (${id})`,
    jurisdiction: { scope: "FEDERAL" },
    condition,
    effects: [{ type: "applyRate", rateBp }],
    priority: 1, // acima das regras gerais do módulo IPI
    validity: DateRange.from(new Date(`${validFrom}T00:00:00Z`)),
    status: "ACTIVE",
    origin: "IMPORTED",
    legalBasis: { documentType: "DECRETO", number: "TIPI", year: "vigente", provision: "tabela RFB" },
    reviewReason: "importado da TIPI oficial (RFB) — conferir versão da tabela na importação",
  };
}

/** Importa para tax_rules (idempotente por id+versão). */
export async function importTipi(
  databaseUrl: string,
  rows: readonly TipiRow[],
  validFrom?: string,
): Promise<number> {
  const rules = buildTipiRules(rows, validFrom);
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
