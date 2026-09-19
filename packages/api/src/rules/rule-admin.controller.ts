import { BadRequestException, Body, Controller, Get, Inject, Module, Optional, Param, Post } from "@nestjs/common";
import { compile } from "@tributax/domain";
import { icmsRuleCatalog, pisCofinsRuleCatalog, issRetentionRuleCatalog, ipiRuleCatalog, ibsCbsRuleCatalog, issRuleCatalog } from "@tributax/domain";
import type { FiscalContext, SpecJson, TaxRule } from "@tributax/domain";
import { DateRange } from "@tributax/domain";
import { defaultWebhookRegistry } from "../webhooks/webhooks.controller.js";

/**
 * /v1/rules — authoring e workflow do catálogo (ADR-004/012).
 *
 * Invariáveis de domínio aplicadas aqui:
 * 1. Condição precisa compilar contra o vocabulário vigente (falha em carga).
 * 2. Regra APPROVED exige fundamento legal.
 * 3. Agente de IA só cria DRAFT e NUNCA aprova (ADR-012).
 * 4. Transições seguem a máquina de estados; vigência disjunta é garantida
 *    pela constraint EXCLUDE do Postgres quando o catálogo é persistido.
 */
export const RULE_CATALOG = "RULE_CATALOG";

export type RuleStatus = TaxRule["status"];

/** Transições permitidas da máquina de estados. */
const TRANSITIONS: Record<RuleStatus, readonly RuleStatus[]> = {
  DRAFT: ["REVIEW", "DEPRECATED"],
  REVIEW: ["APPROVED", "DRAFT"],
  APPROVED: ["ACTIVE", "DRAFT"],
  ACTIVE: ["DEPRECATED", "REVOKED"],
  DEPRECATED: [],
  REVOKED: [],
};

export interface RuleDraftInput {
  readonly tribute: TaxRule["tribute"];
  readonly name: string;
  readonly jurisdiction: TaxRule["jurisdiction"];
  readonly condition: SpecJson;
  readonly effects: TaxRule["effects"];
  readonly priority?: number;
  readonly validFrom: string;
  readonly validTo?: string;
  readonly legalBasis?: TaxRule["legalBasis"];
  readonly reviewReason?: string;
  readonly origin?: TaxRule["origin"];
  readonly proposedBy?: "AI_AGENT" | "HUMAN";
}

export interface RuleCatalogStore {
  create(input: RuleDraftInput): Promise<TaxRule>;
  list(): Promise<readonly TaxRule[]>;
  transition(id: string, version: number, to: RuleStatus, actor: "AI_AGENT" | "HUMAN"): Promise<TaxRule>;
  loadRules(ctx: FiscalContext): Promise<readonly TaxRule[]>; // também é RuleSource
}

/** Catálogo in-memory compartilhado (authoring + cálculo), pré-semeado. */
export class InMemoryRuleCatalog implements RuleCatalogStore {
  private readonly rules = new Map<string, TaxRule>();
  private seq = 0;

  constructor(seed: readonly TaxRule[] = [...icmsRuleCatalog(), ...pisCofinsRuleCatalog(), ...issRetentionRuleCatalog(), ...ipiRuleCatalog(), ...ibsCbsRuleCatalog(), ...issRuleCatalog()]) {
    for (const r of seed) this.rules.set(`${r.id}@${r.version}`, r);
  }

