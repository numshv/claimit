/**
 * src/lib/graph/llm.ts
 *
 * Multi-Tier Fallback LLM Client for ClaimIt LangGraph nodes.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  WATERFALL PRIORITY                                                     │
 * │                                                                         │
 * │  Tier 1 — OpenRouter  (Gemini 1.5 Flash + 6 backup free models)        │
 * │      ↓  429 / 402 / timeout / all models exhausted                      │
 * │  Tier 2 — Google AI Studio  (Gemini 1.5 Flash, direct API)             │
 * │      ↓  any failure                                                     │
 * │  Tier 3 — Groq  (Llama 3 70B → Mixtral 8×7B → Llama 3 8B)            │
 * │      ↓  all fail                                                        │
 * │  throw CriticalLLMError                                                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Integration:
 *   Nodes import the module-level `llm` singleton and call:
 *
 *     const text = await llm.chat(messages);   // returns string
 *     const msg  = await llm.invoke(messages); // returns AIMessage
 *
 *   Neither claimItGraph.invoke() nor the individual node functions need
 *   to change — the fallback is fully encapsulated here.
 *
 * ENV VARS (in .env.local):
 *   OPENROUTER_API_KEY        — https://openrouter.ai/keys   (required for Tier 1)
 *   GOOGLE_AI_STUDIO_API_KEY  — https://aistudio.google.com  (required for Tier 2)
 *   GROQ_API_KEY              — https://console.groq.com     (required for Tier 3)
 *
 *   At least one tier must have a valid key or all requests will fail.
 */

import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessage } from "@langchain/core/messages";
import type { AIMessage } from "@langchain/core/messages";

// ---------------------------------------------------------------------------
// WaterfallLLM public interface
// (identical to the previous version — nodes don't need to change)
// ---------------------------------------------------------------------------

export interface WaterfallLLM {
  /** BaseChatModel-compatible invoke — used when you need the full AIMessage. */
  invoke(messages: BaseMessage[]): Promise<AIMessage>;
  /** Convenience method — invokes and extracts .content as a plain string. */
  chat(messages: BaseMessage[]): Promise<string>;
}

// ---------------------------------------------------------------------------
// Error classification helpers
// ---------------------------------------------------------------------------

/**
 * Returns true for transient / quota errors that should trigger a fallback
 * to the next tier. Returns false for bugs we should surface immediately.
 */
function isRetryableError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as Record<string, unknown>;

  // HTTP status codes
  const status = (e.status ?? e.statusCode) as number | undefined;
  if (status === 429 || status === 402 || status === 403) return true;

  // Node.js network errors
  const code = String(e.code ?? "");
  if (["ETIMEDOUT", "ECONNRESET", "ECONNABORTED", "ENOTFOUND"].includes(code)) return true;

  // Text-based fallback (catches wrapped errors)
  const msg = String(e.message ?? "").toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("quota") ||
    msg.includes("timeout") ||
    msg.includes("overloaded") ||
    msg.includes("429") ||
    msg.includes("403")
  );
}

// ---------------------------------------------------------------------------
// Tier 1 — OpenRouter (multi-model waterfall within the tier)
// ---------------------------------------------------------------------------

/** Free-tier OpenRouter models, ordered by capability. */
const OPENROUTER_MODELS = [
  "google/gemini-flash-1.5",          // Primary: Gemini 1.5 Flash via OpenRouter
  "openai/gpt-oss-120b",              // Fallback 1
  "google/gemma-4-31b-it",            // Fallback 2
  "meta-llama/llama-3.3-70b-instruct",// Fallback 3
  "nvidia/nemotron-3-ultra-550b-a55b",// Fallback 4
  "openai/gpt-oss-20b",               // Fallback 5
  "google/gemma-4-26b-a4b-it",        // Fallback 6
] as const;

function buildOpenRouterClient(model: string): ChatOpenAI {
  return new ChatOpenAI({
    model,
    apiKey: process.env.OPENROUTER_API_KEY!,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://claimit.vercel.app",
        "X-Title": "ClaimIt",
      },
    },
    temperature: 0.7,
    maxTokens: 2048,
    timeout: 30_000,
  });
}

/**
 * Attempts every OpenRouter model in sequence.
 * Returns the AIMessage on first success.
 * Throws if all models are rate-limited / fail.
 */
async function tryTier1(messages: BaseMessage[]): Promise<AIMessage> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("[Tier 1] OPENROUTER_API_KEY is not set — skipping.");

  let lastErr: unknown;
  for (const model of OPENROUTER_MODELS) {
    const client = buildOpenRouterClient(model);
    try {
      const result = await client.invoke(messages);
      console.log(`[llm] ✓ Tier 1 served by OpenRouter/${model}`);
      return result;
    } catch (err) {
      if (isRetryableError(err)) {
        console.warn(`[llm] ⚠ Tier 1 OpenRouter/${model} failed — trying next.`);
        lastErr = err;
        continue;
      }
      throw err; // non-retryable — bubble up immediately
    }
  }
  throw Object.assign(
    new Error("[Tier 1] All OpenRouter models exhausted."),
    { status: 429, cause: lastErr }
  );
}

// ---------------------------------------------------------------------------
// Tier 2 — Google AI Studio (direct, not via OpenRouter)
// ---------------------------------------------------------------------------

const GOOGLE_MODELS = [
  "gemini-1.5-flash",   // Primary
  "gemini-1.5-flash-8b",// Smaller/faster fallback
] as const;

