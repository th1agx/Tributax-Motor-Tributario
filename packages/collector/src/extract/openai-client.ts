import type { LlmClient } from "./observation-extractor.js";

/**
 * Adapter LLM OpenAI-compatível (chat/completions com response_format json).
 * Sem SDK: fetch nativo, config via env — trocar fornecedor é trocar adapter.
 */
export class OpenAiChatClient implements LlmClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: { baseUrl?: string; apiKey?: string; model?: string; fetchImpl?: typeof fetch } = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
    this.apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    this.model = opts.model ?? process.env.LLM_MODEL ?? "gpt-4o-mini";
    this.fetchImpl = opts.fetchImpl ?? fetch;
    if (!this.apiKey) throw new Error("OpenAiChatClient: OPENAI_API_KEY ausente");
  }

  async completeJson(prompt: string): Promise<unknown> {
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    });
    if (!res.ok) throw new Error(`LLM: HTTP ${res.status} — ${await res.text()}`);
    const body = (await res.json()) as { choices?: readonly { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM: resposta sem conteúdo");
    // o modelo pode devolver {"observations": [...]} apesar do prompt pedir array
    const parsed: unknown = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
      const arr = (parsed as Record<string, unknown>).observations;
      if (Array.isArray(arr)) return arr;
    }
    return [parsed];
  }
}
