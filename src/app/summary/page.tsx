"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import VerdictBadge from "@/components/VerdictBadge";
import { RecommendationResponse, VerdictType } from "@/lib/types";

export default function SummaryPage() {
  const router = useRouter();
  const summaryRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<RecommendationResponse | null>(null);
  const [error, setError] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const today = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("recommendations");
      if (!raw) { setError(true); return; }
      const parsed: RecommendationResponse = JSON.parse(raw);
      if (!parsed?.recommendations?.length) { setError(true); return; }
      setData(parsed);
    } catch {
      setError(true);
    }
  }, []);

  function buildShareText(): string {
    if (!data) return "";
    const lines = [
      "📋 Ringkasan Bantuan Sosial — ClaimIt",
      `📅 ${today}`,
      "",
    ];
    data.recommendations.forEach((r) => {
      lines.push(`• ${r.programName} — ${r.verdictLabel}`);
      if (r.steps[0]) lines.push(`  Langkah pertama: ${r.steps[0]}`);
    });
    lines.push("", `🎯 Prioritas: ${data.priorityAction}`, "");
    lines.push("Rekomendasi ini bukan keputusan resmi. Eligibility final ditentukan oleh petugas yang berwenang.");
    return lines.join("\n");
  }

  async function handleShare() {
    const text = buildShareText();
    if (navigator.share) {
      try { await navigator.share({ title: "Ringkasan ClaimIt", text }); } catch { /* cancelled */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    } catch { /* ignore */ }
  }

  async function handleSaveImage() {
    const node = summaryRef.current;
    if (!node) return;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(node, { backgroundColor: "#fbf6ef", scale: 2, useCORS: true });
      const link = document.createElement("a");
      link.download = `claimit-ringkasan-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      alert("Gagal menyimpan gambar. Silakan screenshot manual.");
    }
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#fbf6ef] flex flex-col items-center justify-center px-6 max-w-md mx-auto">
        <p className="text-[#6b6155] text-center mb-6 text-[15px]">
          Data tidak ditemukan. Mulai percakapan baru ya.
        </p>
        <button
          onClick={() => { sessionStorage.clear(); router.push("/chat"); }}
          className="bg-[#11808a] text-white rounded-[18px] px-8 py-[14px] font-semibold"
        >
          Mulai Ulang
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#fbf6ef] flex items-center justify-center">
        <div className="relative flex items-center justify-center w-[74px] h-[74px]">
          <div className="absolute inset-0 bg-[#d6ecee] opacity-50 rounded-full" />
          <div className="w-[30px] h-[30px] border-[3px] border-[#11808a] rounded-full animate-spin border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fbf6ef] max-w-md mx-auto flex flex-col">
      {/* Header */}
      <header className="bg-[#fbf6ef] px-[22px] pt-3 pb-2 flex items-center justify-between">
        <div>
          <h2 className="text-[25px] font-bold text-[#2b2620] tracking-[-0.25px]">
            Ringkasan Rekomendasi
          </h2>
          <p className="text-[13px] text-[#a89c8c] mt-0.5">Dibuat {today}</p>
        </div>
        <button onClick={() => router.push("/results")} className="text-[#11808a] text-[13px] font-semibold">
          ← Kembali
        </button>
      </header>

      {/* Summary card (this is what gets screenshotted) */}
      <main className="flex-1 overflow-y-auto px-5 pt-1 pb-6">
        <div ref={summaryRef} className="bg-[#fbf6ef] pt-2 pb-4">
          {/* Situation text */}
          <p className="text-[14px] text-[#4a4236] leading-[22.4px] mb-4">
            {data.recommendations.length} program bantuan ditemukan berdasarkan kondisi yang kamu ceritakan.
          </p>

          {/* Program rows */}
          <div className="space-y-[10px] mb-4">
            {data.recommendations.map((r, i) => (
              <div
                key={i}
                className="bg-white flex items-center justify-between px-4 py-[14px] drop-shadow-[0px_1px_2px_rgba(60,40,10,0.04)]"
                style={{ borderRadius: "16px" }}
              >
                <span className="text-[15px] font-semibold text-[#2b2620]">{r.programName}</span>
                <VerdictBadge verdict={r.verdict as VerdictType} />
              </div>
            ))}
          </div>

          {/* Priority action */}
          <div className="bg-[#11808a] rounded-[20px] px-[18px] pt-[18px] pb-5 mb-4">
            <p className="text-[13px] font-bold text-[#bfe8eb] tracking-[0.52px] uppercase mb-[10px]">
              Langkah Prioritas Sekarang
            </p>
            <p className="text-[16px] font-semibold text-white leading-[24px]">
              {data.priorityAction}
            </p>
          </div>

          {/* Disclaimer */}
          <div className="bg-[#f2ebe0] rounded-[14px] px-4 py-[15px]">
            <p className="text-[12px] text-[#8c8175] leading-[18px]">
              Rekomendasi ini bukan keputusan resmi. Eligibility final ditentukan oleh petugas yang berwenang (Dinas Sosial, BPJS, dll.).
            </p>
          </div>
        </div>

        {copySuccess && (
          <div className="bg-[#e3f3e8] border border-[#a8d9b8] rounded-[14px] px-4 py-3 text-[13px] text-[#1b7a43] text-center mt-2">
            Teks berhasil disalin!
          </div>
        )}
      </main>

      {/* Bottom buttons */}
      <div className="bg-[#fbf6ef] border-t border-[#efe6d8] px-[18px] pt-[14px] pb-[26px] flex gap-3">
        <button
          onClick={handleShare}
          className="flex-1 bg-white border-[1.5px] border-[#11808a] text-[#11808a] text-[16px] font-semibold rounded-[18px] py-[14px] text-center"
        >
          Bagikan
        </button>
        <button
          onClick={handleSaveImage}
          className="flex-1 bg-[#11808a] text-white text-[16px] font-semibold rounded-[18px] py-[14px] text-center leading-tight"
        >
          Simpan sebagai Gambar
        </button>
      </div>
    </div>
  );
}
