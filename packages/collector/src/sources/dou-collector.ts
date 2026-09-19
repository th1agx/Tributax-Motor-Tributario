import type { LegalNormDocument, NormCollector } from "./types.js";

/**
 * DouCollector — adapter para a API pública de matérias do DOU
 * (https://www.in.gov.br). O endpoint é configurável para testes e para
 * absorver mudanças da fonte sem tocar no pipeline (ADR-013).
 */
export class DouCollector implements NormCollector {
  readonly name = "DOU";

  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(baseUrl = "https://www.in.gov.br/api/materias", fetchImpl: typeof fetch = fetch) {
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
  }

  async collect(keywords: readonly string[], sinceDays: number): Promise<readonly LegalNormDocument[]> {
    const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
    const collected: LegalNormDocument[] = [];
    const editions = [...lastWeekEditions()].slice(-sinceDays);

    for (const date of editions) {
      const matters = await this.fetchMatters(date);
      for (const matter of matters) {
        if (Date.parse(matter.publicadoAt ?? `${date}T00:00:00.000Z`) < cutoff) continue;
        const title = matter.titulo ?? "";
        const text = matter.ementa ?? matter.conteudo ?? "";
        const haystack = `${title}\n${text}`.toLowerCase();
        if (!keywords.some((k) => haystack.includes(k.toLowerCase()))) continue;
        const url = matter.url ?? `${this.baseUrl}?data=${date}&id=${matter.id ?? ""}`;
        collected.push({
          id: `DOU|${matter.id ?? url}`,
          url,
          publishedAt: matter.publicadoAt ?? `${date}T12:00:00.000Z`,
          title,
          text: `${title}\n\n${text}`,
          source: "DOU",
        });
      }
    }
    return collected;
  }

  private async fetchMatters(date: string): Promise<readonly DouMatter[]> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}?dataPublicacao=${date}`, { headers: { accept: "application/json" } });
    } catch (err) {
      throw new Error(`DOU: falha ao consultar ${date} — ${(err as Error).message}`);
    }
    if (!res.ok) throw new Error(`DOU: HTTP ${res.status} em ${date}`);
    const body: unknown = await res.json();
    // formato observado: { materias: [...] } ou lista direta; toleramos ambos
    const list = Array.isArray(body)
      ? body
      : Array.isArray((body as { materias?: unknown }).materias)
        ? ((body as { materias: unknown[] }).materias)
        : [];
    return list.filter((m): m is DouMatter => typeof m === "object" && m !== null);
  }
}

interface DouMatter {
  readonly id?: string | number;
  readonly titulo?: string;
  readonly ementa?: string;
  readonly conteudo?: string;
  readonly url?: string;
  readonly publicadoAt?: string;
}

/** Edições DD-MM-AAAA dos últimos 7 dias (formato de data da API do DOU). */
function lastWeekEditions(): readonly string[] {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    out.push(`${dd}-${mm}-${d.getUTCFullYear()}`);
  }
  return out;
}
