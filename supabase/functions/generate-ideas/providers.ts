import {
  extractResponseText,
  RESPONSE_SCHEMA,
  SYSTEM_PROMPT,
} from "./logic.ts";

export interface AIProvider {
  generate(prompt: string, signal: AbortSignal): Promise<string>;
}

export interface ProviderEnv {
  get(key: string): string | undefined;
}

export class ProviderHttpError extends Error {
  readonly status: number;
  readonly type: string | null;
  readonly code: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(
    status: number,
    { type = null, code = null, retryAfterSeconds = null }: {
      type?: string | null;
      code?: string | null;
      retryAfterSeconds?: number | null;
    } = {},
  ) {
    super(`AI provider returned HTTP ${status}.`);
    this.name = "ProviderHttpError";
    this.status = status;
    this.type = type;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ProviderConfigError extends Error {
  constructor() {
    super("AI provider is not configured.");
    this.name = "ProviderConfigError";
  }
}

const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizedErrorField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const sanitized = value.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 80);
  return sanitized || null;
}

function numericRetryAfter(value: string | null): number | null {
  if (!value || !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const seconds = Number(value.trim());
  return Number.isFinite(seconds) ? seconds : null;
}

function requiredSecret(env: ProviderEnv, key: string): string {
  return (env.get(key) || "").trim();
}

export function createGeminiProvider(
  env: ProviderEnv,
  fetchImpl: typeof fetch = fetch,
): AIProvider {
  const apiKey = requiredSecret(env, "GEMINI_API_KEY");
  const model = (env.get("GEMINI_MODEL") || "").trim() || DEFAULT_GEMINI_MODEL;
  const configuredBase = (env.get("GEMINI_API_BASE_URL") || "").trim() ||
    DEFAULT_GEMINI_BASE_URL;
  let baseUrl: string | null = null;

  try {
    const parsed = new URL(configuredBase);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      baseUrl = configuredBase.replace(/\/+$/, "");
    }
  } catch {
    baseUrl = null;
  }

  return {
    async generate(prompt, signal) {
      if (!apiKey || !baseUrl) throw new ProviderConfigError();

      const response = await fetchImpl(
        `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 8192,
              responseMimeType: "application/json",
              responseSchema: RESPONSE_SCHEMA,
            },
          }),
          signal,
        },
      );
      if (!response.ok) throw new ProviderHttpError(response.status);

      const data: unknown = await response.json().catch(() => null);
      return extractResponseText(data);
    },
  };
}

export function createOpenAIProvider(
  env: ProviderEnv,
  fetchImpl: typeof fetch = fetch,
): AIProvider {
  const apiKey = requiredSecret(env, "OPENAI_API_KEY");
  const model = (env.get("OPENAI_MODEL") || "").trim() || DEFAULT_OPENAI_MODEL;

  return {
    async generate(prompt, signal) {
      if (!apiKey) throw new ProviderConfigError();

      const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
          max_completion_tokens: 8192,
        }),
        signal,
      });
      if (!response.ok) {
        if (response.status !== 429) throw new ProviderHttpError(response.status);

        const data: unknown = await response.json().catch(() => null);
        const error = isRecord(data) && isRecord(data.error) ? data.error : {};
        throw new ProviderHttpError(response.status, {
          type: sanitizedErrorField(error.type),
          code: sanitizedErrorField(error.code),
          retryAfterSeconds: numericRetryAfter(response.headers.get("Retry-After")),
        });
      }

      const data: unknown = await response.json().catch(() => null);
      if (!data || typeof data !== "object" || !("choices" in data) ||
        !Array.isArray(data.choices)) return "";
      const message = data.choices[0]?.message;
      return message && typeof message.content === "string" ? message.content : "";
    },
  };
}

export function createGroqProvider(
  env: ProviderEnv,
  fetchImpl: typeof fetch = fetch,
): AIProvider {
  const apiKey = requiredSecret(env, "GROQ_API_KEY");
  const model = (env.get("GROQ_MODEL") || "").trim() || DEFAULT_GROQ_MODEL;

  return {
    async generate(prompt, signal) {
      if (!apiKey) throw new ProviderConfigError();

      const response = await fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
          max_completion_tokens: 8192,
        }),
        signal,
      });
      if (!response.ok) {
        if (response.status !== 429) throw new ProviderHttpError(response.status);

        const data: unknown = await response.json().catch(() => null);
        const error = isRecord(data) && isRecord(data.error) ? data.error : {};
        throw new ProviderHttpError(response.status, {
          type: sanitizedErrorField(error.type),
          code: sanitizedErrorField(error.code),
          retryAfterSeconds: numericRetryAfter(response.headers.get("Retry-After")),
        });
      }

      const data: unknown = await response.json().catch(() => null);
      if (!data || typeof data !== "object" || !("choices" in data) ||
        !Array.isArray(data.choices)) return "";
      const message = data.choices[0]?.message;
      return message && typeof message.content === "string" ? message.content : "";
    },
  };
}
