import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, sql } from "drizzle-orm";
import { taxRules } from "./schema.js";
import type { FiscalContext, TaxRule, Jurisdiction, RuleEffect, RuleStatus, SpecJson, LegalBasisRef, TributeId } from "@tributax/domain";
import { DateRange, icmsRuleCatalog, pisCofinsRuleCatalog, issRetentionRuleCatalog } from "@tributax/domain";

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

/** Insere o catálogo-padrão gerado pelo domínio (idempotente por id+versão). */
export async function seedRuleCatalog(databaseUrl: string): Promise<number> {
  const { icmsRuleCatalog } = await import("@tributax/domain");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);
  const catalog = [...icmsRuleCatalog(), ...pisCofinsRuleCatalog(), ...issRetentionRuleCatalog()];

  await db
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
    .onConflictDoNothing();

  await pool.end();
  return catalog.length;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
