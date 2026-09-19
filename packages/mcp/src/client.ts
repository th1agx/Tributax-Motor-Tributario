/**
 * Cliente REST mínimo do Tributax — o servidor MCP é apenas um adapter de
 * protocolo: TODA a lógica continua na API. Isso mantém o MCP sem estado,
 * sem acesso a banco e automaticamente consistente com o contrato /v1.
 */

export interface TributaxApiOptions {
  readonly apiUrl?: string;
  readonly apiKey?: string;
  readonly fetchImpl?: typeof fetch;
}

export class TributaxApi {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: TributaxApiOptions = {}) {
    this.baseUrl = (opts.apiUrl ?? process.env.TRIBUTAX_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
    this.apiKey = opts.apiKey ?? process.env.TRIBUTAX_API_KEY ?? "";
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** Simulação: calcula sem persistir (leitura segura para agentes). */
  simulate(payload: unknown): Promise<unknown> {
    return this.json("POST", "/v1/tax-simulations", payload);
  }

  /** Decisão: calcula e persiste com trace auditável. */
  decide(payload: unknown): Promise<unknown> {
    return this.json("POST", "/v1/tax-decisions", payload, 201);
  }

  /** Catálogo de regras (ativo por padrão). */
  rules(): Promise<unknown> {
    return this.json("GET", "/v1/rules");
  }

  private async json(method: string, path: string, body?: unknown, expect = 200): Promise<unknown> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (err) {
      throw new Error(`Tributax API indisponível em ${this.baseUrl} — ${(err as Error).message}`);
    }
    if (!res.ok && res.status !== expect) {
      throw new Error(`Tributax API HTTP ${res.status} em ${path}: ${await res.text()}`);
    }
    return res.json();
  }
}
