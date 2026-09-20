import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from "@nestjs/common";
import type { Response } from "express";

/**
 * Página 404/erro da marca: navegadores (Accept: text/html) recebem uma página
 * editorial no estilo do site de documentação; clientes de API continuam
 * recebendo o JSON de sempre. Nada de "Cannot GET" cru para humanos.
 */
@Catch(HttpException)
export class BrandedExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<{ method: string; headers: Record<string, string | undefined> }>();
    const status = exception.getStatus();
    const body = exception.getResponse();
    const wantsHtml =
      (req.headers.accept ?? "").includes("text/html") &&
      req.method === "GET" &&
      !(req.headers["x-api-key"] || req.headers.authorization);

    if (!wantsHtml) {
      res.status(status).json(typeof body === "string" ? { statusCode: status, message: body } : body);
      return;
    }
    res.status(status).type("html").send(brandPage(status, messageOf(body)));
  }
}

function messageOf(body: string | object): string {
  if (typeof body === "string") return body;
  const b = body as { message?: string; error?: string };
  return b.message ?? b.error ?? "erro inesperado";
}

const H1: Record<number, [string, string]> = {
  404: ["Página não encontrada", "O endereço que você procurou não existe, ou deixou de existir."],
  401: ["Autenticação necessária", "Esta rota exige uma API key. Documentação pública? Comece pelas páginas abaixo."],
  403: ["Acesso negado", "Esta área é de administração e exige uma chave própria."],
  400: ["Requisição inválida", "O payload enviado não passou na validação de contrato."],
  429: ["Muitas requisições", "A quota do seu tenant foi excedida. Respire um minuto e tente de novo."],
};

function brandPage(status: number, message: string): string {
  const [title, sub] = H1[status] ?? ["Algo deu errado", message];
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${status} · Tributax</title>
<link rel="icon" type="image/svg+xml" href="/docs/site/favicon.svg"/>
<link rel="stylesheet" href="/docs/site/style.css"/>
<style>
  .errwrap { min-height: 78vh; display: flex; flex-direction: column; justify-content: center; max-width: 640px; margin: 0 auto; padding: 0 24px; }
  .errnum { font-family: var(--serif-display); font-size: 88px; font-weight: 480; line-height: 1; color: var(--ink); font-style: italic; }
  .errnum span { background: linear-gradient(transparent 55%, var(--mark) 55%); padding: 0 6px; }
  .errwrap h1 { font-family: var(--serif-display); font-size: 30px; font-weight: 520; margin: 18px 0 6px; }
  .errwrap p { color: var(--ink-soft); font-size: 18px; }
  .errlinks { margin-top: 26px; display: flex; gap: 22px; font-family: var(--sans); font-size: 13.5px; }
  .errlinks a { color: var(--ink); text-decoration: none; border-bottom: 1px solid var(--ink); padding-bottom: 2px; }
  .errlinks a:hover { border-bottom: 2px solid var(--mark); }
</style>
</head>
<body>
<main class="errwrap">
  <div class="errnum"><span>${status}</span></div>
  <h1>${title}</h1>
  <p>${sub}</p>
  <div class="errlinks">
    <a href="/docs">Documentação</a>
    <a href="/docs/#/simulador">Simulador</a>
    <a href="/llms.txt">llms.txt</a>
    <a href="/">Início</a>
  </div>
</main>
</body>
</html>`;
}
