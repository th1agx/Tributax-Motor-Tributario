import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { TaxDecisionsModule } from "./tax-decisions/tax-decisions.controller.js";
import { DECISION_STORE, RULE_SOURCE } from "./tax-decisions/tax-decisions.controller.js";
import { InMemoryDecisionStore } from "./tax-decisions/decision-store.js";
import type { DecisionStore } from "./tax-decisions/decision-store.js";
import { GeneratedRuleSource } from "./tax-decisions/rule-source.js";
import type { RuleSource } from "./tax-decisions/rule-source.js";
import type { TaxCalculationResponse } from "./tax-decisions/tax-decisions.controller.js";
import { PartiesController, InMemoryPartyStore, PARTY_STORE } from "./parties/parties.controller.js";
import type { Party, PartyStore } from "./parties/parties.controller.js";
import { RulesAdminController, RULE_CATALOG, defaultRuleCatalog } from "./rules/rule-admin.controller.js";
import { DocsController } from "./docs/docs.controller.js";
import type { RuleCatalogStore } from "./rules/rule-admin.controller.js";
import { setTenantStore, EnvTenantStore } from "./auth/tenant-store.js";
import { TenantsController, TENANT_ADMIN_STORE } from "./tenants/tenants.controller.js";
import { WebhooksController } from "./webhooks/webhooks.controller.js";
import type { TenantAdminStore } from "./tenants/tenants.controller.js";

/**
 * Composição (ADR-002): main é o único lugar que conhece adapters concretos.
 * Com DATABASE_URL, decisões/regras/partes vêm do Postgres; sem ele,
 * in-memory + catálogo gerado em código (fallback de desenvolvimento).
 */
async function bootstrap(): Promise<void> {
  let store: DecisionStore = new InMemoryDecisionStore();
  let ruleSource: RuleSource = new GeneratedRuleSource();
  let partyStore: PartyStore = new InMemoryPartyStore();
  let ruleCatalog: RuleCatalogStore = defaultRuleCatalog;
  let tenantAdminStore: TenantAdminStore | undefined;

  if (process.env.DATABASE_URL) {
    const { PostgresDecisionStore, PostgresRuleSource, PostgresPartyStore, PostgresRuleAdminStore } = await import("@tributax/infrastructure");
    const url = process.env.DATABASE_URL;
    const probe = new PostgresRuleSource(url);
    try {
      // probe de conexão: falha no boot → fallback in-memory com aviso (dev)
      await probe.loadRules({
        asOfDate: new Date("1970-01-01T00:00:00Z"), // data que não carrega regras
        issuerState: "MG", recipientState: "MG", recipientRole: "CONTRIBUTOR",
        operationKind: "SALE_GOODS", fiscalDocumentType: "NFE", regime: "NORMAL", items: [],
      });
      store = new PostgresDecisionStoreAdapter(PostgresDecisionStore, url);
      ruleSource = probe;
      partyStore = new PostgresPartyStoreAdapter(PostgresPartyStore, url);
      ruleCatalog = new PostgresRuleAdminStore(url);
      // tenants (ADR-009): keys com quota no banco; sem a migration, env
      try {
        const { PostgresTenantStore } = await import("@tributax/infrastructure");
        const tenantStore = new PostgresTenantStore(url);
        await tenantStore.findByApiKey("__probe__"); // valida a tabela tenants
        setTenantStore(tenantStore);
        tenantAdminStore = tenantStore; // administração via /v1/tenants
      } catch {
        console.warn("[tributax] tabela tenants ausente — auth via TRIBUTAX_API_KEYS (aplique drizzle/custom/03_tenants.sql)");
        setTenantStore(new EnvTenantStore());
      }
    } catch (e) {
      console.warn(
        `[tributax] Postgres inacessível (${(e as Error).message ?? e}) — ` +
        "rodando com stores in-memory e catálogo gerado em código. " +
        "Suba o banco (docker compose up postgres) e reinicie para persistir.",
      );
    }
  }

  const app = await NestFactory.create({
    module: TaxDecisionsModule,
    controllers: [PartiesController, RulesAdminController, DocsController, TenantsController, WebhooksController],
    providers: [
      { provide: DECISION_STORE, useValue: store },
      { provide: RULE_SOURCE, useValue: ruleSource },
      { provide: PARTY_STORE, useValue: partyStore },
      { provide: RULE_CATALOG, useValue: ruleCatalog },
      ...(tenantAdminStore ? [{ provide: TENANT_ADMIN_STORE, useValue: tenantAdminStore }] : []),
    ],
  });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3000));
}

/** Concilia o port (resposta com asOfDate string) com o adapter de infra. */
class PostgresDecisionStoreAdapter implements DecisionStore {
  private readonly inner;

  constructor(
    inner: new (url: string) => {
      save: (d: {
        decisionId: string; correlationId: string; engineVersion: string;
        rulesetHash: string; asOfDate: Date; derivedTier: string; response: unknown;
      }) => Promise<void>;
      findById: (id: string) => Promise<{ response: unknown } | undefined>;
    },
    url: string,
  ) {
    this.inner = new inner(url);
  }

  async save(response: TaxCalculationResponse): Promise<void> {
    await this.inner.save({
      decisionId: response.decisionId,
      correlationId: response.correlationId,
      engineVersion: response.engineVersion,
      rulesetHash: response.rulesetHash,
      asOfDate: new Date(`${response.asOfDate}T00:00:00Z`),
      derivedTier: response.derivedTier,
      response,
    });
  }

  async findById(decisionId: string): Promise<TaxCalculationResponse | undefined> {
    const row = await this.inner.findById(decisionId);
    return row?.response as TaxCalculationResponse | undefined;
  }
}

/** Concilia o port PartyStore com o adapter de infra (perfil em JSONB). */
class PostgresPartyStoreAdapter implements PartyStore {
  private readonly inner;

  constructor(
    inner: new (url: string) => {
      save: (p: { id?: string; taxId: string; legalName: string; type: string; establishments: readonly unknown[] }) =>
        Promise<{ id: string } & Record<string, unknown>>;
      findByIdOrTaxId: (ref: string) => Promise<Record<string, unknown> | undefined>;
    },
    url: string,
  ) {
    this.inner = new inner(url);
  }

  async save(party: Party): Promise<Party> {
    const saved = await this.inner.save(party);
    return { ...party, id: saved.id };
  }

  async findByIdOrTaxId(ref: string): Promise<Party | undefined> {
    const row = await this.inner.findByIdOrTaxId(ref);
    return row as Party | undefined;
  }
}

void bootstrap();
