import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { ApiKeyGuard, Public } from "../src/auth/api-key.guard.js";
import { RateLimitGuard } from "../src/auth/rate-limit.guard.js";
import type { ExecutionContext } from "@nestjs/common";

function ctx(headers: Record<string, string>, handler?: () => void): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers, ip: "127.0.0.1" }) }),
    getHandler: () => handler ?? (() => {}),
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function reflectorWith(isPublic: boolean) {
  return { getAllAndOverride: () => (isPublic ? true : undefined) } as unknown as ConstructorParameters<typeof ApiKeyGuard>[0];
}

describe("ApiKeyGuard", () => {
  const ENV_KEY = process.env.TRIBUTAX_API_KEYS;

  afterEach(() => {
    if (ENV_KEY === undefined) delete process.env.TRIBUTAX_API_KEYS;
    else process.env.TRIBUTAX_API_KEYS = ENV_KEY;
  });

  it("sem TRIBUTAX_API_KEYS configurada, modo dev aberto", () => {
    delete process.env.TRIBUTAX_API_KEYS;
    const guard = new ApiKeyGuard(reflectorWith(false));
    expect(guard.canActivate(ctx({}))).toBe(true);
  });

  it("com keys configuradas, exige x-api-key válida", () => {
    process.env.TRIBUTAX_API_KEYS = "k-1, k-2";
    const guard = new ApiKeyGuard(reflectorWith(false));

    expect(guard.canActivate(ctx({ "x-api-key": "k-1" }))).toBe(true);
    expect(guard.canActivate(ctx({ authorization: "Bearer k-2" }))).toBe(true);
    expect(() => guard.canActivate(ctx({ "x-api-key": "errada" }))).toThrow(/UNAUTHORIZED|401|API key/);
    expect(() => guard.canActivate(ctx({}))).toThrow(/API key/);
  });

  it("rotas @Public() (docs/health) passam sem key", () => {
    process.env.TRIBUTAX_API_KEYS = "k-1";
    const guard = new ApiKeyGuard(reflectorWith(true));
    expect(guard.canActivate(ctx({}))).toBe(true);
  });
});

describe("RateLimitGuard (token bucket)", () => {
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
    const c = ctx({ "x-api-key": "cli-1" });
    expect(guard.canActivate(c)).toBe(true); // token 1
    expect(guard.canActivate(c)).toBe(true); // token 2 (burst)
    try {
      guard.canActivate(c);
      expect.unreachable("deveria ter estourado");
    } catch (e) {
      const err = e as { getStatus: () => number; getResponse: () => Record<string, string> };
      expect(err.getStatus()).toBe(429);
      expect(err.getResponse().error).toBe("RATE_LIMITED");
    }
  });

  it("clientes distintos têm buckets independentes", () => {
    const guard = new RateLimitGuard();
    const a = ctx({ "x-api-key": "a" });
    const b = ctx({ "x-api-key": "b" });
    guard.canActivate(a);
    guard.canActivate(a);
    expect(() => guard.canActivate(a)).toThrow();
    expect(guard.canActivate(b)).toBe(true); // b não foi afetado
  });

  it("recarrega com o tempo (refill)", () => {
    const guard = new RateLimitGuard();
    const c = ctx({ "x-api-key": "recarga" });
    guard.canActivate(c);
    guard.canActivate(c);
    expect(() => guard.canActivate(c)).toThrow();
    // avança o relógio do bucket manualmente: refill de 3/min => 20s = 1 token
    const bucket = (guard as unknown as { buckets: Map<string, { last: number }> }).buckets.get("recarga")!;
    bucket.last -= 21_000;
    expect(guard.canActivate(c)).toBe(true);
  });
});
