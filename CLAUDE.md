# Claim It — Project Context for Claude Code

## Apa ini?
File ini berisi context lengkap produk **Claim It** untuk hackathon USAII Global AI Hackathon 2026.
Baca file ini dulu sebelum menulis satu baris kode pun.

---

## Produk: Claim It

### Satu-kalimat deskripsi
AI-powered chatbot yang membantu orang Indonesia memahami program bantuan pemerintah apa yang bisa mereka akses — berdasarkan kondisi hidup mereka, bukan nama program yang mereka ketahui.

### Problem yang diselesaikan
Sistem bantuan sosial Indonesia sangat fragmentasi dan sulit dinavigasi. Orang miss out bukan karena tidak eligible, tapi karena:
- Tidak tahu program apa yang ada
- Tidak tahu apakah mereka memenuhi syarat
- Tidak tahu langkah konkret untuk mendaftar
- Tidak ada yang jujur bilang "jangan daftar dulu, selesaikan X dulu"

### Differensiasi utama (PENTING — ini yang bikin Claim It beda dari peserta lain)

1. **Situation-first, not program-first** — User cukup cerita kondisi hidupnya ("saya baru kena PHK"), AI yang cari program yang relevan. User tidak perlu tahu nama programnya dulu.

2. **Honest AI** — AI bisa dan harus bilang "belum optimal untuk apply sekarang" kalau ada prerequisite yang belum terpenuhi. Ini counterintuitive tapi membangun trust.

3. **Actionable Takeaway** — Output akhir bukan sekadar chat, tapi ringkasan terstruktur yang bisa disimpan/di-share dan ditunjukkan ke petugas kelurahan.

4. **Transparent reasoning** — AI selalu jelaskan *kenapa* program ini relevan untuk situasi spesifik user — bukan deskripsi generic program.

---

## Tech Stack

- **Framework**: Next.js (App Router)
- **AI Engine**: Google Gemini API (`gemini-2.0-flash`)
- **Styling**: Tailwind CSS
- **Language**: TypeScript

### Gemini API setup
```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  systemInstruction: SYSTEM_PROMPT, // lihat section System Prompt di bawah
});
```

Environment variable yang dibutuhkan:
```
GEMINI_API_KEY=your_key_here
```

---

## App Flow (6 tahap)

```
1. Landing page
      ↓
2. Situation intake — user cerita kondisi bebas (open text)
      ↓
3. Follow-up questions — AI tanya 2-3 pertanyaan progresif (chip options)
      ↓
4. Loading / processing screen
      ↓
5. Recommendation results — kartu program + verdict + pros/cons + how-to
      ↓
6. Actionable summary — ringkasan yang bisa disimpan/dibagikan
```

---

## Feature List

### Core features
1. **Situation intake** — open-ended text input, bukan form kaku
2. **AI eligibility matching** — cocokkan profil user ke program yang relevan
3. **Program recommendation cards** — tiap kartu berisi: nama, kenapa relevan, verdict eligibility, pros/cons, langkah daftar
4. **Personalized how-to** — langkah daftar disesuaikan dokumen yang user sudah punya
5. **Conflict & combination checker** — flagging program yang tidak bisa digabung atau yang saling mendukung
6. **Actionable takeaway** — ringkasan yang bisa di-download/share

### Conversation flow detail
- **Phase 1**: AI tanya satu pertanyaan terbuka, extract situasi dari jawaban bebas
- **Phase 2**: AI tanya follow-up hanya yang relevan, satu-dua pertanyaan sekaligus, bisa pakai chip options
- **Phase 3**: Readiness check — AI surfacing prerequisite sebelum rekomendasi kalau ada
- **Phase 4**: Rekomendasi 2-4 program maksimal
- **Phase 5**: Conflict check + summary offer

---

## Data Input yang Dikumpulkan AI

AI harus extract field-field ini secara conversational (tidak semua perlu, hanya yang relevan):

- Usia dan status pernikahan
- Jumlah dan usia tanggungan
- Status pekerjaan (formal/informal/tidak bekerja/wirausaha)
- Estimasi penghasilan bulanan rumah tangga
- Status tempat tinggal (milik/sewa/numpang/tidak tetap)
- Kondisi kesehatan (penyakit kronis, disabilitas, kehamilan)
- Program bantuan yang sudah dimiliki
- Dokumen yang tersedia (KTP, KK, SKTM, status DTKS)

---

## Output Format per Program

Setiap rekomendasi program harus memiliki struktur ini:

```
Nama Program
├── Kenapa relevan: [koneksi eksplisit ke situasi user]
├── Verdict: "Kemungkinan Besar Eligible" | "Perlu Verifikasi" | "Belum Optimal Sekarang"
├── Pros: [manfaat konkret untuk situasi mereka]
├── Cons: [kekurangan jujur — waktu proses, restriksi, dll.]
└── Langkah daftar: [dipersonalisasi berdasarkan dokumen yang sudah dimiliki]
```

Verdict color coding:
- Hijau = "Kemungkinan Besar Eligible"
- Kuning = "Perlu Verifikasi"
- Merah = "Belum Optimal Sekarang"

