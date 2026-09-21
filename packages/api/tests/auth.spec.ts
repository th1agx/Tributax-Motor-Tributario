import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { ApiKeyGuard } from "../src/auth/api-key.guard.js";
import { RateLimitGuard } from "../src/auth/rate-limit.guard.js";
import { EnvTenantStore, setTenantStore, type RequestWithTenant, type Tenant } from "../src/auth/tenant-store.js";
import type { ExecutionContext } from "@nestjs/common";

function ctx(req: RequestWithTenant, isPublic = false): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => (() => {}),
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function reflectorWith(isPublic: boolean) {
  return { getAllAndOverride: () => (isPublic ? true : undefined) } as unknown as ConstructorParameters<typeof ApiKeyGuard>[0];
}

function resetTenantStore() {
  setTenantStore(new EnvTenantStore());
}

describe("ApiKeyGuard + tenants (ADR-009)", () => {
  const ENV_KEY = process.env.TRIBUTAX_API_KEYS;
  beforeEach(resetTenantStore);
  afterEach(() => {
    if (ENV_KEY === undefined) delete process.env.TRIBUTAX_API_KEYS;
    else process.env.TRIBUTAX_API_KEYS = ENV_KEY;
    resetTenantStore();
  });

  it("sem TRIBUTAX_API_KEYS: FAIL-CLOSED (503) salvo opt-in explícito TRIBUTAX_DEV_OPEN_AUTH=1", async () => {
    delete process.env.TRIBUTAX_API_KEYS;
    const guard = new ApiKeyGuard(reflectorWith(false));
    const req: RequestWithTenant = { headers: {} };

    // sem opt-in: recusa — nunca abre por acidente (auditoria §4)
    await expect(guard.canActivate(ctx(req))).rejects.toMatchObject({ status: 503 });

    // com opt-in explícito: dev aberto documentado
    process.env.TRIBUTAX_DEV_OPEN_AUTH = "1";
    try {
      expect(await guard.canActivate(ctx(req))).toBe(true);
      expect(req.tributaxTenant).toBeUndefined();
    } finally {
      delete process.env.TRIBUTAX_DEV_OPEN_AUTH;
    }
  });

  it("com keys configuradas, exige x-api-key válida e anexa o tenant", async () => {
    process.env.TRIBUTAX_API_KEYS = "k-1, k-2";
    const guard = new ApiKeyGuard(reflectorWith(false));

    const ok: RequestWithTenant = { headers: { "x-api-key": "k-1" } };
    expect(await guard.canActivate(ctx(ok))).toBe(true);
    expect(ok.tributaxTenant?.id).toBe("env-key-1");

    const bearer: RequestWithTenant = { headers: { authorization: "Bearer k-2" } };
    expect(await guard.canActivate(ctx(bearer))).toBe(true);

    await expect(guard.canActivate(ctx({ headers: { "x-api-key": "errada" } }))).rejects.toThrow();
    await expect(guard.canActivate(ctx({ headers: {} }))).rejects.toThrow(/ausente/);
  });

  it("store custom (Postgres em prod): key inválida/inativa é 401", async () => {
    delete process.env.TRIBUTAX_API_KEYS;
    setTenantStore({
      async findByApiKey(k) {
        return k === "ativa" ? { id: "t1", name: "ACME", rpmQuota: 30 } : undefined;
      },
    });
    const guard = new ApiKeyGuard(reflectorWith(false));
    const req: RequestWithTenant = { headers: { "x-api-key": "ativa" } };
    expect(await guard.canActivate(ctx(req))).toBe(true);
    expect(req.tributaxTenant?.name).toBe("ACME");
    await expect(guard.canActivate(ctx({ headers: { "x-api-key": "revogada" } }))).rejects.toThrow(/inválida/);
  });

  it("rotas @Public() (docs/health) passam sem key", async () => {
    process.env.TRIBUTAX_API_KEYS = "k-1";
    const guard = new ApiKeyGuard(reflectorWith(true));
    expect(await guard.canActivate(ctx({ headers: {} }))).toBe(true);
  });
});

describe("RateLimitGuard (token bucket por tenant)", () => {
  const ENV_RPM = process.env.RATE_LIMIT_RPM;
  const ENV_BURST = process.env.RATE_LIMIT_BURST;
  beforeEach(() => {
    process.env.RATE_LIMIT_RPM = "3";
    process.env.RATE_LIMIT_BURST = "2";
  });
  afterEach(() => {
    for (const [k, v] of [["RATE_LIMIT_RPM", ENV_RPM], ["RATE_LIMIT_BURST", ENV_BURST]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("estoura o burst e devolve 429 com corpo estruturado", () => {
    const guard = new RateLimitGuard();
    const req: RequestWithTenant = { headers: { "x-api-key": "cli-1" } };
    expect(guard.canActivate(ctx(req))).toBe(true);
    expect(guard.canActivate(ctx(req))).toBe(true);
    try {
      guard.canActivate(ctx(req));
      expect.unreachable("deveria ter estourado");
    } catch (e) {
      const err = e as { getStatus: () => number; getResponse: () => Record<string, string> };
      expect(err.getStatus()).toBe(429);
      expect(err.getResponse().error).toBe("RATE_LIMITED");
    }
  });

  it("quota do tenant sobrepõe o limite global (rpmQuota=1, burst 2)", () => {
    const guard = new RateLimitGuard();
    const tenant: Tenant = { id: "t-quota", name: "Plano Básico", rpmQuota: 1 };
    const req: RequestWithTenant = { headers: {}, tributaxTenant: tenant };
    expect(guard.canActivate(ctx(req))).toBe(true); // token 1
    expect(guard.canActivate(ctx(req))).toBe(true); // token 2 (burst)
    expect(() => guard.canActivate(ctx(req))).toThrow(/limite de 1 req\/min/);
  });

  it("tenants distintos têm buckets independentes", () => {
    const guard = new RateLimitGuard();
    const a: RequestWithTenant = { headers: {}, tributaxTenant: { id: "a", name: "A", rpmQuota: 0 } };
    const b: RequestWithTenant = { headers: {}, tributaxTenant: { id: "b", name: "B", rpmQuota: 0 } };
    guard.canActivate(ctx(a));
    guard.canActivate(ctx(a));
    expect(() => guard.canActivate(ctx(a))).toThrow();
    expect(guard.canActivate(ctx(b))).toBe(true);
  });

  it("recarrega com o tempo (refill)", () => {
    const guard = new RateLimitGuard();
    const req: RequestWithTenant = { headers: { "x-api-key": "recarga" } };
    guard.canActivate(req ? ctx(req) : (req as never));
    guard.canActivate(ctx(req));
    expect(() => guard.canActivate(ctx(req))).toThrow();
    const bucket = (guard as unknown as { buckets: Map<string, { last: number }> }).buckets.get("recarga")!;
    bucket.last -= 21_000; // refill de 3/min => ~1 token em 20s
    expect(guard.canActivate(ctx(req))).toBe(true);
  });
});
