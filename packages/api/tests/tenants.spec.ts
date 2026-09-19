import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { InMemoryTenantAdminStore } from "../src/tenants/tenants.controller.js";
import { AdminGuard } from "../src/auth/admin.guard.js";
import type { ExecutionContext } from "@nestjs/common";

function ctx(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    getHandler: () => (() => {}),
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe("AdminGuard (fail closed)", () => {
  const ENV = process.env.TRIBUTAX_ADMIN_KEY;
  afterEach(() => {
    if (ENV === undefined) delete process.env.TRIBUTAX_ADMIN_KEY;
    else process.env.TRIBUTAX_ADMIN_KEY = ENV;
  });

  it("sem TRIBUTAX_ADMIN_KEY a administração fica DESABILITADA (403, nunca aberta)", () => {
    delete process.env.TRIBUTAX_ADMIN_KEY;
    const err = (() => new AdminGuard().canActivate(ctx({}))) as () => never;
    try {
      err();
      expect.unreachable("deveria falhar");
    } catch (e) {
      expect((e as { getResponse: () => Record<string, string> }).getResponse().error).toBe("ADMIN_DISABLED");
      expect((e as { getStatus: () => number }).getStatus()).toBe(403);
    }
  });

  it("key correta passa; errada é 401", () => {
    process.env.TRIBUTAX_ADMIN_KEY = "admin-secret";
    const guard = new AdminGuard();
    expect(guard.canActivate(ctx({ "x-admin-key": "admin-secret" }))).toBe(true);
    expect(() => guard.canActivate(ctx({ "x-admin-key": "errada" }))).toThrow(/x-admin-key/);
  });
});

describe("InMemoryTenantAdminStore (port de administração)", () => {
  const ENV = process.env.TRIBUTAX_ADMIN_KEY;
  beforeEach(() => { process.env.TRIBUTAX_ADMIN_KEY = "test"; });
  afterEach(() => {
    if (ENV === undefined) delete process.env.TRIBUTAX_ADMIN_KEY;
    else process.env.TRIBUTAX_ADMIN_KEY = ENV;
  });

  it("cria tenant, lista metadados (sem key) e atualiza quota/ativo", async () => {
    const store = new InMemoryTenantAdminStore();
    const t1 = await store.create("ACME", "key-abc", 30);
    const t2 = await store.create("BETA", "key-xyz", 0);

    expect(t1.name).toBe("ACME");
    const list = await store.list();
    expect(list).toHaveLength(2);
    expect(JSON.stringify(list)).not.toContain("key-"); // keys jamais saem

    await store.setQuota(t1.id, 100);
    await store.setActive(t2.id, false);
    const updated = await store.list();
    expect(updated.find((t) => t.id === t1.id)?.rpmQuota).toBe(100);
    expect(updated.find((t) => t.id === t2.id)?.active).toBe(false);
  });

  it("id inexistente em setQuota é erro explícito", async () => {
    const store = new InMemoryTenantAdminStore();
    await expect(store.setQuota("uuid-fantasma", 10)).rejects.toThrow(/não encontrado/);
  });
});
