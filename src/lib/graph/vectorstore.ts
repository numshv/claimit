/**
 * src/lib/graph/vectorstore.ts
 *
 * Self-contained semantic vector store for hackathon prototyping.
 *
 * Stack:
 *   - @huggingface/inference  — official HF SDK, stable and not deprecated
 *   - Cosine similarity       — implemented inline, no extra deps
 *   - Module-level singleton  — embeddings built once, reused across requests
 *
 * Why not @langchain/community MemoryVectorStore?
 *   @langchain/community was archived in May 2026. The recommended path is to
 *   use provider SDKs directly, which is what this file does.
 *
 * ---------------------------------------------------------------------------
 * HOW TO ACTIVATE IN retrievalNode
 * ---------------------------------------------------------------------------
 * In nodes.ts, replace the deterministic filter block with:
 *
 *   import { retrieveForProfile } from "@/lib/graph/vectorstore";
 *   // ...
 *   export async function retrievalNode(state: AgentState): Promise<Partial<AgentState>> {
 *     const chunks = await retrieveForProfile(state.profile, 4);
 *     return { ragContext: chunks };
 *   }
 *
 * ---------------------------------------------------------------------------
 * ENV VARS REQUIRED
 * ---------------------------------------------------------------------------
 *   HUGGINGFACE_API_KEY   — free read-only token at huggingface.co/settings/tokens
 *
 * Add to .env.local:
 *   HUGGINGFACE_API_KEY=hf_...
 * Add to .env.example:
 *   HUGGINGFACE_API_KEY=hf_your_token_here
 *
 * ---------------------------------------------------------------------------
 * MIGRATION PATH → PRODUCTION
 * ---------------------------------------------------------------------------
 * Swap getStore() to use Supabase pgvector or Pinecone. The retrieveForProfile()
 * signature stays identical — no other files change.
 */

import { HfInference } from "@huggingface/inference";
import type { UserProfile, ProgramDoc } from "./state";

// ---------------------------------------------------------------------------
// Embedding model
// "sentence-transformers/all-MiniLM-L6-v2" — 384-dim, fast, free on HF API
// ---------------------------------------------------------------------------

const EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2";

function getHfClient(): HfInference {
  // Accept either naming convention — both are in common use.
  //   HUGGINGFACE_API_KEY     — official @huggingface/inference SDK name
  //   HUGGINGFACEHUB_API_KEY  — older HuggingFace Hub convention
  const apiKey =
    process.env.HUGGINGFACE_API_KEY ??
    process.env.HUGGINGFACEHUB_API_KEY;

  if (!apiKey) {
    throw new Error(
      "[vectorstore] HuggingFace API key is not set.\n" +
        "Add one of the following to .env.local and restart the server:\n" +
        "  HUGGINGFACE_API_KEY=hf_...\n" +
        "  HUGGINGFACEHUB_API_KEY=hf_..."
    );
  }
  return new HfInference(apiKey);
}

// ---------------------------------------------------------------------------
// Cosine similarity — no external deps
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ---------------------------------------------------------------------------
// Programs corpus
// Each ProgramDoc becomes an embedded entry in the in-memory store.
// ---------------------------------------------------------------------------

