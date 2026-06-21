"use client";

import { useState } from "react";
import { ProgramRecommendation } from "@/lib/types";
import VerdictBadge from "./VerdictBadge";

interface ProgramCardProps {
  program: ProgramRecommendation;
  onShowSteps?: () => void;
}

/** Small pill that shows whether data came from our verified DB or general LLM knowledge. */
function SourceBadge({ sourceType }: { sourceType: ProgramRecommendation["source_type"] }) {
  const isVerified = sourceType === "RAG_VERIFIED";
  return (
    <span
      className="inline-flex items-center gap-[5px] px-[9px] py-[3px] rounded-full text-[11px] font-semibold tracking-[0.2px]"
      style={{
        backgroundColor: isVerified ? "#e6f4ec" : "#fff8ec",
        color: isVerified ? "#1b7a43" : "#9a6207",
        border: `1px solid ${isVerified ? "#b2dfc4" : "#f5dfa0"}`,
      }}
      title={
        isVerified
          ? "Verified in our system — this recommendation is grounded in official program documents stored in our database."
          : "Not in our database — this is based on the AI's general knowledge. Always verify details with official government sources."
      }
    >
      {isVerified ? (
        <>
          {/* shield-check icon */}
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 1L2 3.5V8c0 3.3 2.6 6.2 6 7 3.4-.8 6-3.7 6-7V3.5L8 1z" fill="#1b7a43" opacity="0.2"/>
            <path d="M8 1L2 3.5V8c0 3.3 2.6 6.2 6 7 3.4-.8 6-3.7 6-7V3.5L8 1z" stroke="#1b7a43" strokeWidth="1.4" strokeLinejoin="round"/>
            <path d="M5.5 8l1.8 1.8L10.5 6" stroke="#1b7a43" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Verified in our system
        </>
      ) : (
        <>
          {/* warning triangle icon */}
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 2L1.5 13h13L8 2z" fill="#9a6207" opacity="0.15"/>
            <path d="M8 2L1.5 13h13L8 2z" stroke="#9a6207" strokeWidth="1.4" strokeLinejoin="round"/>
            <path d="M8 6v3.5" stroke="#9a6207" strokeWidth="1.4" strokeLinecap="round"/>
            <circle cx="8" cy="11.5" r="0.75" fill="#9a6207"/>
          </svg>
          Not in our database
        </>
      )}
    </span>
  );
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
        {/* Header row: program name + verdict badge */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="text-[19px] font-bold text-[#2b2620] leading-snug flex-1">
            {program.programName}
          </h3>
          <VerdictBadge verdict={program.verdict} />
        </div>

        {/* Source badge — shown only when source_type is present */}
        {program.source_type && (
          <div className="mb-3">
            <SourceBadge sourceType={program.source_type} />
          </div>
        )}

        {/* Why relevant */}
        <p className="text-[14px] text-[#6b6155] leading-[21px] mb-1">
          {program.whyRelevant}
        </p>

        {/* Reasoning / citation — shown when present */}
        {program.reasoning && (
          <p className="text-[12px] text-[#a89c8c] leading-[18px] italic mb-4">
            {program.reasoning}
          </p>
        )}
        {!program.reasoning && <div className="mb-4" />}

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

