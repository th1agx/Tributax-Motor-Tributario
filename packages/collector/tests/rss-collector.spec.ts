import { describe, expect, it } from "vitest";
import { RssCollector } from "../src/sources/rss-collector.js";

const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Diário Oficial</title>
<item>
  <title>Convênio ICMS 100/2026 altera alíquota interestadual</title>
  <link>https://diario.gov.br/mat/1</link>
  <description><![CDATA[A alíquota do ICMS passa a 12% a partir de outubro.]]></description>
  <pubDate>${new Date().toUTCString()}</pubDate>
</item>
<item>
  <title>Licenciamento de taxi dogs</title>
  <link>https://diario.gov.br/mat/2</link>
  <description>Edital de concorrência 07/2026.</description>
  <pubDate>${new Date().toUTCString()}</pubDate>
</item>
<item>
  <title>Convênio antigo de ICMS</title>
  <link>https://diario.gov.br/mat/3</link>
  <description>Alíquota de 2019.</description>
  <pubDate>${new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toUTCString()}</pubDate>
</item>
</channel></rss>`;

function fetchOk(xml: string): typeof fetch {
  return (async () => new Response(xml, { status: 200 })) as unknown as typeof fetch;
}

describe("RssCollector", () => {
  it("filtra por palavra-chave e por janela de dias", async () => {
    const collector = new RssCollector("Diário", "https://diario.gov.br/rss", fetchOk(feed));
    const norms = await collector.collect(["ICMS"], 7);
    expect(norms).toHaveLength(1);
    expect(norms[0]!.title).toContain("Convênio ICMS 100/2026");
    expect(norms[0]!.url).toBe("https://diario.gov.br/mat/1");
    expect(norms[0]!.text).toContain("12%");
  });

  it("falha explícito quando a fonte responde erro", async () => {
    const failing = (async () => new Response("gone", { status: 503 })) as unknown as typeof fetch;
    const collector = new RssCollector("Diário", "https://diario.gov.br/rss", failing);
    await expect(collector.collect(["ICMS"], 7)).rejects.toThrow(/HTTP 503/);
  });

  it("parseia Atom (entry + link href)", async () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom">
      <entry><title>Portaria ICMS 7/2026</title><link href="https://sefaz.gov.br/p7"/>
      <summary>Alíquota do ICMS ajustada.</summary><updated>${new Date().toISOString()}</updated></entry>
    </feed>`;
    const collector = new RssCollector("SEFAZ", "https://sefaz.gov.br/feed", fetchOk(atom));
    const norms = await collector.collect(["icms"], 7);
    expect(norms).toHaveLength(1);
    expect(norms[0]!.url).toBe("https://sefaz.gov.br/p7");
  });
});
