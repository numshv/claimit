/**
 * src/lib/graph/nodes.ts
 *
 * The three deterministic nodes of the ClaimIt LangGraph pipeline.
 * No black-box wrappers. Each node is a plain async function.
 *
 *  intakeNode      → extracts UserProfile from conversation
 *  retrievalNode   → deterministic in-memory program lookup (no LLM)
 *  synthesizerNode → generates final RecommendationResponse JSON
 */

import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import type { AgentState, ProgramDoc, UserProfile } from "./state";
import { llm } from "./llm";
import { retrieveForProfile } from "./vectorstore";

// ---------------------------------------------------------------------------
// Helper: strip JSON fences that models sometimes wrap around their output
// ---------------------------------------------------------------------------

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
}

// ---------------------------------------------------------------------------
// Programs database (in-memory — mirrors the knowledge in openrouter.ts)
// ---------------------------------------------------------------------------

const PROGRAMS_DB: ProgramDoc[] = [
  // Indonesia — Health
  {
    id: "id-bpjs-pbi",
    name: "BPJS Kesehatan PBI",
    country: "indonesia",
    primaryNeed: "health",
    eligibility: "Registered in DTKS (Data Terpadu Kesejahteraan Sosial)",
    description: "Free national health insurance for those in the national welfare registry.",
    steps: [
      "Check DTKS status at cekbansos.kemensos.go.id",
      "If not registered, go to RT/RW and request inclusion",
      "Once in DTKS, register at nearest BPJS office with KTP + KK",
    ],
    documents: ["KTP", "KK", "Surat Keterangan Tidak Mampu (SKTM)"],
    conflicts: ["id-bpjs-mandiri"],
  },
  // Indonesia — Food & Income
  {
    id: "id-pkh",
    name: "PKH (Program Keluarga Harapan)",
    country: "indonesia",
    primaryNeed: "food_income",
    eligibility: "Families in DTKS with children under 6, school-age children, elderly 70+, or disabled members",
    description: "Conditional cash transfer for low-income families.",
    steps: [
      "Verify DTKS registration at cekbansos.kemensos.go.id",
      "Contact local Dinas Sosial for PKH registration",
      "Attend required family development sessions (P2K2)",
    ],
    documents: ["KTP", "KK", "Akta Kelahiran anak"],
    conflicts: ["id-prakerja"],
  },
  {
    id: "id-prakerja",
    name: "Kartu Prakerja",
    country: "indonesia",
    primaryNeed: "employment",
    eligibility: "Unemployed or informal workers, not currently receiving PKH",
    description: "Online training voucher + cash incentive for job seekers.",
    steps: [
      "Create account at prakerja.go.id",
      "Pass eligibility selection",
      "Choose and complete a training course",
      "Claim incentive after training completion",
    ],
    documents: ["KTP", "Nomor HP aktif", "Rekening bank/e-wallet"],
    conflicts: ["id-pkh"],
  },
  {
    id: "id-pip",
    name: "PIP (Program Indonesia Pintar)",
    country: "indonesia",
    primaryNeed: "education",
    eligibility: "School-age children (SD/SMP/SMA) from low-income families",
    description: "Education grant for children from families in DTKS or with school recommendation.",
    steps: [
      "Ask school teacher/counselor to nominate student in Dapodik",
      "Verify via pip.kemdikbud.go.id",
      "Collect funds at nominated bank (BRI/BNI)",
    ],
    documents: ["KTP orang tua", "KK", "Kartu Pelajar"],
  },
  // USA — Health
  {
    id: "us-medicaid",
    name: "Medicaid",
    country: "united states",
    primaryNeed: "health",
    eligibility: "Low-income individuals and families, income below ~138% FPL",
    description: "State-administered health coverage for low-income Americans.",
    steps: [
      "Apply at healthcare.gov or your state Medicaid office",
      "Provide income documentation",
      "Await eligibility determination (usually 30-45 days)",
    ],
    documents: ["SSN or ITIN", "Proof of income", "Proof of residency", "Birth certificate"],
  },
  {
    id: "us-snap",
    name: "SNAP (Food Stamps)",
    country: "united states",
    primaryNeed: "food_income",
    eligibility: "Households with income below 130% FPL",
    description: "Monthly food assistance benefit loaded onto an EBT card.",
    steps: [
      "Apply at your local SNAP office or online at benefits.gov",
      "Complete an interview",
      "Receive EBT card if approved",
    ],
    documents: ["ID", "Proof of income", "Proof of residency", "Social Security numbers"],
  },
  // UK
  {
    id: "uk-universal-credit",
    name: "Universal Credit",
    country: "united kingdom",
    primaryNeed: "food_income",
    eligibility: "Working-age adults on low income or out of work",
    description: "Main UK working-age benefit, replacing 6 legacy benefits.",
    steps: [
      "Apply online at gov.uk/universal-credit",
      "Verify identity with GOV.UK Verify",
      "Attend first appointment at Jobcentre Plus",
    ],
    documents: ["National Insurance number", "Bank account details", "Rent agreement if renting"],
  },
  // Australia
  {
    id: "au-jobseeker",
    name: "JobSeeker Payment",
    country: "australia",
    primaryNeed: "employment",
    eligibility: "Australian residents aged 22-67 who are unemployed and looking for work",
    description: "Income support for people actively looking for employment.",
    steps: [
      "Create a myGov account and link to Centrelink",
      "Claim JobSeeker online",
      "Complete identity confirmation",
      "Meet mutual obligation requirements",
    ],
    documents: ["myGov account", "Proof of identity (passport/birth cert)", "Tax File Number"],
  },
];

