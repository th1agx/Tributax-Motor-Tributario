import pg from "pg";
import { createHash } from "node:crypto";

/**
 * Adapter Postgres do port TenantStore (ADR-009): resolve API key → tenant.
 * A key nunca é persistida — só o sha256. Duck typing como os demais adapters.
 */
export interface TenantRow {
  readonly id: string;
  readonly name: string;
  readonly rpmQuota: number;
}

export class PostgresTenantStore {
  private readonly pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new pg.Pool({ connectionString: databaseUrl });
  }

  async findByApiKey(apiKey: string): Promise<TenantRow | undefined> {
    const hash = sha256hex(apiKey);
    const res = await this.pool.query(
      "SELECT id, name, rpm_quota FROM tenants WHERE key_hash = $1 AND active",
      [hash],
    );
    const row = res.rows[0] as { id: string; name: string; rpm_quota: number } | undefined;
    return row ? { id: row.id, name: row.name, rpmQuota: Number(row.rpm_quota) } : undefined;
  }

  async create(name: string, apiKey: string, rpmQuota = 0): Promise<TenantRow> {
    const hash = sha256hex(apiKey);
    const res = await this.pool.query(
      `INSERT INTO tenants (name, key_hash, rpm_quota) VALUES ($1, $2, $3)
       ON CONFLICT (key_hash) DO UPDATE SET name = EXCLUDED.name, rpm_quota = EXCLUDED.rpm_quota
       RETURNING id, name, rpm_quota`,
      [name, hash, rpmQuota],
    );
    const row = res.rows[0] as { id: string; name: string; rpm_quota: number };
    return { id: row.id, name: row.name, rpmQuota: Number(row.rpm_quota) };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  /** Administração (API /v1/tenants): nunca retorna keys, só metadados. */
  async list(): Promise<(TenantRow & { active: boolean })[]> {
    const res = await this.pool.query(
      "SELECT id, name, rpm_quota, active FROM tenants ORDER BY created_at DESC",
    );
    return res.rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      name: r.name as string,
      rpmQuota: Number(r.rpm_quota),
      active: Boolean(r.active),
    }));
  }

  async setQuota(id: string, rpmQuota: number): Promise<void> {
    await this.pool.query("UPDATE tenants SET rpm_quota = $2 WHERE id = $1", [id, rpmQuota]);
  }

  async setActive(id: string, active: boolean): Promise<void> {
    await this.pool.query("UPDATE tenants SET active = $2 WHERE id = $1", [id, active]);
  }
}

function sha256hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
