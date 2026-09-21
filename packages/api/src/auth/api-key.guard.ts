import { CanActivate, ExecutionContext, HttpException, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { EnvTenantStore, getTenantStore, type RequestWithTenant } from "./tenant-store.js";

/**
 * ApiKeyGuard (ADR-009 multi-tenant): resolve a API key via TenantStore
 * (Postgres em produção; TRIBUTAX_API_KEYS em dev) e anexa o tenant à
 * request para o rate limit por quota.
 *
 * FAIL-CLOSED (auditoria §4): sem keys configuradas o guard REJEITA com 503,
 * nunca abre. O modo aberto explícito de desenvolvimento exige
 * TRIBUTAX_DEV_OPEN_AUTH=1 — opt-in documentado, não estado implícito.
 * Rotas públicas (docs/health) marcadas com @Public().
 */

export const IS_PUBLIC = "tributax:public";

export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(reflector: Reflector) {
    this.reflector = reflector;
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const store = getTenantStore();
    const req = ctx.switchToHttp().getRequest<RequestWithTenant>();

    // Sem keys configuradas: fail-closed, salvo opt-in explícito de dev.
    if (store instanceof EnvTenantStore && !store.configured) {
      if (process.env.TRIBUTAX_DEV_OPEN_AUTH === "1") {
        return true; // dev explícito (documentado, nunca implícito)
      }
      throw new HttpException(
        {
          error: "AUTH_NOT_CONFIGURED",
          message:
            "nenhuma API key configurada (TRIBUTAX_API_KEYS ou tabela tenants) — recusando " +
            "fail-open; para desenvolvimento local use TRIBUTAX_DEV_OPEN_AUTH=1",
        },
        503,
      );
    }

    const presented =
      req.headers["x-api-key"] ??
      (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (!presented) {
      throw new HttpException(
        { error: "UNAUTHORIZED", message: "API key ausente (x-api-key ou Bearer)" },
        401,
      );
    }
    const tenant = await store.findByApiKey(presented);
    if (!tenant) {
      throw new HttpException(
        { error: "UNAUTHORIZED", message: "API key inválida ou inativa" },
        401,
      );
    }
    req.tributaxTenant = tenant; // RateLimitGuard usa a quota daqui
    return true;
  }
}
