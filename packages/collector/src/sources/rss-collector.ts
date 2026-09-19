import type { LegalNormDocument, NormCollector } from "./types.js";
import { sha256 } from "../store/norm-store.js";

/**
 * RssCollector — adapter genérico RSS 2.0/Atom para diários oficiais e
 * SEFAZs. Parser mínimo por regex: feeds públicos são simples e o coletor
 * falha explícito se a fonte mudar de formato (melhor que silêncio).
 */
export class RssCollector implements NormCollector {
  readonly name: string;

  private readonly feedUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(name: string, feedUrl: string, fetchImpl: typeof fetch = fetch) {
    this.name = name;
    this.feedUrl = feedUrl;
    this.fetchImpl = fetchImpl;
  }

  async collect(keywords: readonly string[], sinceDays: number): Promise<readonly LegalNormDocument[]> {
    const res = await this.fetchImpl(this.feedUrl, { headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" } });
    if (!res.ok) throw new Error(`${this.name}: feed HTTP ${res.status}`);
    const xml = await res.text();
    const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;

    const norms: LegalNormDocument[] = [];
    for (const item of parseItems(xml)) {
      const publishedAt = item.published ?? new Date().toISOString();
      if (Date.parse(publishedAt) < cutoff) continue;
      const haystack = `${item.title}\n${item.summary}`.toLowerCase();
      if (!keywords.some((k) => haystack.includes(k.toLowerCase()))) continue;
      const url = item.link ?? this.feedUrl;
      norms.push({
        id: sha256(`${this.name}|${url}|${item.title}`),
        url,
        publishedAt,
        title: item.title,
        text: `${item.title}\n\n${item.summary}`,
        source: this.name,
      });
    }
    return norms;
  }
}

interface FeedItem {
  readonly title: string;
  readonly link?: string;
  readonly summary: string;
  readonly published?: string; // ISO
}

function parseItems(xml: string): readonly FeedItem[] {
  // RSS <item>...</item> ou Atom <entry>...</entry>
  const blocks = [
    ...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi),
    ...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi),
  ].map((m) => m[1] ?? "");

  return blocks.flatMap((body) => {
    const title = decodeXml(tag(body, "title") ?? "(sem título)");
    const link =
      tag(body, "link") ??
      // Atom: <link href="..."/> pode vir sem texto
      attrOf(body, "link", "href") ??
      undefined;
    const summary = decodeXml(tag(body, "description") ?? tag(body, "summary") ?? tag(body, "content") ?? "");
    const published =
      tag(body, "pubDate") !== undefined
        ? tryIso(tag(body, "pubDate"))
        : tryIso(tag(body, "updated") ?? tag(body, "published"));
    if (!title && !summary) return [];
    return [{
      title,
      ...(link !== undefined ? { link } : {}),
      summary,
      ...(published !== undefined ? { published } : {}),
    }];
  });
}

function tag(body: string, name: string): string | undefined {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i").exec(body);
  return m?.[1]?.trim();
}

function attrOf(body: string, name: string, attr: string): string | undefined {
  const m = new RegExp(`<${name}\\s[^>]*${attr}="([^"]+)"`, "i").exec(body);
  return m?.[1];
}

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function tryIso(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}
