import { CanActivate, ExecutionContext, HttpException, Injectable } from "@nestjs/common";

/**
 * RateLimitGuard: token bucket por cliente (API key ou IP), sem dependências
 * externas. Limite via RATE_LIMIT_RPM (default 240 req/min, burst 60).
 * In-memory é suficiente para uma instância; multi-instância pede Redis —
 * evolução prevista, não prematura.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, { tokens: number; last: number }>();

  private readonly perMinute: number;
  private readonly capacity: number;

  constructor() {
    this.perMinute = Number(process.env.RATE_LIMIT_RPM ?? 240);
    this.capacity = Number(process.env.RATE_LIMIT_BURST ?? 60);
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      ip?: string;
      socket?: { remoteAddress?: string };
    }>();
    const key =
      req.headers["x-api-key"] ??
      ((req.headers.authorization ?? "").replace(/^Bearer\s+/i, "") ||
        req.ip ||
        req.socket?.remoteAddress ||
        "anon");

    const now = Date.now();
    const bucket = this.buckets.get(String(key)) ?? { tokens: this.capacity, last: now };
    const refill = ((now - bucket.last) / 60_000) * this.perMinute;
    const tokens = Math.min(this.capacity, bucket.tokens + refill);

    if (tokens < 1) {
      const retryAfterSec = Math.ceil(((1 - tokens) * 60_000) / this.perMinute / 1000);
      this.buckets.set(String(key), { tokens, last: now });
      throw new HttpException(
        { error: "RATE_LIMITED", message: `limite de ${this.perMinute} req/min excedido` },
        429,
      );
    }
    this.buckets.set(String(key), { tokens: tokens - 1, last: now });
    return true;
  }
}
