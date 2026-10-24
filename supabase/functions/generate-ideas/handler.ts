// HTTP boundary for the generate-ideas Edge Function.
//
// Provider API keys are read from Edge Function secrets and never exposed to
// callers or included in logs.

import {
  buildPrompt,
  MAX_BODY_BYTES,
  normalizeBrief,
  parseIdeas,
} from "./logic.ts";
import {
  createGroqProvider,
  ProviderConfigError,
  ProviderHttpError,
} from "./providers.ts";

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_TOTAL_REQUEST_MS = 25_000;
const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY_MS = 250;
const RETRYABLE_STATUSES = new Set([408, 429, 503, 504]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export interface FunctionEnv {
  get(key: string): string | undefined;
}

function jsonResponse(
  status: number,
  payload: Record<string, unknown>,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

function readTimeout(env: FunctionEnv): number {
  const configuredTimeout = Number.parseInt(env.get("AI_PROVIDER_TIMEOUT_MS") || "", 10);
  return Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? Math.max(10, configuredTimeout)
    : DEFAULT_TIMEOUT_MS;
}

function providerErrorCategory(status: number): string {
  if (status === 401 || status === 403) return "authentication";
  if (status === 404) return "model_or_endpoint_not_found";
  if (status === 429) return "rate_limited";
  if (status === 503) return "upstream_unavailable";
  if (status >= 500) return "upstream_error";
  return "request_rejected";
}

export async function handleRequest(
  req: Request,
  env: FunctionEnv = Deno.env,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Use POST for this function." }, { Allow: "POST" });
  }

  const contentType = req.headers.get("content-type") || "";
  if (!/^application\/json\b/i.test(contentType)) {
    return jsonResponse(415, { error: "Send the brief as application/json." });
  }

  const declaredLength = Number.parseInt(req.headers.get("content-length") || "", 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: "The brief is too large." });
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return jsonResponse(400, { error: "The brief could not be read." });
  }

  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: "The brief is too large." });
  }
  if (!raw.trim()) {
    return jsonResponse(400, { error: "Send a JSON brief." });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return jsonResponse(400, { error: "The brief must be valid JSON." });
  }

  const normalized = normalizeBrief(payload);
  if ("error" in normalized) {
    return jsonResponse(400, { error: normalized.error });
  }
  const brief = normalized.brief;

  const timeoutMs = readTimeout(env);
  const provider = createGroqProvider(env, fetchImpl);
  const deadline = Date.now() + MAX_TOTAL_REQUEST_MS;
  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        return jsonResponse(502, { error: "The idea service is unavailable right now. Try again." });
      }

      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        Math.min(timeoutMs, remainingMs),
      );
      try {
        let responseText: string;
        try {
          responseText = await provider.generate(buildPrompt(brief), controller.signal);
        } catch (error) {
          if (error instanceof ProviderConfigError) {
            console.error("[generate-ideas] Groq provider is not configured.");
            return jsonResponse(503, {
              error: "The idea generator isn't configured on the server yet.",
            });
          }
          if (
            error instanceof ProviderHttpError &&
            RETRYABLE_STATUSES.has(error.status) &&
            attempt < MAX_RETRIES
          ) {
            const delayMs = INITIAL_RETRY_DELAY_MS * (2 ** attempt);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue;
          }
          if (error instanceof ProviderHttpError) {
            if (error.status === 429) {
              console.error(
                `[generate-ideas] Groq HTTP 429 (rate_limited) ${
                  JSON.stringify({
                    type: error.type,
                    code: error.code,
                    retry_after_seconds: error.retryAfterSeconds,
                  })
                }.`,
              );
            } else {
              console.error(
                `[generate-ideas] Groq HTTP ${error.status} (${providerErrorCategory(error.status)}).`,
              );
            }
            if (error.status === 401 || error.status === 403) {
              return jsonResponse(503, {
                error: "The idea generator isn't configured on the server yet.",
              });
            }
            return jsonResponse(502, {
              error: "The idea service is unavailable right now. Try again.",
            });
          }
          throw error;
        }

        const ideas = parseIdeas(responseText);
        if (!ideas) {
          console.error("[generate-ideas] Groq returned unusable content.");
          return jsonResponse(502, {
            error: "The idea service returned an unexpected response. Try again.",
          });
        }

        return jsonResponse(200, { ideas });
      } finally {
        clearTimeout(timer);
      }
    }

    return jsonResponse(502, { error: "The idea service is unavailable right now. Try again." });
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") {
      console.error(`[generate-ideas] Groq timed out after ${timeoutMs}ms.`);
      return jsonResponse(504, { error: "The idea service took too long. Try again." });
    }
    // Never surface provider URLs, bodies, or credentials to the client.
    console.error(`[generate-ideas] Groq request failed (${(error as { name?: string })?.name || "error"}).`);
    return jsonResponse(502, { error: "The idea service is unavailable right now. Try again." });
  }
}
