import type { TaxRule } from "@tributax/domain";
import { DateRange } from "@tributax/domain";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { taxRules } from "./schema.js";

/**
 * Importador da PLANILHA NACIONAL de alíquotas de ISSQN (Portal Nacional da
 * NFS-e, gov.br — publicação 03/09/2026):
 *   https://www.gov.br/nfse/pt-br/biblioteca/aliquotas/aliquotas-de-issqn
 *   → aliquotas-municipios-20260903-extr1.zip (CSV por UF + TXT consolidado)
 *
 * Formato (separador ";", cabeçalho):
 *   codigo_ibge;uf;nome_municipio;codigo_servico;incidencia;aliquota;dt_ini;dt_fim
 *
 * A alíquota é POR SERVIÇO dentro da banda 2–5% (LC 116/03 art. 8º-A).
 * Modelagem: uma regra por (município × alíquota) cobrindo a lista de
 * códigos de serviço daquele grupo — o item casa por `serviceCodeIn`.
 * Código não listado para o município → NO_RULE_FOUND honesto.
 *
 * Uso:
 *   npx tsx src/iss-import-nacional.cli.ts --txt aliquotas-municipios.txt [--db URL] [--dry-run]
 */

export interface IssNacionalRow {
  readonly ibge: string; // 7 dígitos
  readonly uf: string;
  readonly nome: string;
  readonly codigoServico: string; // ex.: 01.01.01.000
  readonly aliquota: number; // %
  readonly dtIni: string; // YYYY-MM-DD
}

export function parseIssNacional(txt: string): readonly IssNacionalRow[] {
  const lines = txt.split(/\r?\n/).filter((l) => l.trim() !== "");
  const rows: IssNacionalRow[] = [];
  const start = lines[0]?.toLowerCase().includes("codigo_ibge") ? 1 : 0;
  for (const line of lines.slice(start)) {
    const cols = line.split(";");
    const ibge = (cols[0] ?? "").replace(/\D/g, "");
    const codigoServico = (cols[3] ?? "").trim();
    const aliquota = Number((cols[5] ?? "").replace(",", "."));
    const dtIni = (cols[6] ?? "").slice(0, 10);
    if (ibge.length !== 7 || codigoServico === "" || Number.isNaN(aliquota)) continue;
    if (aliquota < 2 || aliquota > 5) continue; // banda da LC 116 art. 8º-A — fora, descarta
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dtIni)) continue;
    rows.push({ ibge, uf: (cols[1] ?? "").trim().toUpperCase(), nome: (cols[2] ?? "").trim(), codigoServico, aliquota, dtIni });
  }
  return rows;
}

/** Agrupa por (município × alíquota): { ibge, nome, rateBp, validFrom, codes[] }. */
export interface IssNacionalGroup {
  readonly ibge: string;
  readonly nome: string;
  readonly rateBp: number;
  readonly validFrom: string; // menor dt_ini do grupo
  readonly codes: readonly string[];
}

export function groupIssNacional(rows: readonly IssNacionalRow[]): readonly IssNacionalGroup[] {
  const map = new Map<string, { nome: string; rateBp: number; validFrom: string; codes: Set<string> }>();
  for (const r of rows) {
    const rateBp = Math.round(r.aliquota * 100);
    const key = `${r.ibge}|${rateBp}`;
    const g = map.get(key) ?? { nome: r.nome, rateBp, validFrom: r.dtIni, codes: new Set<string>() };
    if (r.dtIni < g.validFrom) g.validFrom = r.dtIni;
    g.codes.add(r.codigoServico);
    map.set(key, g);
  }
  return [...map.entries()].map(([key, g]) => ({
    ibge: key.split("|")[0]!,
    nome: g.nome,
    rateBp: g.rateBp,
    validFrom: g.validFrom,
    codes: [...g.codes].sort(),
  }));
}

export function buildIssNacionalRules(groups: readonly IssNacionalGroup[]): readonly TaxRule[] {
  return groups.map((g) => ({
    id: `ISS-NAC-${g.ibge}-${g.rateBp}`,
    version: 1,
    tribute: "ISS" as const,
    name: `ISS ${g.nome} ${g.rateBp / 100}% (${g.codes.length} serviços)`,
    jurisdiction: { scope: "MUNICIPAL" as const, code: g.ibge },
    condition: {
      kind: "and" as const,
      children: [
        { kind: "predicate" as const, predicate: "operationKindIs", args: { kind: "SERVICE_PROVISION" } },
        { kind: "predicate" as const, predicate: "issuerMunicipalityIs", args: { ibgeCode: g.ibge } },
        {
          kind: "or" as const,
          children: [
            { kind: "predicate" as const, predicate: "regimeIs", args: { regime: "NORMAL" } },
            { kind: "predicate" as const, predicate: "regimeIs", args: { regime: "LUCRO_REAL" } },
            { kind: "predicate" as const, predicate: "regimeIs", args: { regime: "LUCRO_PRESUMIDO" } },
          ],
        },
        { kind: "predicate" as const, predicate: "serviceCodeIn", args: { list: g.codes } },
      ],
    },
    effects: [{ type: "applyRate" as const, rateBp: g.rateBp }],
    priority: 1, // acima das regras gerais do módulo ISS
    validity: DateRange.from(new Date(`${g.validFrom}T00:00:00Z`)),
    status: "ACTIVE" as const,
    origin: "IMPORTED" as const,
    legalBasis: {
      documentType: "LEI_MUNICIPAL" as const,
      number: `lei de ${g.nome}`,
      year: "2026",
      provision: "Portal Nacional NFS-e — planilha oficial de alíquotas (03/09/2026)",
    },
    reviewReason: "planilha nacional NFS-e (gov.br) — conferir lei municipal vigente",
  }));
}

/** Importa para tax_rules em lotes (limite de parâmetros do Postgres). */
export async function importIssNacional(
  databaseUrl: string,
  groups: readonly IssNacionalGroup[],
  chunkSize = 400,
): Promise<number> {
  const rules = buildIssNacionalRules(groups);
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);
  let inserted = 0;
  for (let i = 0; i < rules.length; i += chunkSize) {
    const chunk = rules.slice(i, i + chunkSize);
    const res = await db
      .insert(taxRules)
      .values(
        chunk.map((r) => ({
          id: r.id,
          version: String(r.version),
          tribute: r.tribute,
          name: r.name,
          jurisdictionScope: r.jurisdiction.scope,
          ...(r.jurisdiction.code ? { jurisdictionCode: r.jurisdiction.code } : {}),
          condition: r.condition,
          effects: r.effects,
          priority: String(r.priority),
          validity: { from: r.validity.from.toISOString().slice(0, 10), to: null },
          status: r.status,
          ...(r.legalBasis ? { legalBasis: r.legalBasis } : {}),
          origin: r.origin,
          ...(r.reviewReason ? { reviewReason: r.reviewReason } : {}),
        })),
      )
      .onConflictDoNothing()
      .returning({ id: taxRules.id });
    inserted += res.length;
  }
  await pool.end();
  return inserted;
}
