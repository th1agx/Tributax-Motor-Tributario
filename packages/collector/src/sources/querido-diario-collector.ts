import type { LegalNormDocument, NormCollector } from "./types.js";

/**
 * QueridoDiarioCollector — diários oficiais MUNICIPAIS via API pública do
 * Querido Diário (https://queridodiario.ok.org.br). Substitui na prática o
 * coletor DOU (endpoint JSON da Imprensa Nacional inacessível — 404 desde
 * 2026-09; documentado no README).
 *
 * Uso principal: monitorar legislação de ISS por município (a faixa 2–5% é
 * lei municipal). A API aceita `territory_id` (IBGE 7 dígitos) para focar
 * num município específico.
 *
 * GET /api/gazettes/?published_since=YYYY-MM-DD&published_until=YYYY-MM-DD
 *     &querystring=<termo>[&territory_id=<ibge>]
 * Resposta: { total_gazettes, gazettes: [{ territory_id, date, url,
 *   territory_name, state_code, excerpts: [...] }] }
 */

interface QdGazette {
  readonly territory_id?: string;
  readonly date?: string;
  readonly url?: string;
  readonly territory_name?: string;
  readonly state_code?: string;
  readonly excerpts?: readonly string[];
}

export class QueridoDiarioCollector implements NormCollector {
  readonly name = "querido-diario";

  constructor(
    private readonly baseUrl = "https://queridodiario.ok.org.br/api/gazettes/",
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly territoryId?: string,
    private readonly backoffMs = 2000,
  ) {}

  async collect(keywords: readonly string[], sinceDays: number): Promise<readonly LegalNormDocument[]> {
    const until = new Date();
    const since = new Date(until.getTime() - sinceDays * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
      published_since: iso(since),
      published_until: iso(until),
      // a API aceita UM termo; usamos o principal (o tributo) — os demais
      // filtros de keyword continuam aplicados localmente
      querystring: keywords[0] ?? "imposto",
      size: "50",
    });
    if (this.territoryId) params.set("territory_id", this.territoryId);

    // retry com backoff (validado na prática: a API do QD responde 503
    // intermitente a runners de CI; 3 tentativas com backoff exponencial)
    const url = `${this.baseUrl}?${params}`;
    let res: Response | undefined;
    let lastError = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        res = await this.fetchImpl(url, { headers: { accept: "application/json" } });
        if (res.ok) break;
        lastError = `HTTP ${res.status}`;
        if (res.status < 500 && res.status !== 429) break; // só retry em 5xx/429
      } catch (e) {
        lastError = (e as Error).message;
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * this.backoffMs));
    }
    if (!res || !res.ok) throw new Error(`Querido Diário: ${lastError} após ${3} tentativas`);

    const body = (await res.json()) as { gazettes?: readonly QdGazette[] };
    const collected: LegalNormDocument[] = [];
    for (const g of body.gazettes ?? []) {
      const text = (g.excerpts ?? []).join("\n\n");
      const title = `${g.territory_name ?? "?"}/${g.state_code ?? "?"} — diário de ${g.date ?? "?"}`;
      const haystack = `${title}\n${text}`.toLowerCase();
      if (!keywords.some((k) => haystack.includes(k.toLowerCase()))) continue;
      const url = g.url ?? this.baseUrl;
      collected.push({
        id: `QD|${g.territory_id ?? "?"}|${g.date ?? "?"}|${hash(url + text.slice(0, 64))}`,
        url,
        publishedAt: `${g.date ?? iso(since)}T12:00:00.000Z`,
        title,
        text: `${title}\n\n${text}`,
        source: this.name,
      });
    }
    return collected;
  }
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}
