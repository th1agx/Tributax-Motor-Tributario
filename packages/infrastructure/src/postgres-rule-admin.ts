import pg from "pg";
import { and, eq } from "drizzle-orm";
import { taxRules } from "./schema.js";
import { PostgresRuleSource } from "./postgres-rule-source.js";
import type { FiscalContext, Jurisdiction, LegalBasisRef, RuleEffect, RuleStatus, SpecJson, TaxRule, TributeId } from "@tributax/domain";
import { DateRange } from "@tributax/domain";

/**
 * Adapter Postgres do catálogo de regras (authoring) — compatível por
 * subtyping estrutural com o port RuleCatalogStore da aplicação (sem
 * dependência de pacote: infra não importa api, ADR-002).
 *
 * Vigência disjunta entre regras ACTIVE é garantida pela constraint EXCLUDE
 * (drizzle/custom/01_no_overlap.sql): conflito vira erro do Postgres,
 * propagado com mensagem clara.
 */
const TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ["REVIEW", "DEPRECATED"],
  REVIEW: ["APPROVED", "DRAFT"],
  APPROVED: ["ACTIVE", "DRAFT"],
  ACTIVE: ["DEPRECATED", "REVOKED"],
  DEPRECATED: [],
  REVOKED: [],
};

export interface AdminRuleDraftInput {
  readonly tribute: TributeId;
  readonly name: string;
  readonly jurisdiction: Jurisdiction;
  readonly condition: SpecJson;
  readonly effects: readonly RuleEffect[];
  readonly priority?: number;
  readonly validFrom: string;
  readonly validTo?: string;
  readonly legalBasis?: LegalBasisRef;
  readonly reviewReason?: string;
  readonly origin?: TaxRule["origin"];
  readonly proposedBy?: "AI_AGENT" | "HUMAN";
}

export class PostgresRuleAdminStore extends PostgresRuleSource {
  // reusa o db protegido da base (PostgresRuleSource)

  async create(input: AdminRuleDraftInput): Promise<TaxRule> {
    const rule: TaxRule = {
      id: `RULE-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      version: 1,
      tribute: input.tribute,
      name: input.name,
      jurisdiction: input.jurisdiction,
      condition: input.condition,
      effects: input.effects,
      priority: input.priority ?? 0,
      validity: DateRange.from(new Date(input.validFrom), input.validTo ? new Date(input.validTo) : undefined),
      status: "DRAFT",
      origin: input.origin ?? (input.proposedBy === "AI_AGENT" ? "AI_SUGGESTED" : "MANUAL"),
      ...(input.legalBasis ? { legalBasis: input.legalBasis } : {}),
      ...(input.reviewReason ? { reviewReason: input.reviewReason } : {}),
    };
    await this.db.insert(taxRules).values({
      id: rule.id,
      version: String(rule.version),
      tribute: rule.tribute,
      name: rule.name,
      jurisdictionScope: rule.jurisdiction.scope,
      ...(rule.jurisdiction.code ? { jurisdictionCode: rule.jurisdiction.code } : {}),
      condition: rule.condition,
      effects: rule.effects,
      priority: String(rule.priority),
      validity: { from: iso(rule.validity.from), to: rule.validity.to ? iso(rule.validity.to) : null },
      status: rule.status,
      ...(rule.legalBasis ? { legalBasis: rule.legalBasis } : {}),
      origin: rule.origin,
      ...(rule.reviewReason ? { reviewReason: rule.reviewReason } : {}),
    });
    return rule;
  }

  async list(): Promise<readonly TaxRule[]> {
    const rows = await this.db.select().from(taxRules);
    return rows.map(toRule);
  }

  async transition(id: string, version: number, to: RuleStatus, actor: "AI_AGENT" | "HUMAN"): Promise<TaxRule> {
    // Invariáveis de workflow (mesma política do port na aplicação):
    // matriz de estados, IA nunca aprova, APPROVED exige fundamento legal.
    const rows = await this.db
      .select()
      .from(taxRules)
      .where(and(eq(taxRules.id, id), eq(taxRules.version, String(version))))
      .limit(1);
    const current = rows[0];
    if (!current) throw new Error(`regra ${id}@${version} não encontrada`);

    if (!(TRANSITIONS[current.status] ?? []).includes(to)) {
      throw new Error(`transição inválida: ${current.status} → ${to}`);
    }
    if (to === "APPROVED" && actor !== "HUMAN") {
      throw new Error("apenas HUMAN pode aprovar regra (ADR-012)");
    }
    if (to === "APPROVED" && !current.legalBasis) {
      throw new Error("regra sem fundamento legal não pode ser APPROVED");
    }

    const updated = await this.db
      .update(taxRules)
      .set({ status: to })
      .where(and(eq(taxRules.id, id), eq(taxRules.version, String(version))))
      .returning();
    return toRule(updated[0]!);
  }

  override async loadRules(ctx: FiscalContext): Promise<readonly TaxRule[]> {
    return super.loadRules(ctx);
  }
}

function toRule(r: {
  id: string; version: string; tribute: string; name: string;
  jurisdictionScope: string; jurisdictionCode: string | null;
  condition: unknown; effects: unknown; priority: string;
  validity: { from: string; to: string | null }; status: string;
  legalBasis: unknown; origin: string; reviewReason: string | null;
}): TaxRule {
  return {
    id: r.id,
    version: Number(r.version),
    tribute: r.tribute as TaxRule["tribute"],
    name: r.name,
    jurisdiction: { scope: r.jurisdictionScope as TaxRule["jurisdiction"]["scope"], ...(r.jurisdictionCode ? { code: r.jurisdictionCode } : {}) },
    condition: r.condition as TaxRule["condition"],
    effects: r.effects as TaxRule["effects"],
    priority: Number(r.priority),
    validity: DateRange.from(new Date(r.validity.from), r.validity.to ? new Date(r.validity.to) : undefined),
    status: r.status as RuleStatus,
    ...(r.legalBasis ? { legalBasis: r.legalBasis as LegalBasisRef } : {}),
    origin: r.origin as TaxRule["origin"],
    ...(r.reviewReason ? { reviewReason: r.reviewReason } : {}),
  };
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
