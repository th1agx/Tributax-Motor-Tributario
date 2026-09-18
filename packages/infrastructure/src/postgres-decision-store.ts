import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { taxDecisions } from "./schema.js";

/**
 * Adapter Postgres do port DecisionStore (aplicação) — ADR-002/007.
 * Decisões são append-only: este adapter só expõe save/findById.
 */
export interface StoredDecision {
  readonly decisionId: string;
  readonly correlationId: string;
  readonly engineVersion: string;
  readonly rulesetHash: string;
  readonly asOfDate: Date;
  readonly derivedTier: string;
  readonly response: unknown;
}

export class PostgresDecisionStore {
  private readonly db;

  constructor(databaseUrl: string) {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    this.db = drizzle(pool);
  }

  async save(d: StoredDecision): Promise<void> {
    await this.db.insert(taxDecisions).values({
      ...(isUuid(d.decisionId) ? { decisionId: d.decisionId } : {}),
      correlationId: d.correlationId,
      engineVersion: d.engineVersion,
      rulesetHash: d.rulesetHash,
      asOfDate: d.asOfDate,
      derivedTier: d.derivedTier,
      response: d.response,
    });
  }

  async findById(decisionId: string): Promise<StoredDecision | undefined> {
    const rows = await this.db
      .select()
      .from(taxDecisions)
      .where(eqDecisionId(decisionId))
      .limit(1);
    const row = rows[0];
    if (!row) return undefined;
    return {
      decisionId: row.decisionId,
      correlationId: row.correlationId,
      engineVersion: row.engineVersion,
      rulesetHash: row.rulesetHash,
      asOfDate: row.asOfDate,
      derivedTier: row.derivedTier,
      response: row.response,
    };
  }
}

// helpers locais (import de eq evitado para manter a superfície mínima)
import { eq } from "drizzle-orm";
function eqDecisionId(id: string) {
  if (!isUuid(id)) throw new Error(`decisionId não é UUID válido: ${id}`);
  return eq(taxDecisions.decisionId, id);
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
