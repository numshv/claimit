/**
 * src/app/api/chat/route.ts
 *
 * Next.js App Router POST handler — entry point for the ClaimIt chat.
 *
 * Flow:
 *   1. Parse { message, history } from request body
 *   2. Convert history (ChatMessage[]) → LangChain BaseMessage[]
 *   3. Invoke claimItGraph with the full message list
 *   4. Return result.verdict as JSON
 *
 * result.verdict is one of:
 *   - string          → follow-up question from intakeNode (profile incomplete)
 *   - object          → RecommendationResponse JSON from synthesizerNode
 *   - null            → shouldn't happen in normal flow; treated as 500
 */

import { NextRequest, NextResponse } from "next/server";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { claimItGraph } from "@/lib/graph";
import type { ChatMessage } from "@/lib/types";

// Next.js route segment config:
// LangGraph + LLM calls can take >10s — opt out of the default 10s edge timeout.
export const maxDuration = 60; // seconds (requires Vercel Pro for >10s, fine for local dev)
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { history, message } = body as {
      history: ChatMessage[];
      message: string;
    };

    // ── Input validation ────────────────────────────────────────────────────
    if (typeof message !== "string" || message.trim() === "") {
      return NextResponse.json(
        { error: "Invalid message format." },
        { status: 400 }
      );
    }

    // ── Convert history to LangChain BaseMessage format ─────────────────────
    // The client sends { role: "user" | "assistant", content: string }[]
    // LangGraph nodes expect HumanMessage | AIMessage instances.
    const langchainHistory = (history ?? []).map((m: ChatMessage) =>
      m.role === "user"
        ? new HumanMessage(m.content)
        : new AIMessage(m.content)
    );

    // Append the new user message at the end of the history
    const allMessages = [...langchainHistory, new HumanMessage(message)];

    // ── Invoke the LangGraph pipeline ────────────────────────────────────────
    // The graph runs: intakeNode → (conditional) → retrievalNode → synthesizerNode
    // result.verdict is the final output written by whichever node terminated last.
    const result = await claimItGraph.invoke({
      messages: allMessages,
    });

    const verdict = result.verdict;

    if (verdict === null || verdict === undefined) {
      // This path should not be reached in normal operation
      console.error("[chat/route] Graph returned null verdict — unexpected state.");
      return NextResponse.json(
        { error: "An internal error occurred. Please try again." },
        { status: 500 }
      );
    }

    // page.tsx reads data.response as a string and calls tryParseRecommendations(text)
    // on it. That function JSON.parses the string to detect a RecommendationResponse.
    // We must always return a string — never a raw object — so React never tries to
    // render the object directly as a child.
    const responseText =
      typeof verdict === "string" ? verdict : JSON.stringify(verdict);

    return NextResponse.json({ response: responseText });

  } catch (err) {
    console.error("[chat/route] error:", err);

    // Preserve the 429 status from WaterfallLLM so the client can show
    // a "please wait" message instead of a generic error.
    const status =
      typeof err === "object" &&
      err !== null &&
      (err as { status?: number }).status === 429
        ? 429
        : 500;

    const errorMessage =
      status === 429
        ? "The AI is currently rate-limited. Please wait a moment and try again."
        : "Sorry, there was an error processing your request. Please try again.";

    return NextResponse.json({ error: errorMessage }, { status });
  }
}
