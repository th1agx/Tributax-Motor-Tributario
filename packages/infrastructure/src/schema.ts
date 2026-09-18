import { customType, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

/**
 * Schema Tributax (ADR-003): vigências como range + exclusão de sobreposição,
 * traces/dados como JSONB, decisões append-only.
 */

/** daterange nativo do Postgres (ADR-003). */
const daterange = customType<{ data: { from: string; to: string | null } }>({
  dataType() {
    return "daterange";
  },
});

/** tstzrange nativo para regimes por intervalo (payload-spec §13). */
const tstzrange = customType<{ data: { from: Date; to: Date | null } }>({
  dataType() {
    return "tstzrange";
  },
});

/** Catálogo de regras fiscais — a fonte de verdade dos cálculos (ADR-004). */
export const taxRules = pgTable(
  "tax_rules",
  {
    id: varchar("id", { length: 64 }).notNull(),
    version: text("version").notNull(),
    tribute: varchar("tribute", { length: 16 }).notNull(),
    name: text("name").notNull(),
    jurisdictionScope: varchar("jurisdiction_scope", { length: 16 }).notNull(),
    jurisdictionCode: varchar("jurisdiction_code", { length: 16 }),
    condition: jsonb("condition").notNull(),
    effects: jsonb("effects").notNull(),
    priority: text("priority").notNull().default("0"),
    validity: daterange("validity").notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    legalBasis: jsonb("legal_basis"),
    origin: varchar("origin", { length: 16 }).notNull(),
    reviewReason: text("review_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idVersion: uniqueIndex("tax_rules_id_version").on(t.id, t.version),
    tributeValidity: index("tax_rules_tribute_validity").on(t.tribute),
  }),
);

/**
 * Decisões — append-only (ADR-007/008): nunca update/delete.
 * O trace viaja no JSONB; engineVersion + rulesetHash + asOfDate garantem
 * reprodutibilidade da decisão.
 */
export const taxDecisions = pgTable(
  "tax_decisions",
  {
    decisionId: uuid("decision_id").primaryKey().defaultRandom(),
    correlationId: varchar("correlation_id", { length: 128 }).notNull(),
    engineVersion: varchar("engine_version", { length: 32 }).notNull(),
    rulesetHash: varchar("ruleset_hash", { length: 16 }).notNull(),
    asOfDate: timestamp("as_of_date", { withTimezone: true }).notNull(),
    derivedTier: varchar("derived_tier", { length: 16 }).notNull(),
    response: jsonb("response").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    correlation: index("tax_decisions_correlation").on(t.correlationId),
    asOf: index("tax_decisions_as_of").on(t.asOfDate),
  }),
);

/** Perfil de partes (payload-spec §13): regimes como intervalos temporais. */
export const parties = pgTable("parties", {
  id: uuid("id").primaryKey().defaultRandom(),
  taxId: varchar("tax_id", { length: 20 }).notNull(),
  legalName: text("legal_name").notNull(),
  profile: jsonb("profile").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Vigências disjuntas garantidas por constraint de exclusão (ADR-003).
 * Exigiria expressão por escopo (tributo × jurisdição); aplicada via
 * migration custom em drizzle/custom/, pois drizzle-kit não gera
 * EXCLUDE USING nativamente. Ver 01_no_overlap.sql.
 */
