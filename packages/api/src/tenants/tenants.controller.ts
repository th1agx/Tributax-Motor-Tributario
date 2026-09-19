import { Body, Controller, Get, Inject, Module, Optional, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { BadRequestException, Injectable } from "@nestjs/common";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { AdminGuard } from "../auth/admin.guard.js";
import type { Tenant } from "../auth/tenant-store.js";

/**
 * /v1/tenants — administração de empresas clientes (ADR-009).
 * Guardada por TRIBUTAX_ADMIN_KEY (não pelas keys de tenant).
 * A API key é gerada no POST e exibida UMA vez; o store guarda só o hash.
 */

export interface TenantAdminStore {
  create(name: string, apiKey: string, rpmQuota: number): Promise<Tenant>;
  list(): Promise<readonly (Tenant & { active: boolean })[]>;
  setQuota(id: string, rpmQuota: number): Promise<void>;
  setActive(id: string, active: boolean): Promise<void>;
}

/** Store de administração em memória (dev) — também autentica as keys. */
@Injectable()
export class InMemoryTenantAdminStore implements TenantAdminStore {
  private readonly rows = new Map<string, { tenant: Tenant; keyHash: string; active: boolean }>();

  async create(name: string, apiKey: string, rpmQuota: number): Promise<Tenant> {
    const id = randomUUID();
    const tenant = { id, name, rpmQuota };
    this.rows.set(id, { tenant, keyHash: sha256(apiKey), active: true });
    return tenant;
  }

  async list(): Promise<readonly (Tenant & { active: boolean })[]> {
    return [...this.rows.values()].map((r) => ({ ...r.tenant, active: r.active }));
  }

  async setQuota(id: string, rpmQuota: number): Promise<void> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`tenant ${id} não encontrado`);
    row.tenant = { ...row.tenant, rpmQuota };
  }

  async setActive(id: string, active: boolean): Promise<void> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`tenant ${id} não encontrado`);
    row.active = active;
  }
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export const TENANT_ADMIN_STORE = "TENANT_ADMIN_STORE";

@Controller("/v1/tenants")
@UseGuards(AdminGuard)
export class TenantsController {
  private readonly store: TenantAdminStore;

  constructor(@Optional() @Inject(TENANT_ADMIN_STORE) store?: TenantAdminStore) {
    this.store = store ?? defaultTenantAdminStore;
  }

  /** Cria tenant e devolve a API key UMA vez (nunca mais recuperável). */
  @Post()
  async create(@Body() body: { name?: string; rpmQuota?: number }): Promise<{ tenant: Tenant; apiKey: string }> {
    if (!body?.name) {
      throw new BadRequestException({ error: "PAYLOAD_VALIDATION", message: "name é obrigatório" });
    }
    if (body.rpmQuota !== undefined && (body.rpmQuota < 0 || !Number.isInteger(body.rpmQuota))) {
      throw new BadRequestException({ error: "PAYLOAD_VALIDATION", message: "rpmQuota deve ser inteiro >= 0" });
    }
    const apiKey = randomBytes(24).toString("hex");
    const tenant = await this.store.create(body.name, apiKey, body.rpmQuota ?? 0);
    return { tenant, apiKey };
  }

  /** Lista tenants — metadados apenas, keys nunca saem. */
  @Get()
  async list(): Promise<readonly (Tenant & { active: boolean })[]> {
    return this.store.list();
  }

  @Patch(":id")
  async patch(@Param("id") id: string, @Body() body: { rpmQuota?: number; active?: boolean }): Promise<{ ok: true }> {
    if (body.rpmQuota === undefined && body.active === undefined) {
      throw new BadRequestException({ error: "PAYLOAD_VALIDATION", message: "informe rpmQuota e/ou active" });
    }
    try {
      if (body.rpmQuota !== undefined) await this.store.setQuota(id, body.rpmQuota);
      if (body.active !== undefined) await this.store.setActive(id, body.active);
    } catch (e) {
      throw new BadRequestException({ error: "NOT_FOUND", message: (e as Error).message });
    }
    return { ok: true };
  }
}

export const defaultTenantAdminStore = new InMemoryTenantAdminStore();

@Module({ controllers: [TenantsController] })
export class TenantsModule {}
