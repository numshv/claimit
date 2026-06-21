/**
 * src/lib/vectorstore.ts
 *
 * Singleton MemoryVectorStore that ingests all .md files from /data/programs.
 *
 * Architecture:
 *   1. readProgramFiles()       — reads every .md from /data/programs at runtime
 *   2. parseFrontmatter()       — extracts YAML metadata (program_id, country_code, etc.)
 *   3. splitByMarkdownHeaders() — MarkdownHeaderTextSplitter (custom, inline impl)
 *                                 Each H1/H2/H3 section becomes a separate chunk.
 *                                 Headers become chunk metadata for precise retrieval.
 *   4. embedChunks()            — batches all pageContent strings through HF Inference API
 *                                 using "sentence-transformers/all-MiniLM-L6-v2" (384-dim)
 *   5. getVectorStore()         — builds the index once, returns a similaritySearch() handle
 *
 * Why not @langchain/community MemoryVectorStore?
 *   @langchain/community was archived in May 2026. We use @huggingface/inference
 *   directly (official SDK, stable) with inline cosine similarity — no extra deps.
 *
 * Why not MarkdownHeaderTextSplitter from @langchain/textsplitters?
 *   It exports only: CharacterTextSplitter, MarkdownTextSplitter,
 *   RecursiveCharacterTextSplitter, TextSplitter, TokenTextSplitter.
 *   MarkdownHeaderTextSplitter is absent. We implement the same logic here.
 *
 * ENV VARS:
 *   HUGGINGFACE_API_KEY  — free read-only token from huggingface.co/settings/tokens
 *
 * MIGRATION PATH → PRODUCTION:
 *   Swap getIndex() to query Supabase pgvector or Pinecone.
 *   The getVectorStore() / similaritySearch() surface stays identical.
 */

import fs from "fs";
import path from "path";
import { HfInference } from "@huggingface/inference";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Metadata extracted from YAML frontmatter + header hierarchy. */
export interface ChunkMetadata {
  source: string;          // filename, e.g. "id-pkh.md"
  program_id?: string;     // from frontmatter
  country_code?: string;   // from frontmatter
  category?: string;       // from frontmatter
  target_audience?: string;// from frontmatter
  h1?: string;             // # heading the chunk lives under
  h2?: string;             // ## heading the chunk lives under
  h3?: string;             // ### heading the chunk lives under
}

/** A single text chunk with its source metadata — mirrors LangChain's Document. */
export interface DocumentChunk {
  pageContent: string;
  metadata: ChunkMetadata;
}

/** The vector store handle returned by getVectorStore(). */
export interface VectorStore {
  /** Semantic similarity search. Returns top-k chunks most relevant to query. */
  similaritySearch(query: string, k?: number): Promise<ScoredChunk[]>;
  /** Total number of indexed chunks. */
  readonly chunkCount: number;
}

