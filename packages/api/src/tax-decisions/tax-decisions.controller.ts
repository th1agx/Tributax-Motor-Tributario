import { BadGatewayException, BadRequestException, Body, Controller, Get, Inject, Module, Optional, Param, Post } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { randomUUID } from "node:crypto";
import { ENGINE_VERSION, inferCfop, fiscalCodeFor } from "@tributax/domain";
import type { TaxDecision, FiscalContext } from "@tributax/domain";
import { mapRequest, PayloadValidationError, type Inference } from "./tax-decision.mapper.js";
import { InMemoryDecisionStore, type DecisionStore } from "./decision-store.js";
import { resolveIcms, resolvePisCofins, resolveIssRetentions, resolveIpi, resolveIbsCbs, resolveIss, type RuleSource } from "./rule-source.js";
import { defaultPartyStore, issuerProfileAt, PARTY_STORE } from "../parties/parties.controller.js";
import { defaultRuleCatalog, RULE_CATALOG } from "../rules/rule-admin.controller.js";
import type { IssuerProfile, PartyStore } from "../parties/parties.controller.js";
import type { RuleCatalogStore } from "../rules/rule-admin.controller.js";
import { ApiKeyGuard } from "../auth/api-key.guard.js";
import { RateLimitGuard } from "../auth/rate-limit.guard.js";
import type { TaxCalculationRequest } from "./tax-decision.request.js";

/**
 * /v1/tax-decisions e /v1/tax-simulations — mesmo cálculo; decision persiste
 * via port DecisionStore e as regras vêm do port RuleSource (catálogo gerado
 * em código por default; Postgres em produção via main.ts).
 * Emissor de teste fixo (MG/NORMAL) até o contexto Party existir.
 */
export const DECISION_STORE = "DECISION_STORE";
export const RULE_SOURCE = "RULE_SOURCE";

const ISSUER_DEFAULTS: IssuerProfile = { state: "MG", regime: "NORMAL" };

@Controller("/v1")
export class TaxDecisionsController {
  private readonly store: DecisionStore;
  private readonly ruleSource: RuleSource;
  private readonly partyStore: PartyStore;

  constructor(
    @Optional() @Inject(DECISION_STORE) store?: DecisionStore,
    @Optional() @Inject(RULE_SOURCE) ruleSource?: RuleSource,
    @Optional() @Inject(PARTY_STORE) partyStore?: PartyStore,
    @Optional() @Inject(RULE_CATALOG) catalog?: RuleCatalogStore,
  ) {
    this.store = store ?? new InMemoryDecisionStore();
    this.ruleSource = ruleSource ?? catalog ?? defaultRuleCatalog;
    this.partyStore = partyStore ?? defaultPartyStore;
  }

  @Post("tax-decisions")
  async decide(@Body() req: TaxCalculationRequest): Promise<TaxCalculationResponse> {
    try {
      const response = await this.compute(req);
      await this.store.save(response);
      return response;
    } catch (e) {
      throw toHttp(e);
    }
  }

