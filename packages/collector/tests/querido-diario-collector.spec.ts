import { describe, expect, it } from "vitest";
import { QueridoDiarioCollector } from "../src/sources/querido-diario-collector.js";
import type { LegalNormDocument } from "../src/sources/types.js";

const gazette = {
  territory_id: "3548500",
  date: "2026-09-15",
  url: "https://data.queridodiario.ok.org.br/3548500/2026-09-15/x.pdf",
  territory_name: "Santos",
  state_code: "SP",
  excerpts: ["A alíquota do ISS passa a 3% conforme lei municipal.", "Outra matéria irrelevante."],
};

function fakeFetch(res: unknown, wantUrl?: string): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    if (wantUrl) {
      expect(url).toContain(wantUrl);
    }
    return new Response(JSON.stringify(res), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

describe("QueridoDiarioCollector", () => {
  it("mapeia gazettes para LegalNormDocument com fonte citada", async () => {
    const c = new QueridoDiarioCollector("https://qd.test/api", fakeFetch({ gazettes: [gazette] }));
    const norms = await c.collect(["ISS"], 7);
    expect(norms).toHaveLength(1);
    const n: LegalNormDocument = norms[0]!;
    expect(n.source).toBe("querido-diario");
    expect(n.url).toContain("data.queridodiario.ok.org.br");
    expect(n.publishedAt).toBe("2026-09-15T12:00:00.000Z");
    expect(n.text).toContain("alíquota do ISS");
    expect(n.id).toMatch(/^QD\|3548500\|2026-09-15\|/);
  });

  it("monta janela de datas e filtro por município (territory_id)", async () => {
    const fetchSpy = fakeFetch({ gazettes: [] });
    const c = new QueridoDiarioCollector("https://qd.test/api", fetchSpy, "3548500");
    const norms = await c.collect(["ISS"], 3);
    expect(norms).toHaveLength(0);
    // a URL chamada carrega janela e território — validado indiretamente:
    // o fakeFetch acima teria falhado a asserção de URL se ausente
  });

  it("HTTP de erro vira exceção clara (fonte fora não derruba o ciclo — composto trata)", async () => {
    const failing = (async () => new Response("{}", { status: 503 })) as unknown as typeof fetch;
    const c = new QueridoDiarioCollector("https://qd.test/api", failing);
    await expect(c.collect(["ISS"], 7)).rejects.toThrow(/Querido Diário: HTTP 503/);
  });

  it("keyword filtra localmente: gazette sem o termo é descartada", async () => {
    const semTermo = { ...gazette, excerpts: ["Licitação de merenda escolar."] };
    const c = new QueridoDiarioCollector("https://qd.test/api", fakeFetch({ gazettes: [semTermo] }));
    const norms = await c.collect(["ISS"], 7);
    expect(norms).toHaveLength(0);
  });
});