// ---------------------------------------------------------------------------
// Country normalizer — handles variations in how users describe their country
// ---------------------------------------------------------------------------

function normalizeCountry(country?: string): string {
  if (!country) return "";
  const lower = country.toLowerCase().trim();
  if (lower.includes("indonesia") || lower === "id") return "indonesia";
  if (lower.includes("united states") || lower === "us" || lower === "usa" || lower === "america") return "united states";
  if (lower.includes("united kingdom") || lower === "uk" || lower === "britain") return "united kingdom";
  if (lower.includes("australia") || lower === "au") return "australia";
  return lower;
}

// ---------------------------------------------------------------------------
// NODE 1: intakeNode
// ---------------------------------------------------------------------------

const INTAKE_SYSTEM_PROMPT = `You are an intake analyst for ClaimIt, a government benefits navigator.
Your ONLY job is to extract a structured UserProfile JSON from the conversation.

━━━ EXTRACTION RULES ━━━
1. Extract only what the user has explicitly stated. Do NOT invent or assume values.
2. If a user answers a number question (e.g. "3 people", "just me", "a family of 4"), extract it as the dependents count.
3. Map income descriptions to the nearest level:
   - "no income", "very poor" → "very_low"
   - "low income", "minimum wage" → "low"
   - "moderate", "middle" → "moderate"
   - "above average", "comfortable" → "above_average"
4. For employmentStatus: "government employee", "civil servant", "ASN" → "formal"

━━━ COMPLETION RULES (CRITICAL — prevents infinite loops) ━━━
• MINIMUM REQUIRED to set profileComplete: true = country AND primaryNeed (both non-null).
• Once those two fields are filled, you MUST set profileComplete: true — even if other fields are null.
• You may ask AT MOST 2 follow-up questions total across the entire conversation.
  Count the number of "Assistant:" turns in the conversation. If there are already 2 or more, set profileComplete: true immediately with whatever data you have.
• NEVER ask for household size, income, or dependents as a blocker — these are optional enrichments.
• If the user has answered your last question, do not ask another one — proceed to completion.

━━━ FOLLOW-UP QUESTION RULES ━━━
• Only ask ONE question at a time.
• Priority order for missing fields: 1) country, 2) primaryNeed, 3) incomeLevel
• If country and primaryNeed are known → set profileComplete: true immediately.
• Do NOT ask about dependents, household size, age, or housing unless the user volunteers it.

Output ONLY valid JSON — no markdown, no explanation:
{
  "profile": {
    "country": "string | null",
    "age": "number | null",
    "maritalStatus": "string | null",
    "dependents": "number | null",
    "employmentStatus": "formal" | "informal" | "unemployed" | "entrepreneur" | null,
    "incomeLevel": "very_low" | "low" | "moderate" | "middle" | "above_average" | null,
    "housingStatus": "string | null",
    "healthConditions": "string[] | null",
    "existingPrograms": "string[] | null",
    "primaryNeed": "health" | "food_income" | "education" | "housing" | "employment" | null
  },
  "profileComplete": boolean,
  "followUpQuestion": "string | null"
}`;


