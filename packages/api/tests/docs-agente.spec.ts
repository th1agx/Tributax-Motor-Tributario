import { describe, expect, it } from "vitest";
import { DocsController } from "../src/docs/docs.controller.js";

/**
 * Padrão llms.txt (llmstxt.org): documentação consumível por agentes —
 * Markdown por página, manifesto índice, concatenado completo e negociação
 * por Accept: text/markdown. Tudo público (sem API key).
 */
describe("DocsController — documentação para agentes", () => {
  const c = new DocsController();

  it("/docs/index.md devolve a visão geral em Markdown", async () => {
    const md = await c.overview();
    expect(md).toContain("# Tributax");
    expect(md).toContain("/v1/tax-simulations");
    expect(md).toContain("basis points");
  });

  it("Accept: text/markdown em /docs devolve Markdown (não o Swagger)", async () => {
    const md = await c.docs("text/markdown");
    expect(md).toContain("# Tributax");
    const html = await c.docs("text/html");
    expect(html).toContain("swagger-ui");
  });

  it("/llms.txt lista as páginas com título do frontmatter", async () => {
    const txt = await c.llmsIndex();
    expect(txt).toContain("# Tributax");
    expect(txt).toContain("(/docs/contracts/payload-spec.md)");
    expect(txt).toContain("(/docs/adr/ADR-012-monitoracao-legislativa-por-ia.md)");
    expect(txt).toContain("[Especificação OpenAPI 3.1](/openapi.yaml)");
  });

  it("/llms-full.txt concatena todas as páginas .md", async () => {
    const full = await c.llmsFull();
    expect(full).toContain("# adr/ADR-001-linguagem.md");
    expect(full).toContain("# contracts/payload-spec.md");
    expect(full).toContain("---"); // separador entre páginas
  });

  it("páginas reais: ADR e payload-spec em Markdown puro", async () => {
    const adr = await c.docPage({ params: { docPath: "adr/ADR-013-coletor-rag.md" } });
    expect(adr).toContain("LegislationWatch");
    const spec = await c.docPage({ params: { docPath: "contracts/payload-spec.md" } });
    expect(spec.length).toBeGreaterThan(500);
  });

  it("path traversal e não-markdown são rejeitados (404, nunca arquivo fora de docs/)", async () => {
    await expect(c.docPage({ params: { docPath: "../package.json" } })).rejects.toThrow();
    await expect(c.docPage({ params: { docPath: "../../etc/passwd" } })).rejects.toThrow();
    await expect(c.docPage({ params: { docPath: "openapi.yaml" } })).rejects.toThrow(/só há páginas \.md/);
    await expect(c.docPage({ params: { docPath: "inexistente.md" } })).rejects.toThrow(/não encontrada/);
  });
});