export const PROGRAMS_CORPUS: ProgramDoc[] = [
  // ── Indonesia ─────────────────────────────────────────────────────────────
  {
    id: "id-bpjs-pbi",
    name: "BPJS Kesehatan PBI",
    country: "indonesia",
    primaryNeed: "health",
    eligibility: "Registered in DTKS (Data Terpadu Kesejahteraan Sosial). Free for low-income Indonesians in national welfare registry.",
    description: "Free national health insurance covering hospitalization, outpatient care, and specialist visits.",
    steps: [
      "Check DTKS status at cekbansos.kemensos.go.id",
      "If not registered: visit RT/RW and request inclusion in next DTKS update cycle",
      "Once in DTKS: register at nearest BPJS Kesehatan office with KTP + KK",
    ],
    documents: ["KTP", "Kartu Keluarga (KK)", "SKTM (optional but helpful)"],
    conflicts: ["id-bpjs-mandiri"],
  },
  {
    id: "id-pkh",
    name: "PKH (Program Keluarga Harapan)",
    country: "indonesia",
    primaryNeed: "food_income",
    eligibility: "Families in DTKS with children under 6, school-age children, pregnant women, elderly 70+, or disabled members.",
    description: "Conditional quarterly cash transfer for low-income families meeting health and education conditions.",
    steps: [
      "Verify DTKS registration at cekbansos.kemensos.go.id",
      "Contact local Dinas Sosial or Pendamping PKH",
      "Attend mandatory P2K2 meetings",
      "Receive funds via KKS (Kartu Keluarga Sejahtera)",
    ],
    documents: ["KTP", "KK", "Akta Kelahiran for each child"],
    conflicts: ["id-prakerja"],
  },
  {
    id: "id-prakerja",
    name: "Kartu Prakerja",
    country: "indonesia",
    primaryNeed: "employment",
    eligibility: "Indonesians aged 18+ who are unemployed or informal workers. Not currently receiving PKH.",
    description: "Online training voucher plus cash incentive. Training covers digital skills, culinary, beauty, and more.",
    steps: [
      "Register at prakerja.go.id",
      "Pass online selection",
      "Choose approved training from partner platforms",
      "Complete training and claim incentive",
    ],
    documents: ["KTP", "Active phone number", "Bank account or OVO/GoPay/DANA e-wallet"],
    conflicts: ["id-pkh"],
  },
  {
    id: "id-bpnt",
    name: "BPNT / Bantuan Sembako",
    country: "indonesia",
    primaryNeed: "food_income",
    eligibility: "Low-income households in DTKS.",
    description: "Monthly food staple assistance (rice, eggs, tofu) loaded onto Kartu Sembako e-Warong card.",
    steps: [
      "Check eligibility at cekbansos.kemensos.go.id",
      "Collect Kartu Sembako from Dinas Sosial",
      "Shop at designated e-Warong merchants monthly",
    ],
    documents: ["KTP", "KK"],
  },
  {
    id: "id-pip",
    name: "PIP (Program Indonesia Pintar)",
    country: "indonesia",
    primaryNeed: "education",
    eligibility: "School-age children (SD/SMP/SMA/SMK) from families in DTKS or with school recommendation.",
    description: "Education grant paid directly to students to cover school supplies, transport, and other costs.",
    steps: [
      "Ask teacher or BK counselor to nominate student via Dapodik",
      "Check status at pip.kemdikbud.go.id",
      "Collect funds at BRI/BNI/BSI with student ID",
    ],
    documents: ["KTP orang tua", "KK", "Kartu Pelajar"],
  },
  {
    id: "id-kip-kuliah",
    name: "KIP Kuliah",
    country: "indonesia",
    primaryNeed: "education",
    eligibility: "High school graduates from families earning below Rp 4 million/month.",
    description: "Full university scholarship covering tuition plus living allowance.",
    steps: [
      "Register at kip-kuliah.kemdikbud.go.id during university admission period",
      "Link existing KIP or prove need via SKTM",
      "Apply through SNBP/SNBT/Mandiri admission",
    ],
    documents: ["KTP", "KK", "KIP SMA if available", "SKTM or income proof"],
  },
  {
    id: "id-kur-mikro",
    name: "KUR Mikro (Kredit Usaha Rakyat)",
    country: "indonesia",
    primaryNeed: "employment",
    eligibility: "Micro entrepreneurs with active business for 6+ months.",
    description: "Subsidized micro loan up to Rp 100 million at 6% annual interest via partner banks.",
    steps: [
      "Visit BRI, BNI, Mandiri, or BSI branch",
      "Bring business proof and personal documents",
      "Await loan officer assessment (7 working days)",
    ],
    documents: ["KTP", "KK", "Business license (NIB/SIUP) if available", "6 months bank statements"],
  },
  // ── United States ─────────────────────────────────────────────────────────
  {
    id: "us-medicaid",
    name: "Medicaid",
    country: "united states",
    primaryNeed: "health",
    eligibility: "Income below ~138% Federal Poverty Level. Pregnant women and children have higher thresholds.",
    description: "State-administered health insurance covering doctor visits, hospital stays, prescriptions, mental health.",
    steps: [
      "Apply at healthcare.gov or your state's Medicaid portal",
      "Provide income documentation",
      "Await determination (30-45 days)",
    ],
    documents: ["SSN or ITIN", "Proof of income", "Proof of US residency", "Birth certificate"],
  },
  {
    id: "us-snap",
    name: "SNAP (Food Stamps)",
    country: "united states",
    primaryNeed: "food_income",
    eligibility: "Households with gross income below 130% Federal Poverty Level.",
    description: "Monthly EBT card for food purchases at grocery stores and farmers markets.",
    steps: [
      "Apply at local SNAP office or benefits.gov",
      "Complete a phone or in-person interview",
      "Receive EBT card within 30 days if approved",
    ],
    documents: ["Government ID", "Proof of income", "Proof of residency", "SSNs for all household members"],
  },
  {
    id: "us-unemployment",
    name: "Unemployment Insurance",
    country: "united states",
    primaryNeed: "employment",
    eligibility: "Recently laid-off workers who worked minimum qualifying period and are actively job searching.",
    description: "Weekly income replacement (40-60% of prior wages) for up to 26 weeks.",
    steps: [
      "File claim with state unemployment agency within 1-2 weeks of job loss",
      "Create account at state labor department website",
      "Certify weekly that you are actively job searching",
    ],
    documents: ["SSN", "Last employer information", "Employment dates and wages", "Reason for separation"],
  },
  // ── United Kingdom ────────────────────────────────────────────────────────
  {
    id: "uk-universal-credit",
    name: "Universal Credit",
    country: "united kingdom",
    primaryNeed: "food_income",
    eligibility: "Working-age adults (18-66) on low income or out of work. Replaces 6 legacy benefits.",
    description: "Main monthly UK benefit including standard allowance plus top-ups for children, disability, housing.",
    steps: [
      "Apply at gov.uk/apply-universal-credit",
      "Verify identity online or at Jobcentre Plus",
      "Attend first Jobcentre appointment",
      "Wait ~5 weeks for first payment",
    ],
    documents: ["National Insurance number", "Bank account details", "Rent agreement", "Childcare costs evidence"],
  },
  // ── Australia ─────────────────────────────────────────────────────────────
  {
    id: "au-jobseeker",
    name: "JobSeeker Payment",
    country: "australia",
    primaryNeed: "employment",
    eligibility: "Australian residents aged 22-66 who are unemployed and actively looking for work.",
    description: "Fortnightly income support while job seeking, with access to employment services.",
    steps: [
      "Create myGov account at my.gov.au and link Centrelink",
      "Submit JobSeeker claim online",
      "Complete 100-point identity check",
      "Set up Job Plan and meet mutual obligations",
    ],
    documents: ["myGov account", "100 points of ID (passport + Medicare)", "Tax File Number", "Bank BSB and account number"],
  },
];

