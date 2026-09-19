/**
 * SDK TypeScript do Tributax — tipos espelham docs/openapi.yaml (contrato).
 * Zero dependências: fetch nativo (Node 22+ / browsers).
 *
 *   const tributax = new TributaxClient({ apiKey: "tk_..." });
 *   const decisao = await tributax.decide({
 *     correlationId: "ped-1234",
 *     idempotencyKey: "ped-1234-v1",
 *     items: [{ description: "Produto", unitPrice: { amount: 100000 } }],
 *   });
 */

export interface SdkOptions {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  /** Retries com backoff exponencial em 5xx/erro de rede (default 2). */
  readonly maxRetries?: number;
  readonly fetchImpl?: typeof fetch;
}

export class TributaxApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body?: unknown,
  ) {
    super(`[${status} ${code}] ${message}`);
    this.name = "TributaxApiError";
  }
}

/** Espelho tipado do payload-spec (centavos inteiros, basis points). */
export interface TaxCalculationRequest {
  readonly correlationId: string;
  readonly asOfDate?: string;
  readonly context?: {
    readonly issuer?: {
      readonly partyRef?: string;
      readonly rbt12Cents?: number;
      readonly address?: { readonly cityIbgeCode?: string; readonly city?: string };
    };
    readonly recipient?: {
      readonly partyRef?: string;
      readonly role?: "CONTRIBUTOR" | "NON_CONTRIBUTOR" | "FINAL_CONSUMER" | "AUTO";
      readonly address?: { readonly country?: string; readonly state?: string; readonly city?: string };
    };
  };
  readonly operation?: {
    readonly kind?:
      | "SALE_GOODS" | "SERVICE_PROVISION" | "TRANSFER" | "REMITTANCE" | "RENTAL"
      | "IMPORT" | "EXPORT" | "CONSUMPTION_ASSET" | "AUTO";
    readonly fiscalDocumentType?: "NFE" | "NFCE" | "NFSE" | "NONE" | "AUTO";
    readonly cfop?: string;
  };
  readonly items: readonly {
    readonly id?: string | number;
    readonly description?: string;
    readonly quantity?: number;
    readonly unitPrice?: { readonly amount: number; readonly currency?: string };
    readonly classification?: {
      readonly ncm?: string;
      readonly cest?: string;
      readonly serviceCode?: string;
    };
    readonly deductions?: readonly { readonly amount?: number }[];
    readonly discounts?: readonly { readonly amount?: number }[];
  }[];
}

export interface TaxItem {
  readonly tax: string;
  readonly outcome: string;
  readonly basisCents?: number;
  readonly rateBp?: number;
  readonly amountCents?: number;
  readonly fiscalCode?: { readonly kind: "CST" | "CSOSN"; readonly code: string };
  readonly legalBases: readonly string[];
  readonly appliedRules: readonly string[];
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
  readonly cfop?: { readonly code: string; readonly basis: string; readonly review?: string };
  readonly items: readonly { readonly itemId: string; readonly taxes: readonly TaxItem[] }[];
  readonly totals: readonly { readonly tax: string; readonly amountCents?: number }[];
  readonly warnings: readonly string[];
}

export interface DecideOptions {
  /** Retry de rede no cliente não duplica decisão (x-idempotency-key). */
  readonly idempotencyKey?: string;
}

export class TributaxClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: SdkOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.TRIBUTAX_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
    this.apiKey = opts.apiKey ?? process.env.TRIBUTAX_API_KEY ?? "";
    this.maxRetries = opts.maxRetries ?? 2;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** Simula sem persistir — seguro para hipóteses e agentes. */
  simulate(req: TaxCalculationRequest): Promise<TaxCalculationResponse> {
    return this.json<TaxCalculationResponse>("POST", "/v1/tax-simulations", req);
  }

  /** Decide e persiste com trace; aceita idempotencyKey anti-duplicação. */
  decide(req: TaxCalculationRequest, opts: DecideOptions = {}): Promise<TaxCalculationResponse> {
    return this.json<TaxCalculationResponse>("POST", "/v1/tax-decisions", req, 201, opts.idempotencyKey);
  }

  getDecision(decisionId: string): Promise<TaxCalculationResponse> {
    return this.json<TaxCalculationResponse>("GET", `/v1/tax-decisions/${decisionId}`);
  }

  listRules(): Promise<unknown> {
    return this.json<unknown>("GET", "/v1/rules");
  }

  private async json<T>(
    method: string,
    path: string,
    body?: unknown,
    expect = 200,
    idempotencyKey?: string,
  ): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.apiKey) headers["x-api-key"] = this.apiKey;
    if (idempotencyKey) headers["x-idempotency-key"] = idempotencyKey;

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method,
          headers,
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        if (res.ok || res.status === expect) return (await res.json()) as T;
        // 4xx não tenta de novo: erro do chamador, não transitório
        if (res.status < 500) {
          const errBody = (await res.json().catch(() => undefined)) as { error?: string; message?: string } | undefined;
          throw new TributaxApiError(
            res.status,
            errBody?.error ?? "UNKNOWN",
            errBody?.message ?? (await res.text()),
            errBody,
          );
        }
        lastError = new TributaxApiError(res.status, "UPSTREAM", `HTTP ${res.status}`);
      } catch (e) {
        if (e instanceof TributaxApiError && e.status < 500) throw e;
        lastError = e;
      }
      if (attempt < this.maxRetries) {
        await new Promise((r) => setTimeout(r, 2 ** attempt * 200));
      }
    }
    throw lastError instanceof Error ? lastError : new TributaxApiError(0, "NETWORK", String(lastError));
  }
}