export async function intakeNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  // ── Hard loop guard ────────────────────────────────────────────────────────
  // Count how many assistant turns are already in the conversation.
  // If the AI has already asked 2+ follow-up questions, force completion
  // with whatever profile we have — don't let the LLM keep looping.
  const MAX_FOLLOWUPS = 2;
  const assistantTurns = state.messages.filter(
    (m) => m._getType() === "ai"
  ).length;

  if (assistantTurns >= MAX_FOLLOWUPS && state.profile) {
    console.log(
      `[intakeNode] Hard loop guard triggered (${assistantTurns} assistant turns). ` +
      "Forcing profileComplete=true with current profile."
    );
    return {
      profile: state.profile,
      profileComplete: true,
      verdict: null,
    };
  }

  // Build the message list for the LLM
  const conversationText = state.messages
    .map((m) => {
      const role = m._getType() === "human" ? "User" : "Assistant";
      return `${role}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`;
    })
    .join("\n");

  const messages = [
    new SystemMessage(INTAKE_SYSTEM_PROMPT),
    new HumanMessage(
      `Here is the conversation so far:\n\n${conversationText}\n\nExtract the UserProfile JSON now.`
    ),
  ];

  const raw = await llm.chat(messages);
  const clean = stripFences(raw);

  let parsed: {
    profile: UserProfile;
    profileComplete: boolean;
    followUpQuestion: string | null;
  };

  try {
    parsed = JSON.parse(clean);
  } catch {
    // Malformed JSON — treat as incomplete profile, ask the first question
    console.warn("[intakeNode] Failed to parse LLM JSON output:", clean);
    return {
      profile: null,
      profileComplete: false,
      verdict: "I'm here to help — could you tell me a little about your situation?",
    };
  }

  const profile = parsed.profile ?? null;
  let profileComplete = parsed.profileComplete === true;

  // ── Field-presence guard ───────────────────────────────────────────────────
  // If the LLM has extracted country + primaryNeed but still returned
  // profileComplete=false (e.g. it wants to ask about household size),
  // override it — those two fields are sufficient to run retrieval + synthesis.
  if (!profileComplete && profile?.country && profile?.primaryNeed) {
    console.log(
      "[intakeNode] Field-presence guard: country + primaryNeed available. " +
      "Overriding profileComplete=false → true."
    );
    profileComplete = true;
  }

  // If incomplete: return the follow-up question as the verdict
  if (!profileComplete) {
    return {
      profile,
      profileComplete: false,
      verdict:
        parsed.followUpQuestion ??
        "Could you share a bit more about your situation so I can find the right programs for you?",
    };
  }

  return {
    profile,
    profileComplete: true,
    verdict: null, // will be filled by synthesizerNode
  };
}

// ---------------------------------------------------------------------------
// NODE 2: retrievalNode — semantic similarity search via MemoryVectorStore
// ---------------------------------------------------------------------------

/**
 * Uses the HuggingFace-backed MemoryVectorStore to find the most relevant
 * program documents for the extracted user profile.
 *
 * Why this is NOT a keyword filter anymore:
 *   A user saying "I'm struggling to feed my kids" should surface food
 *   assistance programs even without the words "SNAP" or "BPNT". Semantic
 *   search handles that naturally; keyword matching does not.
 *
 * How the profile becomes a vector store query:
 *   retrieveForProfile() builds a natural-language query from profile fields
 *   (e.g., "government assistance in indonesia. food income support. low income
 *   household. family with children.") and embeds it with the same model used
 *   to embed the program documents, then ranks by cosine similarity.
 *
 * AgentState update:
 *   Returns { ragContext: ProgramDoc[] } — replaces the previous array wholesale.
 *   The synthesizer node reads state.ragContext directly.
 */
export async function retrievalNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  if (!state.profile) {
    console.warn("[retrievalNode] No profile available — skipping retrieval.");
    return { ragContext: [] };
  }

  try {
    // Pass profile + topK to the vector store.
    // retrieveForProfile() lazy-initializes the index on first call.
    const docs = await retrieveForProfile(state.profile, 4);

    console.log(
      `[retrievalNode] Retrieved ${docs.length} docs:`,
      docs.map((d) => d.name)
    );

    return { ragContext: docs };
  } catch (err) {
    // If HuggingFace API is unavailable, degrade gracefully:
    // return empty context so synthesizerNode still runs (using its own knowledge).
    console.error("[retrievalNode] Vector store error — falling back to empty context:", err);
    return { ragContext: [] };
  }
}

// ---------------------------------------------------------------------------
// NODE 3: synthesizerNode
// ---------------------------------------------------------------------------

/**
 * Prompt used when ragContext has verified database documents.
 * The LLM grounds its recommendations in the exact program text we retrieved.
 */
