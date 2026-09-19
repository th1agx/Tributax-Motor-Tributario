import { CanActivate, ExecutionContext, HttpException, Injectable } from "@nestjs/common";
import type { RequestWithTenant } from "./tenant-store.js";

/**
 * RateLimitGuard: token bucket por cliente (tenant quando autenticado,
 * IP caso contrário), sem dependências externas. Quota vem do tenant
 * (rpmQuota > 0) ou do RATE_LIMIT_RPM global. In-memory atende uma
 * instância; multi-instância pede Redis — evolução prevista.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, { tokens: number; last: number }>();

  private readonly defaultPerMinute: number;
  private readonly capacity: number;

  constructor() {
    this.defaultPerMinute = Number(process.env.RATE_LIMIT_RPM ?? 240);
    this.capacity = Number(process.env.RATE_LIMIT_BURST ?? 60);
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<RequestWithTenant>();
    const tenant = req.tributaxTenant;
    const perMinute = tenant && tenant.rpmQuota > 0 ? tenant.rpmQuota : this.defaultPerMinute;

    const key =
      tenant?.id ??
      req.headers["x-api-key"] ??
      ((req.headers.authorization ?? "").replace(/^Bearer\s+/i, "") ||
        req.ip ||
        req.socket?.remoteAddress ||
        "anon");

    const now = Date.now();
    const bucket = this.buckets.get(String(key)) ?? { tokens: this.capacity, last: now };
    const refill = ((now - bucket.last) / 60_000) * perMinute;
    const tokens = Math.min(this.capacity, bucket.tokens + refill);

    if (tokens < 1) {
      this.buckets.set(String(key), { tokens, last: now });
      throw new HttpException(
        { error: "RATE_LIMITED", message: `limite de ${perMinute} req/min excedido` },
        429,
      );
    }
    this.buckets.set(String(key), { tokens: tokens - 1, last: now });
    return true;
  }
}
