import { BadGatewayException, BadRequestException, Body, Controller, Get, Module, Param, Post } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { calculateIcms, ENGINE_VERSION } from "@tributax/domain";
import type { TaxDecision } from "@tributax/domain";
import { mapRequest, PayloadValidationError, type Inference } from "./tax-decision.mapper.js";
import { InMemoryDecisionStore, type DecisionStore } from "./decision-store.js";
import type { TaxCalculationRequest } from "./tax-decision.request.js";

/**
 * /v1/tax-decisions e /v1/tax-simulations — mesmo cálculo; decision persiste
 * via port DecisionStore (in-memory default; Postgres em produção).
 * Emissor de teste fixo (MG/NORMAL) até o contexto Party existir.
 */
const ISSUER_DEFAULTS = { state: "MG" as const, regime: "NORMAL" as const };

@Controller("/v1")
export class TaxDecisionsController {
  private readonly store: DecisionStore;

  constructor(store?: DecisionStore) {
    this.store = store ?? new InMemoryDecisionStore();
  }

  @Post("tax-decisions")
  async decide(@Body() req: TaxCalculationRequest): Promise<TaxCalculationResponse> {
    try {
      const response = this.compute(req);
      await this.store.save(response);
      return response;
    } catch (e) {
      throw toHttp(e);
    }
  }

  @Post("tax-simulations")
  simulate(@Body() req: TaxCalculationRequest): TaxCalculationResponse {
    try {
      return this.compute(req);
    } catch (e) {
      throw toHttp(e);
    }
  }

  @Get("tax-decisions/:id")
  async findById(@Param("id") id: string): Promise<TaxCalculationResponse> {
    const found = await this.store.findById(id);
    if (!found) throw new BadRequestException({ error: "NOT_FOUND", message: `decisão ${id} não encontrada` });
    return found;
  }

  private compute(req: TaxCalculationRequest): TaxCalculationResponse {
    if (!req?.correlationId) {
      throw new PayloadValidationError("correlationId é obrigatório");
    }
    const mapped = mapRequest(req, ISSUER_DEFAULTS);
    const result = calculateIcms(mapped.ctx);

    const taxes: TaxItem[] = [toTaxItem("ICMS", result.icms)];
    if (result.difal) {
      taxes.push(toTaxItem("DIFAL", result.difal));
      if (result.fcp) taxes.push(toTaxItem("FCP", result.fcp));
    }

    return {
      decisionId: randomUUID(),
      correlationId: req.correlationId,
      engineVersion: ENGINE_VERSION,
      rulesetHash: result.icms.rulesetHash,
      asOfDate: mapped.ctx.asOfDate.toISOString().slice(0, 10),
      derivedTier: mapped.derivedTier,
      fiscalDocumentType: mapped.ctx.fiscalDocumentType,
      operationKind: mapped.ctx.operationKind,
      items: [{ itemId: "*", taxes }],
      totals: taxes.reduce<{ tax: string; amountCents: number }[]>((acc, t) =>
        t.amountCents !== undefined ? [...acc, { tax: t.tax, amountCents: t.amountCents }] : acc, []),
      inferences: mapped.inferences,
      warnings: result.icms.warnings,
      errors: [],
      ...(req.options?.detailLevel === "FULL_TRACE" ? { trace: result.icms.trace } : {}),
    };
  }
}

function toTaxItem(tax: string, d: TaxDecision): TaxItem {
  const appliedRules = d.appliedRule ? [`${d.appliedRule.id}@v${d.appliedRule.version}`] : [];
  if (d.outcome.kind === "TAXED") {
    return {
      tax,
      outcome: "TAXED",
      basisCents: d.outcome.basisCents,
      rateBp: d.outcome.rateBp,
      amountCents: d.outcome.amountCents,
      legalBases: d.outcome.legalBasis ? [legalBasisToString(d.outcome.legalBasis)] : [],
      appliedRules,
    };
  }
  if (d.outcome.kind === "NO_RULE_FOUND") {
    return {
      tax,
      outcome: "NO_RULE_FOUND",
      legalBases: [],
      appliedRules,
      hints: d.outcome.evaluatedRules.map((r) => `${r.ruleId}: ${r.reason}`),
    };
  }
  return {
    tax,
    outcome: d.outcome.kind,
    legalBases: [legalBasisToString(d.outcome.legalBasis)],
    appliedRules,
  };
}

function legalBasisToString(b: { documentType: string; number: string; year: string; provision?: string }): string {
  const doc: Record<string, string> = {
    LEI: "Lei", LEI_COMPLEMENTAR: "LC", DECRETO: "Decreto", CONVENIO: "Convênio",
    AJUSTE_SINIEF: "Ajuste SINIEF", ATO_COTEPE: "Ato COTEPE", INSTRUCAO_NORMATIVA: "IN",
    RESOLUCAO: "Resolução", REGULAMENTO_ESTADUAL: "RICMS", LEI_MUNICIPAL: "Lei Municipal",
  };
  return `${doc[b.documentType] ?? b.documentType} ${b.number}/${b.year}${b.provision ? `, ${b.provision}` : ""}`;
}

function toHttp(e: unknown): unknown {
  if (e instanceof PayloadValidationError) {
    return new BadRequestException({ error: "PAYLOAD_VALIDATION", message: e.message });
  }
  return new BadGatewayException({ error: "INTERNAL", message: (e as Error).message });
}

export interface TaxItem {
  readonly tax: string;
  readonly outcome: string;
  readonly basisCents?: number;
  readonly rateBp?: number;
  readonly amountCents?: number;
  readonly legalBases: readonly string[];
  readonly appliedRules: readonly string[];
  readonly hints?: readonly string[];
}

export interface TaxCalculationResponse {
  readonly decisionId: string;
  readonly correlationId: string;
  readonly engineVersion: string;
  readonly rulesetHash: string;
  readonly asOfDate: string;
  readonly derivedTier: string;
  readonly fiscalDocumentType: string;
  readonly operationKind: string;
  readonly items: readonly { readonly itemId: string; readonly taxes: readonly TaxItem[] }[];
  readonly totals: readonly { readonly tax: string; readonly amountCents?: number }[];
  readonly inferences: readonly Inference[];
  readonly warnings: readonly string[];
  readonly errors: readonly unknown[];
  readonly trace?: unknown;
}

@Module({ controllers: [TaxDecisionsController] })
export class TaxDecisionsModule {}