  @Post("tax-simulations")
  async simulate(@Body() req: TaxCalculationRequest): Promise<TaxCalculationResponse> {
    try {
      return await this.compute(req);
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

  private async compute(req: TaxCalculationRequest): Promise<TaxCalculationResponse> {
    if (!req?.correlationId) {
      throw new PayloadValidationError("correlationId é obrigatório");
    }
    // Emissor: perfil da parte referenciada (regime vigente na data) ou default.
    const asOf = req.asOfDate ? new Date(req.asOfDate) : new Date();
    let issuer = ISSUER_DEFAULTS;
    const inferences: Inference[] = [];
    const partyRef = req.context?.issuer?.partyRef;
    if (partyRef) {
      const party = await this.partyStore.findByIdOrTaxId(partyRef);
      if (!party) {
        throw new PayloadValidationError(`emissor não encontrado: ${partyRef}`);
      }
      const profile = issuerProfileAt(party, asOf);
      if (!profile) {
        throw new PayloadValidationError(
          `emissor ${partyRef} sem regime vigente em ${asOf.toISOString().slice(0, 10)}`,
        );
      }
      issuer = profile;
      inferences.push({
        field: "context.issuer",
        value: `${profile.state}/${profile.regime}`,
        evidence: `perfil ${party.taxId} — regime vigente na data da operação`,
      });
    }
    const mapped = mapRequest(req, issuer);
    const result = await resolveIcms(mapped.ctx, this.ruleSource);
    const federal = await resolvePisCofins(mapped.ctx, this.ruleSource);

    const taxes: TaxItem[] = [toTaxItem("ICMS", result.icms, mapped.ctx.regime)];
    if (result.difal) {
      taxes.push(toTaxItem("DIFAL", result.difal, mapped.ctx.regime));
      if (result.fcp) taxes.push(toTaxItem("FCP", result.fcp, mapped.ctx.regime));
    }
    taxes.push(toTaxItem("PIS", federal.pis, mapped.ctx.regime));
    taxes.push(toTaxItem("COFINS", federal.cofins, mapped.ctx.regime));
    const retentions = await resolveIssRetentions(mapped.ctx, this.ruleSource);
    taxes.push(toTaxItem("IRRF", retentions.irrf, mapped.ctx.regime));
    taxes.push(toTaxItem("CSRF", retentions.csrf, mapped.ctx.regime));
    const ipi = await resolveIpi(mapped.ctx, this.ruleSource);
    taxes.push(toTaxItem("IPI", ipi.ipi, mapped.ctx.regime));
    const reform = await resolveIbsCbs(mapped.ctx, this.ruleSource);
    taxes.push(toTaxItem("CBS", reform.cbs, mapped.ctx.regime));
    taxes.push(toTaxItem("IBS", reform.ibs, mapped.ctx.regime));
    const iss = await resolveIss(mapped.ctx, this.ruleSource);
    taxes.push(toTaxItem("ISS", iss.iss, mapped.ctx.regime));

    const cfop = mapped.ctx.cfop
      ? { code: mapped.ctx.cfop, basis: "CFOP informado pelo emissor (trava validada)" }
      : (() => {
          const inferred = inferCfop(mapped.ctx);
          if (!inferred) return undefined;
          inferences.push({
            field: "operation.cfop",
            value: inferred.code,
            evidence: inferred.basis,
          });
          return inferred;
        })();

    return {
      decisionId: randomUUID(),
      correlationId: req.correlationId,
      engineVersion: ENGINE_VERSION,
      rulesetHash: result.icms.rulesetHash,
      asOfDate: mapped.ctx.asOfDate.toISOString().slice(0, 10),
      derivedTier: mapped.derivedTier,
      fiscalDocumentType: mapped.ctx.fiscalDocumentType,
      operationKind: mapped.ctx.operationKind,
      ...(cfop ? { cfop } : {}),
      items: [{ itemId: "*", taxes }],
      totals: taxes.reduce<{ tax: string; amountCents: number }[]>((acc, t) =>
        t.amountCents !== undefined ? [...acc, { tax: t.tax, amountCents: t.amountCents }] : acc, []),
      inferences: [...inferences, ...mapped.inferences],
      warnings: result.icms.warnings,
      errors: [],
      ...(req.options?.detailLevel === "FULL_TRACE" ? { trace: result.icms.trace } : {}),
    };
  }
}

function toTaxItem(tax: string, d: TaxDecision, regime: FiscalContext["regime"]): TaxItem {
  const appliedRules = d.appliedRule ? [`${d.appliedRule.id}@v${d.appliedRule.version}`] : [];
  const fc = fiscalCodeFor(tax as Parameters<typeof fiscalCodeFor>[0], d.outcome, regime);
  const fiscalCode = fc ? { kind: fc.kind, code: fc.code } : undefined;
  if (d.outcome.kind === "TAXED") {
    return {
      tax,
      outcome: "TAXED",
      basisCents: d.outcome.basisCents,
      rateBp: d.outcome.rateBp,
      amountCents: d.outcome.amountCents,
      legalBases: d.outcome.legalBasis ? [legalBasisToString(d.outcome.legalBasis)] : [],
      appliedRules,
      ...(fiscalCode ? { fiscalCode } : {}),
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
    ...(fiscalCode ? { fiscalCode } : {}),
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
  const message = (e as Error)?.message || String(e);
  return new BadGatewayException({ error: "INTERNAL", message });
}

export interface TaxItem {
  readonly tax: string;
  readonly outcome: string;
  /** CST/CSOSN derivado do outcome (emissão-grade); ausente quando não aplicável. */
  readonly fiscalCode?: { readonly kind: "CST" | "CSOSN"; readonly code: string };
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
  /** CFOP informado (respeitado como trava) ou inferido do contexto (com base declarada). */
  readonly cfop?: { readonly code: string; readonly basis: string; readonly review?: string };
  readonly items: readonly { readonly itemId: string; readonly taxes: readonly TaxItem[] }[];
  readonly totals: readonly { readonly tax: string; readonly amountCents?: number }[];
  readonly inferences: readonly Inference[];
  readonly warnings: readonly string[];
  readonly errors: readonly unknown[];
  readonly trace?: unknown;
}

@Module({
  controllers: [TaxDecisionsController],
  providers: [
    // ordem importa: 401 (key) antes de 429 (limite)
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class TaxDecisionsModule {}