export interface ScoredChunk extends DocumentChunk {
  score: number; // cosine similarity (0–1, higher is better)
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2";
const PROGRAMS_DIR = path.join(process.cwd(), "data", "programs");

// HuggingFace Inference API embedding batch limit
const EMBED_BATCH_SIZE = 32;

// ---------------------------------------------------------------------------
// HuggingFace client
// ---------------------------------------------------------------------------

function getHfClient(): HfInference {
  // Accept either naming convention:
  //   HUGGINGFACE_API_KEY     — official @huggingface/inference SDK convention
  //   HUGGINGFACEHUB_API_KEY  — older HuggingFace Hub convention (also common)
  const apiKey =
    process.env.HUGGINGFACE_API_KEY ??
    process.env.HUGGINGFACEHUB_API_KEY;

  if (!apiKey) {
    throw new Error(
      "[vectorstore] HuggingFace API key is not set.\n" +
      "Add one of the following to your .env.local and restart the dev server:\n" +
      "  HUGGINGFACE_API_KEY=hf_...\n" +
      "  HUGGINGFACEHUB_API_KEY=hf_...\n" +
      "Get a free read-only token at: https://huggingface.co/settings/tokens"
    );
  }
  return new HfInference(apiKey);
}

// ---------------------------------------------------------------------------
// Step 1 — File reading
// ---------------------------------------------------------------------------

/** Returns the full text content of every .md file in /data/programs. */
function readProgramFiles(): Array<{ filename: string; content: string }> {
  if (!fs.existsSync(PROGRAMS_DIR)) {
    console.warn(`[vectorstore] Directory not found: ${PROGRAMS_DIR}`);
    return [];
  }

  return fs
    .readdirSync(PROGRAMS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((filename) => ({
      filename,
      content: fs.readFileSync(path.join(PROGRAMS_DIR, filename), "utf-8"),
    }));
}

// ---------------------------------------------------------------------------
// Step 2 — YAML frontmatter parser
// ---------------------------------------------------------------------------

/**
 * Extracts key-value pairs from a --- delimited YAML frontmatter block.
 * Handles quoted string values and plain values.
 * Does NOT parse arrays or nested objects (not needed for our schema).
 */
function parseFrontmatter(content: string): {
  metadata: Record<string, string>;
  body: string;
} {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { metadata: {}, body: content };
  }

  const rawYaml = match[1];
  const body = content.slice(match[0].length);

  const metadata: Record<string, string> = {};
  for (const line of rawYaml.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1).trim();
    // Strip surrounding quotes if present
    const value = rawValue.replace(/^["']|["']$/g, "");
    if (key && value) metadata[key] = value;
  }

  return { metadata, body };
}

// ---------------------------------------------------------------------------
// Step 3 — MarkdownHeaderTextSplitter (inline implementation)
//
// Splits a markdown document into chunks at H1 (#), H2 (##), H3 (###) boundaries.
// Each chunk contains the heading text + all content until the next same-level
// or higher-level heading. Headers are stored as metadata, not page content.
//
// Example for:
//   # SNAP
//   ## 3. Exclusions (CRITICAL)
//   - Who cannot apply: undocumented immigrants...
//
// Produces chunk:
//   pageContent: "- Who cannot apply: undocumented immigrants..."
//   metadata: { h1: "SNAP", h2: "3. Exclusions (CRITICAL)" }
// ---------------------------------------------------------------------------

function splitByMarkdownHeaders(
  body: string,
  baseMetadata: Record<string, string>,
  filename: string
): DocumentChunk[] {
  const lines = body.split("\n");
  const chunks: DocumentChunk[] = [];

  // Current header state
  let h1 = "";
  let h2 = "";
  let h3 = "";
  let buffer: string[] = [];

  function flushBuffer() {
    const text = buffer.join("\n").trim();
    if (text.length < 20) return; // skip near-empty sections

    chunks.push({
      pageContent: text,
      metadata: {
        source: filename,
        program_id: baseMetadata.program_id,
        country_code: baseMetadata.country_code,
        category: baseMetadata.category,
        target_audience: baseMetadata.target_audience,
        ...(h1 ? { h1 } : {}),
        ...(h2 ? { h2 } : {}),
        ...(h3 ? { h3 } : {}),
      },
    });

    buffer = [];
  }

  for (const line of lines) {
    // H3 heading: ### ...
    if (/^### /.test(line)) {
      flushBuffer();
      h3 = line.replace(/^### /, "").trim();
      continue;
    }
    // H2 heading: ## ...
    if (/^## /.test(line)) {
      flushBuffer();
      h2 = line.replace(/^## /, "").trim();
      h3 = ""; // reset h3 on new h2
      continue;
    }
    // H1 heading: # ...
    if (/^# /.test(line)) {
      flushBuffer();
      h1 = line.replace(/^# /, "").trim();
      h2 = "";
      h3 = "";
      continue;
    }

    buffer.push(line);
  }

  flushBuffer(); // flush whatever remains after the last heading
  return chunks;
}

// ---------------------------------------------------------------------------
// Step 4 — Embedding
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Embeds an array of text strings in batches.
 * HF featureExtraction returns number[][] when given string[].
 */
async function embedTexts(
  hf: HfInference,
  texts: string[]
): Promise<number[][]> {
  const all: number[][] = [];

  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const result = await hf.featureExtraction({
      model: EMBEDDING_MODEL,
      inputs: batch,
    });
    // result is number[][] for array inputs
    const vectors = result as number[][];
    all.push(...vectors);
  }

  return all;
}

// ---------------------------------------------------------------------------
// Step 5 — Singleton store
// ---------------------------------------------------------------------------

interface IndexedChunk {
  chunk: DocumentChunk;
  embedding: number[];
}

let _index: IndexedChunk[] | null = null;
let _buildPromise: Promise<IndexedChunk[]> | null = null;

async function buildIndex(): Promise<IndexedChunk[]> {
  const hf = getHfClient();
  const files = readProgramFiles();

  if (files.length === 0) {
    console.warn("[vectorstore] No .md files found in data/programs/. Index is empty.");
    return [];
  }

  // Parse and chunk every file
  const allChunks: DocumentChunk[] = [];
  for (const { filename, content } of files) {
    const { metadata: frontmatter, body } = parseFrontmatter(content);
    const chunks = splitByMarkdownHeaders(body, frontmatter, filename);
    allChunks.push(...chunks);
    console.log(`[vectorstore] ${filename}: ${chunks.length} chunks`);
  }

  console.log(`[vectorstore] Embedding ${allChunks.length} total chunks...`);
  const texts = allChunks.map((c) => c.pageContent);
  const embeddings = await embedTexts(hf, texts);

  const index: IndexedChunk[] = allChunks.map((chunk, i) => ({
    chunk,
    embedding: embeddings[i],
  }));

  console.log(`[vectorstore] ✓ Index built — ${index.length} chunks indexed from ${files.length} files.`);
  return index;
}

async function getIndex(): Promise<IndexedChunk[]> {
  if (_index) return _index;
  if (_buildPromise) return _buildPromise;
  _buildPromise = buildIndex().then((idx) => {
    _index = idx;
    return idx;
  });
  return _buildPromise;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the singleton VectorStore, building the index from /data/programs
 * on first call. Subsequent calls return the cached instance immediately.
 *
 * Usage in API routes:
 *
 *   import { getVectorStore } from "@/lib/vectorstore";
 *
 *   const store = await getVectorStore();
 *   const results = await store.similaritySearch("Who cannot apply?", 3);
 */
export async function getVectorStore(): Promise<VectorStore> {
  const index = await getIndex();
  const hf = getHfClient();

  const similaritySearch = async (
    query: string,
    k = 4
  ): Promise<ScoredChunk[]> => {
    if (index.length === 0) return [];

    // Embed the query with the same model used for document chunks
    const rawEmbedding = await hf.featureExtraction({
      model: EMBEDDING_MODEL,
      inputs: query,
    });
    const queryVec = rawEmbedding as number[];

    // Score every chunk
    const scored = index.map(({ chunk, embedding }) => ({
      ...chunk,
      score: cosineSimilarity(queryVec, embedding),
    }));

    // Sort by score descending, return top-k
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  };

  return {
    similaritySearch,
    get chunkCount() {
      return index.length;
    },
  };
}

/**
 * Invalidates the index — use this if you add new .md files at runtime
 * and want to force a re-ingest without restarting the server.
 *
 * Call from: POST /api/admin/reindex  (protect with auth in production!)
 */
export async function invalidateIndex(): Promise<void> {
  _index = null;
  _buildPromise = null;
  console.log("[vectorstore] Index invalidated. Will rebuild on next request.");
}