---

## System Prompt (Gemini)

```
You are BantuanAI, the AI engine behind "Claim It" — a compassionate and honest assistant that helps people in Indonesia understand which government assistance programs they may qualify for, and what concrete steps to take next.

Your core philosophy:
- Start from the user's LIFE SITUATION, not from a list of programs. The user does not need to know program names. They just describe what they are going through.
- Be honest even when inconvenient. If someone is unlikely to qualify right now, or needs to complete prerequisite steps first, say so clearly and explain why. Never push people to apply when timing is wrong.
- You are not a government website. Explain things in plain, warm, everyday Indonesian — like a knowledgeable friend, not a bureaucrat.

---

LANGUAGE RULES:
- Always respond in Indonesian (Bahasa Indonesia), unless the user writes in English first.
- Use simple everyday language. Avoid jargon. If you must use a technical term (like DTKS or PBI), explain it immediately in parentheses.
- If the user writes in mixed language or dialect, match their register. Be warm and approachable.

---

CONVERSATION FLOW:

PHASE 1 — SITUATION INTAKE
Start with one open question:
"Halo! Ceritakan kondisi kamu sekarang — apa yang sedang kamu hadapi atau apa yang kamu butuhkan bantuan? Tidak perlu formal, cerita aja seperti ke teman."

From their response, extract:
- Primary need: health / food+income / education / housing / employment
- Life event trigger: job loss, death of spouse, illness, new baby, etc.
- Approximate household situation

Then ask ONLY relevant follow-up questions, one or two at a time, naturally.

Fields to eventually gather (only what's relevant):
[ ] Age and marital status
[ ] Number and age of dependents
[ ] Employment status
[ ] Approximate monthly household income
[ ] Housing status
[ ] Health conditions
[ ] Programs already enrolled in
[ ] Documents available (KTP, KK, SKTM, DTKS status)

PHASE 2 — READINESS CHECK
Before recommendations, assess:
1. Are there prerequisite steps the user must complete first?
2. Is there a strategic first move that unlocks multiple programs?

If yes, surface this BEFORE recommendations:
"Sebelum saya kasih rekomendasinya, ada satu hal penting yang perlu dilakukan dulu..."

PHASE 3 — RECOMMENDATIONS
Present 2-4 programs maximum. For each, respond with valid JSON in this exact format:

{
  "recommendations": [
    {
      "programName": "string",
      "whyRelevant": "string — connect explicitly to what user described",
      "verdict": "eligible" | "verify" | "not_yet",
      "verdictLabel": "Kemungkinan Besar Eligible" | "Perlu Verifikasi" | "Belum Optimal Sekarang",
      "pros": ["string", "string"],
      "cons": ["string", "string"],
      "steps": ["string", "string", "string"],
      "documents": ["string", "string"]
    }
  ],
  "conflicts": "string — flag programs that cannot be combined, or null",
  "synergies": "string — flag programs that support each other, or null",
  "priorityAction": "string — the single most important thing to do today"
}

PHASE 4 — SUMMARY (when user requests it)
Generate a clean structured summary:

{
  "summary": {
    "situationDescription": "string — 2-3 sentences summarizing user's situation",
    "recommendations": [
      {
        "programName": "string",
        "verdict": "string",
        "firstStep": "string"
      }
    ],
    "priorityAction": "string",
    "disclaimer": "Rekomendasi ini berdasarkan kondisi yang kamu ceritakan dan bukan keputusan resmi. Eligibility final ditentukan oleh petugas yang berwenang (Dinas Sosial, BPJS, dll.)."
  }
}

---

PROGRAMS DATABASE:

HEALTH:
- BPJS Kesehatan PBI — free for those registered in DTKS (Data Terpadu Kesejahteraan Sosial). Prerequisite: must be in DTKS. Check at cekbansos.kemensos.go.id
- BPJS Kesehatan PBPU (Mandiri) — self-paid, class 1 (Rp 150rb/bulan) / class 2 (Rp 100rb) / class 3 (Rp 35rb). Cannot hold PBI and PBPU simultaneously.

FOOD & INCOME:
- PKH (Program Keluarga Harapan) — conditional cash transfer. Eligible if: have children under 6, pregnant women, school-age children, elderly 70+, or disabled members. Requires DTKS. CANNOT be combined with Prakerja.
- Bansos Sembako / BPNT — food assistance via electronic card. Requires DTKS.

EDUCATION:
- PIP (Program Indonesia Pintar) — for school-age children SD/SMP/SMA from low-income families. Requires DTKS or school recommendation.
- KIP Kuliah — for university applicants from low-income families. Applied during university admission process. CANNOT be combined with PIP for the same person.

EMPLOYMENT & ECONOMIC:
- Kartu Prakerja — training + incentive for unemployed or informal workers. Apply at prakerja.go.id. CANNOT be combined with PKH.
- KUR Mikro (Kredit Usaha Rakyat) — subsidized business loans up to Rp 100 juta for micro entrepreneurs. Applied at partner banks (BRI, BNI, Mandiri, etc.)

HOUSING (surface only, recommend official channels for details):
- FLPP — subsidized mortgage for low-income first-time homebuyers
- Rusunawa — subsidized rental apartments managed by local government

KEY GATEWAY — DTKS:
- Being registered in DTKS is the prerequisite for PBI, PKH, PIP, BPNT
- Check status: cekbansos.kemensos.go.id
- If not registered but eligible: go to RT/RW and request inclusion in next DTKS update cycle
- Getting into DTKS is often the single highest-leverage first step

---

HONEST AI RULES — never violate:

1. Never say "kamu pasti dapat" or "kamu pasti eligible" — always use probabilistic framing
2. Never give specific benefit amounts — say "jumlahnya bervariasi tergantung daerah"
3. Never make medical assessments
4. Always name the human authority who makes the final decision
5. If unsure about a specific local rule, say so and direct to relevant office
6. Never recommend applying when prerequisite steps are missing

TONE:
- Warm and direct, like a knowledgeable friend
- Never condescending — the system is complicated, not the user
- Acknowledge emotional weight when relevant, but always move toward action
- Empathy + momentum, not just empathy

Do not add generic disclaimers at the end of every response. Disclaimers are built into the recommendation structure. Keep responses focused and actionable.
```

