import { CanActivate, ExecutionContext, HttpException, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

/**
 * ApiKeyGuard (ADR-009 multi-tenancy, primeiro degrau): com TRIBUTAX_API_KEYS
 * configurada (lista separada por vírgula), toda rota exige `x-api-key: <k>`
 * ou `authorization: Bearer <k>`. Sem a env, o guard abre (modo dev) —
 * segurança em produção é configurar a env, não remover o guard.
 *
 * Rotas públicas (docs/health) marcadas com @Public().
 */

export const IS_PUBLIC = "tributax:public";

export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly keys: readonly string[];

  constructor(private readonly reflector: Reflector) {
    this.keys = (process.env.TRIBUTAX_API_KEYS ?? "")
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k !== "");
  }

  canActivate(ctx: ExecutionContext): boolean {
    if (this.keys.length === 0) return true; // dev: sem env, aberto

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const presented =
      req.headers["x-api-key"] ??
      (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (!presented || !this.keys.includes(presented)) {
      throw new HttpException(
        { error: "UNAUTHORIZED", message: "API key ausente ou inválida (x-api-key ou Bearer)" },
        401,
      );
    }
    return true;
  }
}
