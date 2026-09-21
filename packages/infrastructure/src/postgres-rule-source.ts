import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, sql } from "drizzle-orm";
import { taxRules } from "./schema.js";
import type { FiscalContext, TaxRule, Jurisdiction, RuleEffect, RuleStatus, SpecJson, LegalBasisRef, TributeId } from "@tributax/domain";
import { DateRange, icmsRuleCatalog, pisCofinsRuleCatalog, issRetentionRuleCatalog, ipiRuleCatalog, ibsCbsRuleCatalog, issRuleCatalog } from "@tributax/domain";

/**
 * Adapter Postgres do port RuleSource (aplicação) — lê o catálogo vigente:
 * status ACTIVE e vigência (daterange) contendo asOfDate (ADR-003).
 * Implementa a interface RuleSource porduck typing (structural typing).
 */
export class PostgresRuleSource {
  protected readonly db;

  constructor(databaseUrl: string) {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    this.db = drizzle(pool);
  }

  async loadRules(ctx: FiscalContext): Promise<readonly TaxRule[]> {
    const rows = await this.db
      .select()
      .from(taxRules)
      .where(and(eq(taxRules.status, "ACTIVE"), sql`${taxRules.validity} @> ${ctx.asOfDate.toISOString().slice(0, 10)}::date`));

    return rows.map((r) => ({
      id: r.id,
      version: Number(r.version),
      tribute: r.tribute as TributeId,
      name: r.name,
      jurisdiction: { scope: r.jurisdictionScope, ...(r.jurisdictionCode ? { code: r.jurisdictionCode } : {}) } as Jurisdiction,
      condition: r.condition as SpecJson,
      effects: r.effects as readonly RuleEffect[],
      priority: Number(r.priority),
      validity: DateRange.from(new Date(r.validity.from), r.validity.to ? new Date(r.validity.to) : undefined),
      status: r.status as RuleStatus,
      ...(r.legalBasis ? { legalBasis: r.legalBasis as LegalBasisRef } : {}),
      origin: r.origin as TaxRule["origin"],
      ...(r.reviewReason ? { reviewReason: r.reviewReason } : {}),
    }));
  }
}

/**
 * Insere o catálogo-padrão gerado pelo domínio (idempotente por id+versão).
 * HONESTO (auditoria 2.9): reporta quantas linhas o banco ACEITOU de fato;
 * se alguma regra do catálogo não estiver persistida após o seed, lança —
 * o caminho "de produção" nunca calcula com menos regras que a memória
 * sem ninguém saber.
 */
export async function seedRuleCatalog(
  databaseUrl: string,
  opts: { failOnDivergence?: boolean } = {},
): Promise<number> {
  const { icmsRuleCatalog } = await import("@tributax/domain");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);
  const catalog = [...icmsRuleCatalog(), ...pisCofinsRuleCatalog(), ...issRetentionRuleCatalog(), ...ipiRuleCatalog(), ...ibsCbsRuleCatalog(), ...issRuleCatalog()];

  const inserted = await db
    .insert(taxRules)
    .values(
      catalog.map((r) => ({
        id: r.id,
        version: String(r.version),
        tribute: r.tribute,
        name: r.name,
        jurisdictionScope: r.jurisdiction.scope,
        ...(r.jurisdiction.code ? { jurisdictionCode: r.jurisdiction.code } : {}),
        condition: r.condition,
        effects: r.effects,
        priority: String(r.priority),
        validity: { from: isoDate(r.validity.from), to: r.validity.to ? isoDate(r.validity.to) : null },
        status: r.status,
        ...(r.legalBasis ? { legalBasis: r.legalBasis } : {}),
        origin: r.origin,
        ...(r.reviewReason ? { reviewReason: r.reviewReason } : {}),
      })),
    )
    .onConflictDoNothing()
    .returning({ id: taxRules.id });

  // verificação pós-seed: tudo do catálogo está no banco?
  const rows = await db.select({ id: taxRules.id, version: taxRules.version }).from(taxRules);
  const persisted = new Set(rows.map((r) => `${r.id}@${r.version}`));
  const missing = catalog.filter((r) => !persisted.has(`${r.id}@${r.version}`));
  await pool.end();

  if (missing.length > 0) {
    const detail = missing.map((r) => `${r.id}@${r.version} (${r.tribute})`).join(", ");
    const msg = `seed divergente: ${missing.length}/${catalog.length} regras do catálogo NÃO estão no banco — ${detail}`;
    if (opts.failOnDivergence !== false) throw new Error(msg);
    console.warn(`[seed] ${msg}`);
  }
  return inserted.length;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