const SYNTHESIS_SYSTEM_PROMPT = `You are ClaimIt's Eligibility Specialist. You must prioritize the 'Exclusions and Conflicts' section of every retrieved document above all else.

━━━ PHASE 1: DISQUALIFICATION CHECK (MANDATORY — runs before anything else) ━━━
For EVERY retrieved program, read its "Exclusions and Conflicts / Who cannot apply" section.
Compare each item in that list against the user's profile (employment status, citizenship, income, existing programs, age, etc.).

CRITICAL RULES — NEVER OVERRIDE THESE:
• If the user matches ANY disqualification item in the document text → verdict MUST be "not_yet".
• This overrides all other factors. Even if they have low income, if they are explicitly excluded, they are "Not Ready Yet".
• The reasoning field MUST quote or paraphrase the specific exclusion rule from the document.
  Example: "According to the SNAP document section '3. Exclusions': Undocumented immigrants are explicitly excluded regardless of income level."
• NEVER soften a disqualification into a "verify" verdict. Disqualified means "not_yet", period.

━━━ PHASE 2: THE PIVOT (MANDATORY when verdict is not_yet) ━━━
Every rejection MUST immediately bridge to an alternative. The reasoning field for not_yet items must follow this exact pattern:
  "Based on your [attribute], you are not eligible for [program] — the document states [exact rule]. However, [concrete alternative you CAN do]."
Never leave a user without a next step.

━━━ PHASE 3: ALTERNATIVES (MANDATORY) ━━━
After rejections, always list 1-2 programs the user IS eligible for.
Eligible programs must also cite which section of the document supports their eligibility.
If no eligible alternatives exist in the retrieved context, include a GENERAL_KNOWLEDGE alternative.

━━━ GENERAL RULES ━━━
1. Analyze 2-4 programs total (rejected + eligible).
2. Use probabilistic framing for eligible programs — never guarantee.
3. source_type: "RAG_VERIFIED" if grounded in a retrieved document, "GENERAL_KNOWLEDGE" if using internal training data.
4. If source_type is "GENERAL_KNOWLEDGE": reasoning MUST include "Note: This information is not verified in our local database; please check official sources."
5. Output ONLY valid JSON — no markdown fences, no extra explanation.

Output format (exact):
{
  "recommendations": [
    {
      "programName": "string — exact program name from the document",
      "whyRelevant": "string — one sentence on why this program was considered for this user",
      "verdict": "eligible" | "verify" | "not_yet",
      "verdictLabel": "Likely Eligible" | "Needs Verification" | "Not Ready Yet",
      "source_type": "RAG_VERIFIED" | "GENERAL_KNOWLEDGE",
      "reasoning": "string — MUST cite specific document rule. For not_yet: 'Based on [attribute], not eligible because [exact rule from doc]. However, [pivot].' For eligible: 'Section [X] of the document states [Y], which matches the user's [attribute].'",
      "pros": ["string"],
      "cons": ["string"],
      "steps": ["Step 1: ...", "Step 2: ..."],
      "documents": ["string"]
    }
  ],
  "conflicts": "string or null — programs in the list that cannot be received simultaneously (be specific about which pair conflicts)",
  "synergies": "string — REQUIRED, never null. Write a practical 'Good to Know' tip: e.g. which gateway program (like DTKS registration) unlocks multiple benefits, how two eligible programs can be stacked, or a shortcut in the application process. If no synergies exist, give a general tip relevant to the user's country/situation (e.g. 'Tip: Being registered in DTKS is the key gateway that unlocks PKH, BPNT, PIP, and BPJS PBI simultaneously.').",
  "priorityAction": "string — the single most actionable next step, even if ineligible for most programs"
}`;

/**
 * Prompt used when ragContext is EMPTY — meaning the user's country/region is
 * not in our verified document database.
 *
 * Rules enforced here:
 *   1. Open with an explicit disclaimer (no pretending we have official docs).
 *   2. Suggest program *categories* by name — no specific amounts or URLs.
 *   3. Direct user to the correct government office type for their country.
 *   4. All verdictLabel values MUST be "Perlu Verifikasi Mandiri".
 *   5. Output ONLY valid JSON — no markdown, no explanation.
 */
