/**
 * src/app/api/ingest/route.ts
 *
 * GET /api/ingest
 *
 * Triggers the RAG ingestion pipeline and runs a smoke-test similarity search.
 * Use this endpoint to verify the vector store is working before testing the
 * full chat pipeline.
 *
 * Response shape:
 * {
 *   "status": "ok",
 *   "chunkCount": 42,
 *   "filesIndexed": ["id-pkh.md", "us-snap_food_stamps.md", ...],
 *   "smokeTest": {
 *     "query": "Who cannot apply?",
 *     "topResult": {
 *       "pageContent": "...",
 *       "metadata": { "source": "...", "h2": "3. Exclusions and Conflicts (CRITICAL)", ... },
 *       "score": 0.891
 *     }
 *   }
 * }
 */

import { NextResponse } from "next/server";
import { getVectorStore } from "@/lib/vectorstore";

// Force dynamic so Next.js doesn't try to statically generate this route.
// The vector store reads from the filesystem at request time.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // ── 1. Trigger ingestion (no-op on subsequent calls — singleton) ─────────
    console.log("[api/ingest] Building / returning singleton vector store...");
    const store = await getVectorStore();

    // ── 2. Collect the list of indexed source files for the response ─────────
    // We query with an intentionally broad phrase that will match the
    // "Exclusions" section of any program document — this validates that
    // the header splitter correctly produced those chunks.
    const SMOKE_QUERY = "Who cannot apply? Exclusions and disqualifications.";
    const topChunks = await store.similaritySearch(SMOKE_QUERY, 3);

    // ── 3. Return structured JSON ─────────────────────────────────────────────
    return NextResponse.json({
      status: "ok",
      message: "Vector store built successfully.",
      chunkCount: store.chunkCount,
      smokeTest: {
        query: SMOKE_QUERY,
        resultsReturned: topChunks.length,
        results: topChunks.map((chunk) => ({
          score: parseFloat(chunk.score.toFixed(4)),
          source: chunk.metadata.source,
          h1: chunk.metadata.h1 ?? null,
          h2: chunk.metadata.h2 ?? null,
          h3: chunk.metadata.h3 ?? null,
          country_code: chunk.metadata.country_code ?? null,
          program_id: chunk.metadata.program_id ?? null,
          preview: chunk.pageContent.slice(0, 300),
        })),
      },
    });

  } catch (err: unknown) {
    console.error("[api/ingest] Error during ingestion:", err);

    const message =
      err instanceof Error ? err.message : "Unknown error during ingestion.";

    const isConfigError =
      message.includes("HUGGINGFACE_API_KEY") ||
      message.includes("not set");

    return NextResponse.json(
      {
        status: "error",
        message,
        hint: isConfigError
          ? "Add HUGGINGFACE_API_KEY=hf_... to your .env.local file and restart the dev server."
          : "Check server logs for details.",
      },
      { status: isConfigError ? 400 : 500 }
    );
  }
}
