import { Controller, Get, Header, Headers, NotFoundException, Req } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Public } from "../auth/api-key.guard.js";

/**
 * Documentação viva + padrão llms.txt (llmstxt.org), como a NFe.io:
 * - /openapi.yaml — especificação OpenAPI 3.1 (fonte de verdade do contrato)
 * - /docs — Swagger UI (ou Markdown via Accept: text/markdown)
 * - /docs/index.md — visão geral em Markdown puro (append /index.md)
 * - /docs/llms.txt — manifesto desta documentação (índice)
 * - /llms.txt — índice raiz; /llms-full.txt — tudo concatenado
 * - /docs/contracts/payload-spec.md, /docs/adr/ADR-*.md — páginas reais
 * Tudo @Public: documentação nunca exige API key.
 */

const DOCS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../docs");

@Controller("/")
@Public()
export class DocsController {
  @Get("openapi.yaml")
  openapi(): Promise<string> {
    return readFile(path.join(DOCS_DIR, "openapi.yaml"), "utf-8");
  }

  /** Swagger UI; Accept: text/markdown devolve a visão geral em MD. */
  @Get("docs")
  async docs(@Headers("accept") accept: string | undefined): Promise<string> {
    if (accept?.includes("text/markdown")) {
      return this.markdownPage("llms-overview.md");
    }
    const { SWAGGER_HTML } = await import("./swagger.js");
    return SWAGGER_HTML;
  }

  /** Convenção append /index.md: a capa em Markdown puro. */
  @Get("docs/index.md")
  @Header("content-type", "text/markdown; charset=utf-8")
  overview(): Promise<string> {
    return this.markdownPage("llms-overview.md");
  }

  @Get("llms.txt")
  @Header("content-type", "text/plain; charset=utf-8")
  llmsIndex(): Promise<string> {
    return buildLlmsTxt();
  }

  @Get("docs/llms.txt")
  @Header("content-type", "text/plain; charset=utf-8")
  docsLlmsIndex(): Promise<string> {
    return buildLlmsTxt();
  }

  @Get("llms-full.txt")
  @Header("content-type", "text/plain; charset=utf-8")
  async llmsFull(): Promise<string> {
    const files = await listDocs();
    const parts: string[] = [];
    for (const f of files) {
      const content = await readFile(path.join(DOCS_DIR, f), "utf-8");
      parts.push(`# ${f}\n\n${content}`);
    }
    return parts.join("\n\n---\n\n");
  }

  /** Qualquer página de docs em Markdown: /docs/adr/ADR-001-linguagem.md etc. */
  @Get("docs/*docPath")
  @Header("content-type", "text/markdown; charset=utf-8")
  async docPage(@Req() req: { params: { docPath?: string } }): Promise<string> {
    return this.markdownPage(req.params.docPath);
  }

  private async markdownPage(rel: string | undefined): Promise<string> {
    if (!rel) throw new NotFoundException({ error: "NOT_FOUND", message: "página ausente" });
    const safe = path.normalize(rel).replace(/^([.][.][/\\])+/, "");
    const target = path.join(DOCS_DIR, safe);
    if (!target.startsWith(DOCS_DIR) || !target.endsWith(".md")) {
      throw new NotFoundException({ error: "NOT_FOUND", message: "só há páginas .md" });
    }
    try {
      return await readFile(target, "utf-8");
    } catch {
      throw new NotFoundException({ error: "NOT_FOUND", message: `página não encontrada: ${rel}` });
    }
  }
}

/** Índice de todas as páginas .md de docs/ (recursivo, separador normalizado). */
async function listDocs(): Promise<readonly string[]> {
  const { readdir } = await import("node:fs/promises");
  const out: string[] = [];
  async function walk(dir: string, prefix: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), rel);
      else if (entry.name.endsWith(".md")) out.push(rel);
    }
  }
  await walk(DOCS_DIR, "");
  return out.sort();
}

/** Frontmatter → título/descrição para o manifesto (fallback: nome do arquivo). */
function frontmatterOf(content: string, file: string): { title: string; description: string } {
  const m = /^---\n([\s\S]*?)\n---/.exec(content);
  const fm = m?.[1] ?? "";
  const title = /^title:\s*"?(.+?)"?$/m.exec(fm)?.[1] ?? file;
  const description = /^description:\s*"?(.+?)"?$/m.exec(fm)?.[1] ?? "";
  return { title, description };
}

async function buildLlmsTxt(): Promise<string> {
  const files = await listDocs();
  const lines = [
    "# Tributax",
    "",
    "> Motor de decisão tributária brasileiro: explicável, versionado, auditável.",
    "",
    "## Páginas",
    "",
  ];
  for (const f of files) {
    const content = await readFile(path.join(DOCS_DIR, f), "utf-8");
    const { title, description } = frontmatterOf(content, f);
    lines.push(`- [${title}](/docs/${f})${description ? `: ${description}` : ""}`);
  }
  lines.push("", "## OpenAPI", "", "- [Especificação OpenAPI 3.1](/openapi.yaml): contrato completo das APIs REST", "");
  return lines.join("\n");
}
