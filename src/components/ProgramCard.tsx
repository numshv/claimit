"use client";

import { useState } from "react";
import { ProgramRecommendation } from "@/lib/types";
import VerdictBadge from "./VerdictBadge";

interface ProgramCardProps {
  program: ProgramRecommendation;
  onShowSteps?: () => void;
}

export default function ProgramCard({ program }: ProgramCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  return (
    <div
      className="bg-white mb-[14px] drop-shadow-[0px_2px_4px_rgba(60,40,10,0.05)]"
      style={{ borderRadius: "22px" }}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="text-[19px] font-bold text-[#2b2620] leading-snug flex-1">
            {program.programName}
          </h3>
          <VerdictBadge verdict={program.verdict} />
        </div>

        <p className="text-[14px] text-[#6b6155] leading-[21px] mb-4">
          {program.whyRelevant}
        </p>

        <div className="border-t border-[#f2ebe0] pt-[14px]">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center justify-between w-full text-[#11808a]"
          >
            <span className="text-[13px] font-semibold">Pros &amp; cons</span>
            <span className="text-[11px] font-semibold">
              {expanded ? "▲ hide" : "▼ show"}
            </span>
          </button>

          {expanded && (
            <div className="mt-[14px] space-y-4">
              <div>
                <p className="text-[11px] font-bold text-[#1b7a43] tracking-[0.55px] uppercase mb-2">
                  Benefits
                </p>
                <div className="space-y-[5px]">
                  {program.pros.map((pro, i) => (
                    <p key={i} className="text-[13px] text-[#4a4236] leading-[18.85px]">
                      • {pro}
                    </p>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-bold text-[#9a6207] tracking-[0.55px] uppercase mb-2">
                  Watch Out For
                </p>
                <div className="space-y-[5px]">
                  {program.cons.map((con, i) => (
                    <p key={i} className="text-[13px] text-[#4a4236] leading-[18.85px]">
                      • {con}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {!showSteps ? (
        <button
          onClick={() => setShowSteps(true)}
          className="mx-5 mb-5 w-[calc(100%-40px)] bg-[#11808a] text-white text-[15px] font-semibold py-[14px] rounded-[16px] text-center"
        >
          See How to Apply
        </button>
      ) : (
        <div className="mx-5 mb-5 border-t border-[#f2ebe0] pt-4">
          <p className="text-[11px] font-bold text-[#7a6f62] tracking-[0.55px] uppercase mb-3">
            Steps to Apply
          </p>
          <ol className="space-y-2 mb-4">
            {program.steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-[13px] text-[#4a4236] leading-[19px]">
                <span className="flex-shrink-0 w-5 h-5 bg-[#e8f3f4] text-[#0a5c64] rounded-full flex items-center justify-center text-[11px] font-semibold mt-0.5">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          {program.documents.length > 0 && (
            <>
              <p className="text-[11px] font-bold text-[#7a6f62] tracking-[0.55px] uppercase mb-2">
                Documents Needed
              </p>
              <ul className="space-y-1">
                {program.documents.map((doc, i) => (
                  <li key={i} className="flex gap-2 items-center text-[13px] text-[#4a4236]">
                    <span className="w-4 h-4 border border-[#d4c9b8] rounded flex-shrink-0" />
                    {doc}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
