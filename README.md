# ClaimIt

AI-powered chatbot yang membantu orang Indonesia menemukan program bantuan pemerintah yang sesuai dengan kondisi hidup mereka — tanpa perlu tahu nama programnya dulu.

## Cara Pakai

1. Buka aplikasi dan klik **Mulai Sekarang**
2. Ceritakan kondisimu secara bebas — tidak perlu formal
3. Jawab pertanyaan lanjutan dari AI (bisa pilih chip atau ketik sendiri)
4. Lihat rekomendasi program bantuan beserta langkah daftarnya
5. Simpan atau bagikan ringkasannya

## Setup Development

### Prerequisites

- Node.js 18+
- Gemini API key — dapatkan gratis di [Google AI Studio](https://aistudio.google.com/app/apikey)

### Instalasi

```bash
git clone <repo-url>
cd claimit
npm install
```

### Konfigurasi

Buat file `.env.local` di root project:

```
GEMINI_API_KEY=your_api_key_here
```

### Jalankan

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

### Build Production

```bash
npm run build
npm start
```

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| AI | Google Gemini API (`gemini-2.0-flash`) |
| Styling | Tailwind CSS v4 |
| Language | TypeScript |

## Struktur Project

```
src/
├── app/
│   ├── page.tsx              # Landing page
│   ├── chat/page.tsx         # Chat interface
│   ├── results/page.tsx      # Hasil rekomendasi
│   ├── summary/page.tsx      # Ringkasan yang bisa disimpan
│   └── api/chat/route.ts     # API route → Gemini
├── components/
│   ├── ChatBubble.tsx
│   ├── ChipOptions.tsx
│   ├── ProgramCard.tsx
│   ├── VerdictBadge.tsx
│   └── LoadingScreen.tsx
└── lib/
    ├── gemini.ts             # Gemini client + system prompt
    └── types.ts              # TypeScript interfaces
```

## Catatan

- Data percakapan tidak disimpan di server — semua di browser session
- Rekomendasi bersifat informatif, bukan keputusan resmi
- Eligibility final ditentukan oleh petugas yang berwenang (Dinas Sosial, BPJS, dll.)
