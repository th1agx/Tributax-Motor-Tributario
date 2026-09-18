import { Controller, Get, Module } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Documentação viva: serve a especificação OpenAPI (docs/openapi.yaml,
 * fonte de verdade do contrato) e um Swagger UI em /docs.
 */
const DOCS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../docs/openapi.yaml",
);

const SWAGGER_HTML = `<!doctype html>
<html>
  <head>
    <title>Tributax API — Swagger UI</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"/>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({ url: "/openapi.yaml", dom_id: "#swagger-ui" });
    </script>
  </body>
</html>`;

@Controller("/")
export class DocsController {
  @Get("openapi.yaml")
  openapi(): Promise<string> {
    return readFile(DOCS_PATH, "utf-8");
  }

  @Get("docs")
  swaggerUi(): string {
    return SWAGGER_HTML;
  }
}

@Module({ controllers: [DocsController] })
export class DocsModule {}
