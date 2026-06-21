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
  // 404 = model not found on this provider (retryable — try next model/tier)
  // 429 = rate limit, 402 = payment/quota, 403 = access denied
  if (status === 404 || status === 429 || status === 402 || status === 403) return true;

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
    msg.includes("not found") ||       // model removed / wrong ID
    msg.includes("no endpoints found") ||  // OpenRouter: no provider for model
    msg.includes("decommissioned") ||  // Groq: model retired
    msg.includes("429") ||
    msg.includes("403")
  );
}

// ---------------------------------------------------------------------------
// Tier 1 — OpenRouter (multi-model waterfall within the tier)
// ---------------------------------------------------------------------------

/** Primary model for Tier 1 — single attempt, fail fast. */
const OPENROUTER_PRIMARY = "google/gemini-flash-1.5:free";

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
    timeout: 8_000,   // fail fast — if tier 1 is unreachable, escalate immediately
  });
}

/**
 * Tier 1 — single attempt on the primary OpenRouter model.
 * Any failure (rate-limit, 404, timeout, etc.) escalates to Tier 2.
 */
async function tryTier1(messages: BaseMessage[]): Promise<AIMessage> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("[Tier 1] OPENROUTER_API_KEY is not set — skipping.");

  const client = buildOpenRouterClient(OPENROUTER_PRIMARY);
  const result = await client.invoke(messages);
  console.log(`[llm] ✓ Tier 1 served by OpenRouter/${OPENROUTER_PRIMARY}`);
  return result;
}

// ---------------------------------------------------------------------------
// Tier 2 — Google AI Studio (direct, not via OpenRouter)
// ---------------------------------------------------------------------------

/** Primary model for Tier 2. */
const GOOGLE_PRIMARY = "gemini-2.0-flash";

/**
 * Tier 2 — single attempt on Google AI Studio.
 * Any failure escalates to Tier 3.
 */
async function tryTier2(messages: BaseMessage[]): Promise<AIMessage> {
  const key = process.env.GOOGLE_AI_STUDIO_API_KEY;
  if (!key) throw new Error("[Tier 2] GOOGLE_AI_STUDIO_API_KEY is not set — skipping.");

  const client = new ChatGoogleGenerativeAI({
    model: GOOGLE_PRIMARY,
    apiKey: key,
    temperature: 0.7,
    maxOutputTokens: 2048,
  });

  // AbortSignal.timeout ensures we don't hang indefinitely if Google is slow
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000); // 20s hard limit
  try {
    const result = await client.invoke(messages, { signal: controller.signal });
    console.log(`[llm] ✓ Tier 2 served by Google AI Studio / ${GOOGLE_PRIMARY}`);
    return result as AIMessage;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Tier 3 — Groq (final safety net)
// ---------------------------------------------------------------------------

/** Primary model for Tier 3. */
const GROQ_PRIMARY = "llama-3.3-70b-versatile";

/**
 * Tier 3 — single attempt on Groq.
 * Final safety net — any failure → critical error.
 */
async function tryTier3(messages: BaseMessage[]): Promise<AIMessage> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("[Tier 3] GROQ_API_KEY is not set — skipping.");

  const client = new ChatGroq({
    model: GROQ_PRIMARY,
    apiKey: key,
    temperature: 0.7,
    maxTokens: 2048,
    maxRetries: 0,
  });
  const result = await client.invoke(messages);
  console.log(`[llm] ✓ Tier 3 served by Groq / ${GROQ_PRIMARY}`);
  return result as AIMessage;
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
export { OPENROUTER_PRIMARY, GOOGLE_PRIMARY, GROQ_PRIMARY };

