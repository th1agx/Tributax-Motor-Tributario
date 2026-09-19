/**
 * Port TenantStore (ADR-009): resolve API key → tenant (empresa cliente).
 * Adapters: EnvTenantStore (chaves estáticas via env, dev) e
 * PostgresTenantStore (@tributax/infrastructure, com quota por tenant).
 * main.ts instala o adapter concreto aqui — guards leem pelo getter.
 */

export interface Tenant {
  readonly id: string;
  readonly name: string;
  /** 0 = usar o limite global (RATE_LIMIT_RPM). */
  readonly rpmQuota: number;
}

export interface TenantStore {
  findByApiKey(apiKey: string): Promise<Tenant | undefined>;
}

/** Chaves estáticas da env TRIBUTAX_API_KEYS — um tenant por chave. Lê a env a cada consulta (testes mudam env). */
export class EnvTenantStore implements TenantStore {
  private keys(): readonly string[] {
    return (process.env.TRIBUTAX_API_KEYS ?? "")
      .split(",").map((k) => k.trim()).filter((k) => k !== "");
  }

  get configured(): boolean {
    return this.keys().length > 0;
  }

  async findByApiKey(apiKey: string): Promise<Tenant | undefined> {
    const idx = this.keys().indexOf(apiKey);
    return idx === -1
      ? undefined
      : { id: `env-key-${idx + 1}`, name: `env-key-${idx + 1}`, rpmQuota: 0 };
  }
}

// singleton de composição (main.ts é o único escritor)
let store: TenantStore = new EnvTenantStore();

export function setTenantStore(s: TenantStore): void {
  store = s;
}

export function getTenantStore(): TenantStore {
  return store;
}

export interface RequestWithTenant {
  headers: Record<string, string | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
  tributaxTenant?: Tenant;
}
