import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { parties } from "./schema.js";
import { randomUUID } from "node:crypto";

/** Adapter Postgres do port PartyStore (aplicação) — tabela parties (§13). */
export class PostgresPartyStore {
  private readonly db;

  constructor(databaseUrl: string) {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    this.db = drizzle(pool);
  }

  async save(party: {
    id?: string;
    taxId: string;
    legalName: string;
    type: string;
    establishments: readonly unknown[];
  }): Promise<{ id: string; taxId: string; legalName: string; type: string; establishments: readonly unknown[] }> {
    const id = party.id ?? randomUUID();
    const profile = { type: party.type, establishments: party.establishments };
    await this.db.insert(parties).values({
      id,
      taxId: party.taxId,
      legalName: party.legalName,
      profile,
    });
    return { id, ...party, establishments: party.establishments };
  }

  async findByIdOrTaxId(ref: string): Promise<
    | {
        id: string;
        taxId: string;
        legalName: string;
        type: string;
        establishments: readonly unknown[];
      }
    | undefined
  > {
    const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
    const rows = await this.db
      .select()
      .from(parties)
      .where(uuidLike ? eq(parties.id, ref) : eq(parties.taxId, ref))
      .limit(1);
    const row = rows[0];
    if (!row) return undefined;
    const profile = row.profile as { type: string; establishments: unknown[] };
    return {
      id: row.id,
      taxId: row.taxId,
      legalName: row.legalName,
      type: profile.type,
      establishments: profile.establishments,
    };
  }
}