const FALLBACK_SYSTEM_PROMPT = `You are BantuanAI, an honest social assistance assistant for ClaimIt.

CRITICAL SITUATION: Our verified document database does NOT have official program data for the user's country or region. You must NOT fabricate eligibility numbers, payout amounts, or application URLs — these change frequently and you will cause harm if you guess wrong.

Your job is to provide helpful general guidance while being fully transparent about the limitation.

Strict Rules:
1. The "disclaimer" field MUST start with: "I don't have verified official documents for [country] in my current database, but based on general knowledge, here is what you can look into..."
2. Suggest general program NAMES or CATEGORIES that typically exist in that country (e.g., "Bolsa Família" for Brazil, "Aide Personnalisée au Logement" for France). Do NOT invent names.
3. NEVER include specific income limits, payout amounts, or application portal URLs.
4. In "steps", always advise contacting the relevant government office (Ministry of Labor, Department of Social Services, etc.) as the first actionable step.
5. Every single recommendation MUST have "verdict": "verify", "verdictLabel": "Perlu Verifikasi Mandiri", and "source_type": "GENERAL_KNOWLEDGE".
6. Every reasoning field MUST contain: 'Note: This information is not verified in our local database; please check official sources.'
7. Output ONLY valid JSON — no markdown, no explanation.

Output format (must be exact — same schema as verified responses):
{
  "disclaimer": "string — REQUIRED, must start with 'I don't have verified official documents for...'",
  "recommendations": [
    {
      "programName": "string — general program name or category",
      "whyRelevant": "string — explain why this type of program matches the user's situation",
      "verdict": "verify",
      "verdictLabel": "Perlu Verifikasi Mandiri",
      "source_type": "GENERAL_KNOWLEDGE",
      "reasoning": "string — MUST include: 'Note: This information is not verified in our local database; please check official sources.'",
      "pros": ["string — general benefit this type of program typically provides"],
      "cons": ["string — note that specific details must be verified locally"],
      "steps": [
        "string — Step 1: Contact [relevant ministry/office] in [country]",
        "string — Step 2: Ask specifically about [program type] eligibility",
        "string — Step 3: Bring standard identity documents"
      ],
      "documents": ["string — typical document required (e.g., national ID, proof of income)"]
    }
  ],
  "conflicts": null,
  "synergies": null,
  "priorityAction": "string — direct them to the single most relevant government office to call or visit TODAY"
}`;

export async function synthesizerNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  const { profile, ragContext, messages } = state;

  // Reconstruct recent conversation for context (last 3 exchanges)
  const conversationSummary = messages
    .slice(-6)
    .map((m) => {
      const role = m._getType() === "human" ? "User" : "Assistant";
      return `${role}: ${typeof m.content === "string" ? m.content : ""}`;
    })
    .join("\n");

  const userProfileBlock = profile
    ? JSON.stringify(profile, null, 2)
    : "Profile not available.";

  // ── Branch: verified DB context vs. fallback ──────────────────────────────

  const hasVerifiedContext = ragContext.length > 0;

  let systemPrompt: string;
  let userPrompt: string;

  if (hasVerifiedContext) {
    // ── PATH A: We have verified program documents from the vector store ──
    console.log(`[synthesizerNode] Using verified DB path (${ragContext.length} docs).`);

    const contextBlock = ragContext
      .map(
        (doc) =>
          `PROGRAM: ${doc.name}\n` +
          `Country: ${doc.country}\n` +
          `Eligibility: ${doc.eligibility}\n` +
          `Description: ${doc.description}\n` +
          `Steps: ${doc.steps.join("; ")}\n` +
          `Required docs: ${doc.documents.join(", ")}\n` +
          (doc.conflicts ? `Conflicts with: ${doc.conflicts.join(", ")}` : "")
      )
      .join("\n\n");

    systemPrompt = SYNTHESIS_SYSTEM_PROMPT;
    userPrompt =
      `USER PROFILE:\n${userProfileBlock}\n\n` +
      `RELEVANT PROGRAMS (verified database):\n${contextBlock}\n\n` +
      `RECENT CONVERSATION:\n${conversationSummary}\n\n` +
      `Generate the recommendation JSON now.`;

  } else {
    // ── PATH B: No verified documents — country not in our database ────────
    // Use the BantuanAI fallback persona with strict honesty rules.
    console.warn(
      `[synthesizerNode] No verified context for country="${profile?.country}" — using fallback prompt.`
    );

    systemPrompt = FALLBACK_SYSTEM_PROMPT;
    userPrompt =
      `USER PROFILE:\n${userProfileBlock}\n\n` +
      `DATABASE STATUS: No verified official program documents found for this country/region.\n\n` +
      `RECENT CONVERSATION:\n${conversationSummary}\n\n` +
      `Generate the fallback guidance JSON now. Remember: NO specific amounts, NO URLs, ` +
      `ALL verdictLabel values must be "Perlu Verifikasi Mandiri".`;
  }

  const synthMessages = [
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt),
  ];

  const raw = await llm.chat(synthMessages);
  const clean = stripFences(raw);

  let verdict: AgentState["verdict"];

  try {
    verdict = JSON.parse(clean);
  } catch {
    console.warn("[synthesizerNode] Failed to parse synthesis JSON:", clean);
    // Return raw text as a fallback so the UI still receives something
    verdict = clean;
  }

  // Append the AI's response to conversation history
  const aiMessage = new AIMessage(clean);

  return {
    verdict,
    messages: [aiMessage],
  };
}

