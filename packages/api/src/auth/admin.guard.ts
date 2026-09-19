import { CanActivate, ExecutionContext, HttpException, Injectable } from "@nestjs/common";

/**
 * AdminGuard: protege rotas de administração (/v1/tenants) com uma key
 * própria (TRIBUTAX_ADMIN_KEY), distinta das keys de tenant — um cliente
 * jamais administra outros clientes. Sem a env configurada, a administração
 * fica DESABILITADA (fail closed), nunca aberta.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const adminKey = process.env.TRIBUTAX_ADMIN_KEY ?? "";
    if (adminKey === "") {
      throw new HttpException(
        { error: "ADMIN_DISABLED", message: "administração desabilitada — configure TRIBUTAX_ADMIN_KEY" },
        403,
      );
    }
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const presented = req.headers["x-admin-key"];
    if (presented !== adminKey) {
      throw new HttpException({ error: "UNAUTHORIZED", message: "x-admin-key inválida" }, 401);
    }
    return true;
  }
}
