import type { TaxCalculationResponse } from "./tax-decisions.controller.js";

/**
 * Port — persistência de decisões (ADR-002: domínio/aplicação não conhecem
 * infra). Adapters: InMemoryDecisionStore (default, testes) e o Postgres
 * do @tributax/infrastructure em produção.
 */
export interface DecisionStore {
  save(response: TaxCalculationResponse): Promise<void>;
  findById(decisionId: string): Promise<TaxCalculationResponse | undefined>;
}

export class InMemoryDecisionStore implements DecisionStore {
  private readonly store = new Map<string, TaxCalculationResponse>();

  async save(response: TaxCalculationResponse): Promise<void> {
    this.store.set(response.decisionId, response);
  }

  async findById(decisionId: string): Promise<TaxCalculationResponse | undefined> {
    return this.store.get(decisionId);
  }
}
