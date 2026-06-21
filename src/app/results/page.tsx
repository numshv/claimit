"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProgramCard from "@/components/ProgramCard";
import { RecommendationResponse } from "@/lib/types";

export default function ResultsPage() {
  const router = useRouter();
  const [data, setData] = useState<RecommendationResponse | null>(null);
  const [error, setError] = useState(false);

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

  if (error) {
    return (
      <div className="min-h-screen bg-[#fbf6ef] flex flex-col items-center justify-center px-6 max-w-md mx-auto">
        <p className="text-[#6b6155] text-center mb-6 text-[15px] leading-[23px]">
          Data rekomendasi tidak ditemukan. Mulai percakapan baru ya.
        </p>
        <button
          onClick={() => { sessionStorage.clear(); router.push("/chat"); }}
          className="bg-[#11808a] text-white rounded-[18px] px-8 py-[14px] font-semibold text-[16px]"
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
      <header className="bg-[#fbf6ef] px-[22px] pt-3 pb-2 sticky top-0 z-10">
        <h2 className="text-[25px] font-bold text-[#2b2620] tracking-[-0.25px]">
          Rekomendasi untuk kamu
        </h2>
        <p className="text-[14px] text-[#7a6f62] leading-[21px] mt-1">
          {data.recommendations.length} program ditemukan berdasarkan situasimu
        </p>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-[18px] pt-[4px] pb-6">
        {data.recommendations.map((program, i) => (
          <ProgramCard key={i} program={program} />
        ))}

        {/* Conflicts */}
        {data.conflicts && (
          <div className="bg-[#fff8ec] border border-[#f5dfa0] rounded-[18px] p-4 mb-[14px]">
            <p className="text-[13px] font-bold text-[#9a6207] uppercase tracking-[0.52px] mb-1">
              Tidak bisa digabung
            </p>
            <p className="text-[13px] text-[#5a4a30] leading-[19.5px]">{data.conflicts}</p>
          </div>
        )}

        {/* Synergies */}
        {data.synergies && (
          <div className="bg-[#e8f3f4] rounded-[18px] p-4 mb-[14px]">
            <p className="text-[13px] font-bold text-[#0a5c64] mb-1">Yang perlu kamu tahu</p>
            <p className="text-[13px] text-[#46595b] leading-[19.5px]">{data.synergies}</p>
          </div>
        )}
      </main>

      {/* Bottom bar */}
      <div className="bg-[#fbf6ef] border-t border-[#efe6d8] px-[18px] pt-[14px] pb-6">
        <button
          onClick={() => router.push("/summary")}
          className="w-full bg-[#11808a] text-white text-[16px] font-semibold rounded-[18px] py-[16px] text-center"
        >
          Simpan Ringkasan
        </button>
        <button
          onClick={() => { sessionStorage.clear(); router.push("/chat"); }}
          className="w-full text-[#a89c8c] text-[14px] py-3 mt-1"
        >
          Mulai Ulang
        </button>
      </div>
    </div>
  );
}