// ---------------------------------------------------------------------------
// Indexed entry: program + its pre-computed embedding vector
// ---------------------------------------------------------------------------

interface IndexedEntry {
  doc: ProgramDoc;
  embedding: number[];
}

// ---------------------------------------------------------------------------
// Singleton store — built once per process lifetime
// ---------------------------------------------------------------------------

let _index: IndexedEntry[] | null = null;
let _buildPromise: Promise<IndexedEntry[]> | null = null;

/**
 * Converts a ProgramDoc into a rich text string optimised for embedding.
 * Including keywords like country, eligibility text, and need category
 * dramatically improves semantic retrieval accuracy.
 */
function docToText(doc: ProgramDoc): string {
  return [
    `Program: ${doc.name}`,
    `Country: ${doc.country}`,
    `Support category: ${doc.primaryNeed?.replace(/_/g, " ")}`,
    `Who is eligible: ${doc.eligibility}`,
    `What it provides: ${doc.description}`,
    `How to apply: ${doc.steps.join(". ")}`,
    `Documents needed: ${doc.documents.join(", ")}`,
    doc.conflicts ? `Cannot be combined with: ${doc.conflicts.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function buildIndex(): Promise<IndexedEntry[]> {
  const hf = getHfClient();
  const texts = PROGRAMS_CORPUS.map(docToText);

  console.log(`[vectorstore] Embedding ${texts.length} program documents via HuggingFace...`);

  // featureExtraction returns Float32Array[] — one per input text
  const output = await hf.featureExtraction({
    model: EMBEDDING_MODEL,
    inputs: texts,
  });

  // output is number[][] (one row per document)
  const embeddings = output as number[][];

  const index: IndexedEntry[] = PROGRAMS_CORPUS.map((doc, i) => ({
    doc,
    embedding: embeddings[i],
  }));

  console.log(`[vectorstore] ✓ Index built. ${index.length} documents indexed.`);
  return index;
}

async function getIndex(): Promise<IndexedEntry[]> {
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
 * Retrieves the `topK` most semantically relevant ProgramDoc objects
 * for a given UserProfile.
 *
 * How it works:
 *   1. Build a natural-language query from profile fields
 *   2. Embed the query via HuggingFace Inference API (same model as index)
 *   3. Compute cosine similarity against all indexed document embeddings
 *   4. Return top-K results sorted by similarity descending
 *
 * This is a drop-in replacement for the deterministic filter in nodes.ts:
 *
 *   // Before (keyword filter):
 *   const ragContext = PROGRAMS_DB.filter(d => d.country === profile.country);
 *
 *   // After (semantic search):
 *   const ragContext = await retrieveForProfile(profile, 4);
 *
 * @param profile  Extracted UserProfile from intakeNode (can be null)
 * @param topK     Max documents to return (default: 4)
 */
export async function retrieveForProfile(
  profile: UserProfile | null,
  topK = 4
): Promise<ProgramDoc[]> {
  const index = await getIndex();
  const hf = getHfClient();

  // Build semantic query from profile fields
  const queryParts: string[] = [];
  if (profile?.country)
    queryParts.push(`government assistance programs in ${profile.country}`);
  if (profile?.primaryNeed)
    queryParts.push(`${profile.primaryNeed.replace(/_/g, " ")} support`);
  if (profile?.employmentStatus === "unemployed")
    queryParts.push("unemployed recently lost job");
  if (profile?.incomeLevel)
    queryParts.push(`${profile.incomeLevel.replace(/_/g, " ")} income household`);
  if ((profile?.dependents ?? 0) > 0)
    queryParts.push(`family with children dependents`);
  if (profile?.healthConditions?.length)
    queryParts.push(`health conditions: ${profile.healthConditions.join(", ")}`);

  const query =
    queryParts.length > 0
      ? queryParts.join(". ")
      : "government benefits social assistance program eligibility";

  console.log(`[vectorstore] Semantic query: "${query}"`);

  // Embed the query (single string → number[])
  const rawEmbedding = await hf.featureExtraction({
    model: EMBEDDING_MODEL,
    inputs: query,
  });
  const queryEmbedding = rawEmbedding as number[];

  // Score every indexed document
  const scored = index.map((entry) => ({
    doc: entry.doc,
    score: cosineSimilarity(queryEmbedding, entry.embedding),
  }));

  // Sort by score descending, take top-K
  scored.sort((a, b) => b.score - a.score);
  const topResults = scored.slice(0, topK);

  console.log(
    `[vectorstore] Top ${topResults.length} results:`,
    topResults.map((r) => `${r.doc.name} (${r.score.toFixed(3)})`)
  );

  return topResults.map((r) => r.doc);
}

/**
 * Invalidates and rebuilds the in-memory index.
 * Useful after updating PROGRAMS_CORPUS at runtime.
 * Call from a protected /api/admin/reindex route if needed.
 */
export async function rebuildIndex(): Promise<void> {
  _index = null;
  _buildPromise = null;
  await getIndex();
}
