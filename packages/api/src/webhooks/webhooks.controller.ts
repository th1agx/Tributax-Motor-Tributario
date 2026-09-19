import { Body, Controller, Get, Inject, Injectable, Module, Optional, Post, UseGuards } from "@nestjs/common";
import { BadRequestException } from "@nestjs/common";
import { createHmac, randomUUID } from "node:crypto";
import { AdminGuard } from "../auth/admin.guard.js";

/**
 * Webhooks (integração 5★): o cliente registra URLs e recebe eventos com
 * assinatura HMAC (TRIBUTAX_WEBHOOK_SECRET). Entrega é fire-and-forget —
 * falha de webhook nunca derruba a decisão fiscal; retry/fila persistente
 * é evolução quando houver SLA de entrega.
 *
 * Eventos: decision.created (decisão persistida), rule.proposal.created
 * (nova proposta no catálogo — inclusive AI_SUGGESTED).
 */

export type WebhookEvent = "decision.created" | "rule.proposal.created";

export interface WebhookSink {
  readonly id: string;
  readonly url: string;
  readonly events: readonly WebhookEvent[];
}

export interface WebhookRegistry {
  add(url: string, events: readonly WebhookEvent[]): Promise<WebhookSink>;
  list(): Promise<readonly WebhookSink[]>;
  emit(event: WebhookEvent, payload: unknown): Promise<readonly PromiseSettledResult<unknown>[]>;
}

@Injectable()
export class InMemoryWebhookRegistry implements WebhookRegistry {
  private readonly sinks: WebhookSink[] = [];
  private readonly fetchImpl: typeof fetch;

  constructor(fetchImpl: typeof fetch = fetch) {
    this.fetchImpl = fetchImpl;
  }

  async add(url: string, events: readonly WebhookEvent[]): Promise<WebhookSink> {
    if (!/^https?:\/\//.test(url)) {
      throw new BadRequestException({ error: "PAYLOAD_VALIDATION", message: "url deve ser http(s)" });
    }
    if (!events?.length) {
      throw new BadRequestException({ error: "PAYLOAD_VALIDATION", message: "informe ao menos 1 evento" });
    }
    const sink: WebhookSink = { id: randomUUID(), url, events: [...events] };
    this.sinks.push(sink);
    return sink;
  }

  async list(): Promise<readonly WebhookSink[]> {
    return [...this.sinks];
  }

  async emit(event: WebhookEvent, payload: unknown): Promise<readonly PromiseSettledResult<unknown>[]> {
    const body = JSON.stringify({ event, sentAt: new Date().toISOString(), data: payload });
    const secret = process.env.TRIBUTAX_WEBHOOK_SECRET ?? "";
    const signature = secret
      ? createHmac("sha256", secret).update(body).digest("hex")
      : "";

    const deliveries = this.sinks
      .filter((s) => s.events.includes(event))
      .map(async (s) =>
        this.fetchImpl(s.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-tributax-event": event,
            ...(signature ? { "x-tributax-signature": `sha256=${signature}` } : {}),
          },
          body,
          // quem consome webhook não pode pendurar a decisão fiscal
          signal: AbortSignal.timeout(5_000),
        }),
      );
    // falha de entrega é isolada — o chamador nunca espera nem sofre
    return Promise.allSettled(deliveries.map(async (d) => {
      const res = await d;
      if (!res.ok) throw new Error(`webhook HTTP ${res.status}`);
      return res.status;
    }));
  }
}

export const defaultWebhookRegistry = new InMemoryWebhookRegistry();
export const WEBHOOK_REGISTRY = "WEBHOOK_REGISTRY";

@Controller("/v1/webhooks")
@UseGuards(AdminGuard)
export class WebhooksController {
  private readonly registry: WebhookRegistry;

  constructor(@Optional() @Inject(WEBHOOK_REGISTRY) registry?: WebhookRegistry) {
    this.registry = registry ?? defaultWebhookRegistry;
  }

  @Post()
  async create(@Body() body: { url?: string; events?: readonly WebhookEvent[] }): Promise<WebhookSink> {
    if (!body?.url) {
      throw new BadRequestException({ error: "PAYLOAD_VALIDATION", message: "url é obrigatória" });
    }
    return this.registry.add(body.url, body.events ?? []);
  }

  @Get()
  async list(): Promise<readonly WebhookSink[]> {
    return this.registry.list();
  }
}

@Module({ controllers: [WebhooksController] })
export class WebhooksModule {}