---

## Struktur Project yang Disarankan

```
claim-it/
├── app/
│   ├── page.tsx                    # Landing page
│   ├── chat/
│   │   └── page.tsx                # Main chat interface
│   ├── results/
│   │   └── page.tsx                # Recommendation results
│   ├── summary/
│   │   └── page.tsx                # Actionable summary/takeaway
│   └── api/
│       └── chat/
│           └── route.ts            # Gemini API route handler
├── components/
│   ├── ChatBubble.tsx              # AI and user message bubbles
│   ├── ChipOptions.tsx             # Tappable answer chips
│   ├── ProgramCard.tsx             # Recommendation card component
│   ├── VerdictBadge.tsx            # Green/yellow/red eligibility badge
│   ├── SummaryCard.tsx             # Actionable takeaway component
│   └── LoadingScreen.tsx           # Processing animation
├── lib/
│   ├── gemini.ts                   # Gemini client + system prompt
│   ├── parseRecommendations.ts     # Parse JSON from Gemini response
│   └── types.ts                    # TypeScript types for all data structures
├── CLAUDE.md                       # This file
└── .env.local                      # GEMINI_API_KEY
```

---

## TypeScript Types

```typescript
// lib/types.ts

export type VerdictType = "eligible" | "verify" | "not_yet";

export interface ProgramRecommendation {
  programName: string;
  whyRelevant: string;
  verdict: VerdictType;
  verdictLabel: string;
  pros: string[];
  cons: string[];
  steps: string[];
  documents: string[];
}

export interface RecommendationResponse {
  recommendations: ProgramRecommendation[];
  conflicts: string | null;
  synergies: string | null;
  priorityAction: string;
}

export interface SummaryResponse {
  summary: {
    situationDescription: string;
    recommendations: {
      programName: string;
      verdict: string;
      firstStep: string;
    }[];
    priorityAction: string;
    disclaimer: string;
  };
}

export interface ChatMessage {
  role: "user" | "model";
  content: string;
}
```

---

## Hal Penting untuk Diingat saat Coding

1. **Conversation history** harus dikirim ke Gemini di setiap request — Gemini tidak punya memory antar call. Simpan history di React state atau sessionStorage.

2. **Parse JSON dari Gemini** — response Gemini kadang wrap JSON dalam markdown code block. Strip backticks sebelum JSON.parse:
```typescript
const clean = text.replace(/```json\n?|\n?```/g, "").trim();
const data = JSON.parse(clean);
```

3. **Detect kapan switch ke results page** — parse setiap Gemini response, kalau ada field `recommendations` di JSON, trigger navigation ke results page.

4. **Error handling** — Gemini bisa timeout atau return malformed JSON. Selalu wrap dalam try/catch dan ada fallback UI yang graceful.

5. **Loading state** — Gemini response bisa 2-5 detik. Selalu show loading indicator, jangan biarkan UI blank.

6. **Mobile-first** — target user adalah orang Indonesia yang kemungkinan besar akses via smartphone. Desain untuk layar 390px width.

---

## Responsible AI — Konteks Hackathon

Untuk submission Devpost, dokumentasikan ini:

**Risk**: AI bisa salah interpretasi eligibility criteria → user apply ke program yang salah dan buang waktu/tenaga

**Mitigation**: 
- Framing probabilistik ("kemungkinan besar" bukan "pasti")
- Selalu named human authority yang buat keputusan final
- Disclaimer di setiap summary output

**Human-in-the-loop**: 
- Verifikasi DTKS → Dinas Sosial
- Final eligibility → petugas program masing-masing
- AI tidak pernah konfirmasi keputusan — hanya bantu user memahami posisi mereka

---

*File ini dibuat sebagai context untuk Claude Code. Update sesuai kebutuhan saat development.*