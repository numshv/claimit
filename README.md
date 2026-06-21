# ClaimIt

> **USAII Global AI Hackathon 2026** — AI-powered government benefits navigator

ClaimIt helps people around the world discover government assistance programs they may qualify for — based on their life situation, not on knowing program names.

---

## What is ClaimIt?

Most government assistance systems are fragmented and hard to navigate. People miss out on benefits not because they're ineligible, but because:

- They don't know which programs exist
- They don't know if they qualify
- They don't know the concrete steps to apply
- No one honestly tells them "you're not ready yet — fix X first"

ClaimIt fixes this. A user describes their situation in plain language ("I'm in Indonesia, I just lost my job and have 2 kids in school"), and the AI does the rest.

---

## How It Works

```
User describes situation in plain language
        ↓
intakeNode  — LangGraph extracts structured profile (country, need, income, etc.)
        ↓
retrievalNode — semantic search over verified program documents (RAG)
        ↓
synthesizerNode — generates eligibility verdicts with specific citations
        ↓
Results page — sorted by verdict (Eligible → Verify → Not Ready Yet)
```

### Key Differentiators

1. **Situation-first, not program-first** — Users don't need to know program names
2. **Strict disqualification check** — AI reads the "Who cannot apply" section before anything else
3. **Honest AI with the "Pivot"** — If disqualified, immediately bridges to alternatives
4. **Source transparency** — Every recommendation is labelled *Verified in our system* (RAG) or *Not in our database* (general knowledge)
5. **Multi-country** — Indonesia, USA, UK, Australia (easily extensible via markdown files)
6. **3-tier LLM fallback** — OpenRouter → Google AI Studio → Groq (never goes down)

---

## Supported Countries & Programs

| Country | Programs |
|---|---|
| 🇮🇩 Indonesia | PKH, BPNT/Sembako, BPJS Kesehatan PBI, PIP, Kartu Prakerja |
| 🇺🇸 USA | SNAP, Medicaid, TANF, WIC, Section 8 Housing |
| 🇬🇧 UK | Universal Credit, Child Benefit |
| 🌐 Other countries | BantuanAI fallback (general knowledge + honest disclaimer) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| AI Orchestration | LangGraph.js (deterministic multi-agent) |
| LLM (Tier 1) | OpenRouter — Gemini 1.5 Flash + 6 fallback models |
| LLM (Tier 2) | Google AI Studio — Gemini 1.5 Flash (direct) |
| LLM (Tier 3) | Groq — Llama 3.3 70B / Mixtral / Llama 3 8B |
| Embeddings | HuggingFace Inference API (`all-MiniLM-L6-v2`, 384-dim) |
| Vector Store | In-memory cosine similarity (hackathon speed) |
| Language | TypeScript |

---

## Project Structure

```
claimit/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Landing page
│   │   ├── chat/page.tsx               # Conversational intake UI
│   │   ├── results/page.tsx            # Program recommendation cards
│   │   ├── summary/page.tsx            # Shareable summary
│   │   └── api/
│   │       ├── chat/route.ts           # POST — triggers LangGraph pipeline
│   │       └── ingest/route.ts         # GET  — builds RAG vector index
│   ├── components/
│   │   ├── ProgramCard.tsx             # Card with verdict, source badge, steps
│   │   ├── VerdictBadge.tsx            # Green/amber/red eligibility badge
│   │   ├── ChatBubble.tsx
│   │   ├── ChipOptions.tsx
│   │   └── LoadingScreen.tsx
│   └── lib/
│       ├── graph/
│       │   ├── index.ts                # LangGraph compilation + export
│       │   ├── state.ts                # AgentState (Annotation.Root)
│       │   ├── nodes.ts                # intakeNode, retrievalNode, synthesizerNode
│       │   ├── router.ts               # Conditional edge functions
│       │   ├── llm.ts                  # 3-tier waterfall LLM client
│       │   └── vectorstore.ts          # HuggingFace embeddings + cosine similarity
│       ├── vectorstore.ts              # Singleton for /api/ingest
│       └── types.ts                    # ProgramRecommendation, RecommendationResponse
└── data/
    └── programs/                       # Markdown program documents (RAG source)
        ├── id-pkh.md
        ├── id-prakerja.md
        ├── us-snap_food_stamps.md
        ├── uk-universal_credit.md
        └── ...
```

---

## Setup & Running

### Prerequisites

- Node.js 18+
- API keys (at least one LLM provider required):

| Key | Source | Required for |
|---|---|---|
| `OPENROUTER_API_KEY` | [openrouter.ai/keys](https://openrouter.ai/keys) | Tier 1 LLM (primary) |
| `GOOGLE_AI_STUDIO_API_KEY` | [aistudio.google.com](https://aistudio.google.com/app/apikey) | Tier 2 LLM |
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com/keys) | Tier 3 LLM (final fallback) |
| `HUGGINGFACEHUB_API_KEY` | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) | RAG embeddings |

### Install

```bash
git clone <repo-url>
cd claimit
npm install
```

### Configure

```bash
cp .env.example .env.local
# Fill in your API keys
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Verify RAG is working

```bash
curl http://localhost:3000/api/ingest
```

Expected response: `{ "status": "ok", "chunkCount": 45, "smokeTest": { ... } }`

---

## Adding New Programs

Create a `.md` file in `data/programs/` with this frontmatter:

```markdown
---
program_id: "xx_program_01"
country_code: "XX"
category: "Category"
target_audience: "Who this is for"
---

# Program Name

## 1. Description
...

## 2. Core Eligibility Requirements
...

## 3. Exclusions and Conflicts (CRITICAL)
- **Who cannot apply:** ...

## 4. Benefits (Pros)
...

## 5. Application Steps & Required Documents
...
```

Then hit `GET /api/ingest` to rebuild the vector index — no server restart needed.

---

## Responsible AI

- **Probabilistic framing** — never says "you will definitely get"
- **Source transparency** — every card shows whether data is RAG-verified or general knowledge
- **Disqualification-first** — AI checks exclusions before eligibility, and cites the exact rule
- **Human authority** — always names the office that makes the final decision
- **Honest fallback** — for unknown countries, BantuanAI explicitly disclaims lack of verified data

---

*Built for the USAII Global AI Hackathon 2026.*