async function tryTier2(messages: BaseMessage[]): Promise<AIMessage> {
  const key = process.env.GOOGLE_AI_STUDIO_API_KEY;
  if (!key) throw new Error("[Tier 2] GOOGLE_AI_STUDIO_API_KEY is not set — skipping.");

  let lastErr: unknown;
  for (const model of GOOGLE_MODELS) {
    const client = new ChatGoogleGenerativeAI({
      model,
      apiKey: key,
      temperature: 0.7,
      maxOutputTokens: 2048,
    });
    try {
      const result = await client.invoke(messages);
      console.log(`[llm] ✓ Tier 2 served by Google AI Studio / ${model}`);
      return result as AIMessage;
    } catch (err) {
      if (isRetryableError(err)) {
        console.warn(`[llm] ⚠ Tier 2 Google/${model} failed — trying next.`);
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw Object.assign(
    new Error("[Tier 2] Google AI Studio exhausted."),
    { status: 429, cause: lastErr }
  );
}

// ---------------------------------------------------------------------------
// Tier 3 — Groq (final safety net)
// ---------------------------------------------------------------------------

const GROQ_MODELS = [
  "llama-3.3-70b-versatile",  // Primary: Llama 3.3 70B
  "mixtral-8x7b-32768",       // Fallback: Mixtral 8×7B (long context)
  "llama3-8b-8192",           // Last resort: Llama 3 8B (fastest)
] as const;

async function tryTier3(messages: BaseMessage[]): Promise<AIMessage> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("[Tier 3] GROQ_API_KEY is not set — skipping.");

  let lastErr: unknown;
  for (const model of GROQ_MODELS) {
    const client = new ChatGroq({
      model,
      apiKey: key,
      temperature: 0.7,
      maxTokens: 2048,
      maxRetries: 0, // We handle retries ourselves
    });
    try {
      const result = await client.invoke(messages);
      console.log(`[llm] ✓ Tier 3 served by Groq / ${model}`);
      return result as AIMessage;
    } catch (err) {
      if (isRetryableError(err)) {
        console.warn(`[llm] ⚠ Tier 3 Groq/${model} failed — trying next.`);
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw Object.assign(
    new Error("[Tier 3] All Groq models exhausted."),
    { status: 429, cause: lastErr }
  );
}

// ---------------------------------------------------------------------------
// Core waterfall executor
// ---------------------------------------------------------------------------

/**
 * Runs the full 3-tier waterfall for a single invocation.
 * Each tier is only attempted if the previous one throws.
 */
async function waterfallInvoke(messages: BaseMessage[]): Promise<AIMessage> {
  const errors: string[] = [];

  // ── Tier 1: OpenRouter ───────────────────────────────────────────────────
  try {
    return await tryTier1(messages);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Tier 1 (OpenRouter): ${msg}`);
    console.warn("[llm] Tier 1 failed. Escalating to Tier 2 (Google AI Studio)...");
  }

  // ── Tier 2: Google AI Studio ─────────────────────────────────────────────
  try {
    return await tryTier2(messages);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Tier 2 (Google AI Studio): ${msg}`);
    console.warn("[llm] Tier 2 failed. Escalating to Tier 3 (Groq)...");
  }

  // ── Tier 3: Groq ─────────────────────────────────────────────────────────
  try {
    return await tryTier3(messages);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Tier 3 (Groq): ${msg}`);
  }

  // ── All tiers exhausted ───────────────────────────────────────────────────
  const summary = errors.join("\n  • ");
  console.error("[llm] ✗ CRITICAL: All LLM tiers failed:\n  •", summary);

  throw Object.assign(
    new Error(
      "All AI providers are currently unavailable. Please try again later.\n" +
      `Failures:\n  • ${summary}`
    ),
    { status: 503 }
  );
}

// ---------------------------------------------------------------------------
// Factory function & singleton export
// ---------------------------------------------------------------------------

/**
 * Returns a WaterfallLLM instance backed by the 3-tier fallback strategy.
 *
 * Use `createFallbackLLM()` if you need per-call configuration.
 * Use the `llm` singleton for everything else.
 */
export function createFallbackLLM(): WaterfallLLM {
  // Warn at startup if no keys are configured at all
  const hasAnyKey =
    process.env.OPENROUTER_API_KEY ||
    process.env.GOOGLE_AI_STUDIO_API_KEY ||
    process.env.GROQ_API_KEY;

  if (!hasAnyKey) {
    console.error(
      "[llm] WARNING: No LLM API keys detected. " +
      "Set at least one of OPENROUTER_API_KEY, GOOGLE_AI_STUDIO_API_KEY, or GROQ_API_KEY in .env.local."
    );
  }

  const invoke = (messages: BaseMessage[]): Promise<AIMessage> =>
    waterfallInvoke(messages);

  const chat = async (messages: BaseMessage[]): Promise<string> => {
    const result = await invoke(messages);
    return typeof result.content === "string"
      ? result.content
      : JSON.stringify(result.content);
  };

  return { invoke, chat };
}

/**
 * Module-level singleton — import this in graph nodes.
 *
 * Usage:
 *   import { llm } from "@/lib/graph/llm";
 *   const text = await llm.chat(messages);
 */
export const llm = createFallbackLLM();

// ---------------------------------------------------------------------------
// Re-export types for consumers
// ---------------------------------------------------------------------------
export type { BaseChatModel };
export { OPENROUTER_MODELS, GROQ_MODELS, GOOGLE_MODELS };
