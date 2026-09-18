import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { TaxDecisionsModule } from "./tax-decisions/tax-decisions.controller.js";
import { DECISION_STORE, RULE_SOURCE } from "./tax-decisions/tax-decisions.controller.js";
import { InMemoryDecisionStore } from "./tax-decisions/decision-store.js";
import type { DecisionStore } from "./tax-decisions/decision-store.js";
import { GeneratedRuleSource } from "./tax-decisions/rule-source.js";
import type { RuleSource } from "./tax-decisions/rule-source.js";
import type { TaxCalculationResponse } from "./tax-decisions/tax-decisions.controller.js";

/**
 * Composição (ADR-002): main é o único lugar que conhece adapters concretos.
 * Com DATABASE_URL, decisões e regras vêm do Postgres; sem ele, in-memory
 * + catálogo gerado em código (fallback de desenvolvimento).
 */
async function bootstrap(): Promise<void> {
  let store: DecisionStore = new InMemoryDecisionStore();
  let ruleSource: RuleSource = new GeneratedRuleSource();

  if (process.env.DATABASE_URL) {
    const { PostgresDecisionStore, PostgresRuleSource } = await import("@tributax/infrastructure");
    store = new PostgresDecisionStoreAdapter(PostgresDecisionStore, process.env.DATABASE_URL);
    ruleSource = new PostgresRuleSource(process.env.DATABASE_URL);
  }

  const app = await NestFactory.create({
    module: TaxDecisionsModule,
    providers: [
      { provide: DECISION_STORE, useValue: store },
      { provide: RULE_SOURCE, useValue: ruleSource },
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

void bootstrap();