  async create(input: RuleDraftInput): Promise<TaxRule> {
    const rule: TaxRule = {
      id: `RULE-${++this.seq}-${Date.now().toString(36)}`,
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
    this.rules.set(`${rule.id}@1`, rule);
    return rule;
  }

  async list(): Promise<readonly TaxRule[]> {
    return [...this.rules.values()];
  }

  async transition(id: string, version: number, to: RuleStatus, actor: "AI_AGENT" | "HUMAN"): Promise<TaxRule> {
    const key = `${id}@${version}`;
    const current = this.rules.get(key);
    if (!current) throw new Error(`regra ${key} não encontrada`);

    if (!TRANSITIONS[current.status].includes(to)) {
      throw new Error(`transição inválida: ${current.status} → ${to}`);
    }
    if (to === "APPROVED" && actor !== "HUMAN") {
      throw new Error("apenas HUMAN pode aprovar regra (ADR-012)");
    }
    if (to === "APPROVED" && !current.legalBasis) {
      throw new Error("regra sem fundamento legal não pode ser APPROVED");
    }
    const updated = { ...current, status: to };
    this.rules.set(key, updated);
    return updated;
  }

  async loadRules(ctx: FiscalContext): Promise<readonly TaxRule[]> {
    return [...this.rules.values()].filter(
      (r) => r.status === "ACTIVE" && r.validity.contains(ctx.asOfDate),
    );
  }
}

export const defaultRuleCatalog = new InMemoryRuleCatalog();

/** Validação de entrada de rascunho — falha em carga, nunca em cálculo. */
export function validateDraft(input: RuleDraftInput): void {
  if (!input?.name || !input?.tribute) {
    throw new BadRequestException({ error: "PAYLOAD_VALIDATION", message: "name e tribute são obrigatórios" });
  }
  try {
    compile(input.condition);
  } catch (e) {
    throw new BadRequestException({
      error: "CONDITION_INVALID",
      message: `condição não compila contra o vocabulário: ${(e as Error).message}`,
    });
  }
  if (!input.effects?.length) {
    throw new BadRequestException({ error: "PAYLOAD_VALIDATION", message: "ao menos 1 efeito é obrigatório" });
  }
  if (input.proposedBy === "AI_AGENT" && input.origin && input.origin !== "AI_SUGGESTED") {
    throw new BadRequestException({
      error: "POLICY",
      message: "agente de IA só propõe regras AI_SUGGESTED (ADR-012)",
    });
  }
}

@Controller("/v1/rules")
export class RulesAdminController {
  private readonly catalog: RuleCatalogStore;

  constructor(@Optional() @Inject(RULE_CATALOG) catalog?: RuleCatalogStore) {
    this.catalog = catalog ?? defaultRuleCatalog;
  }

  @Post()
  async create(@Body() input: RuleDraftInput): Promise<{ rule: TaxRule; transitionUrl: string }> {
    validateDraft(input);
    const rule = await this.catalog.create(input);
    void defaultWebhookRegistry.emit("rule.proposal.created", { ruleId: rule.id, origin: rule.origin });
    return { rule, transitionUrl: `/v1/rules/${rule.id}/transitions` };
  }

  @Get()
  async list(): Promise<readonly TaxRule[]> {
    return this.catalog.list();
  }

  /**
   * Fila de triagem humana (ADR-012 §3): propostas pendentes, IA primeiro
   * (origem AI_SUGGESTED + reviewReason é a fila de trabalho do editor).
   * Aprovar/rejeitar continua em POST /v1/rules/:id/transitions.
   */
  @Get("review-queue")
  async reviewQueue(): Promise<{
    queue: readonly {
      rule: TaxRule;
      suggestedByAi: boolean;
      nextTransitions: readonly RuleStatus[];
    }[];
  }> {
    const pending = (await this.catalog.list())
      .filter((r) => r.status === "DRAFT" || r.status === "REVIEW")
      .sort((a, b) => Number(b.origin === "AI_SUGGESTED") - Number(a.origin === "AI_SUGGESTED"));
    return {
      queue: pending.map((rule) => ({
        rule,
        suggestedByAi: rule.origin === "AI_SUGGESTED",
        nextTransitions: TRANSITIONS[rule.status],
      })),
    };
  }

  @Post(":id/transitions")
  async transition(
    @Param("id") id: string,
    @Body() body: { version: number; to: RuleStatus; actor: "AI_AGENT" | "HUMAN" },
  ): Promise<TaxRule> {
    if (!body?.version || !body?.to) {
      throw new BadRequestException({ error: "PAYLOAD_VALIDATION", message: "version e to são obrigatórios" });
    }
    try {
      return await this.catalog.transition(id, body.version, body.to, body.actor ?? "HUMAN");
    } catch (e) {
      throw new BadRequestException({ error: "TRANSITION_INVALID", message: (e as Error).message });
    }
  }
}

@Module({ controllers: [RulesAdminController] })
export class RulesAdminModule {}
