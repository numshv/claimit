"use client";

import { useState } from "react";

interface ChipOptionsProps {
  options: string[];
  onSelect: (value: string) => void;
}

export default function ChipOptions({ options, onSelect }: ChipOptionsProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleSelect = (option: string) => {
    if (selected !== null) return;
    setSelected(option);
    onSelect(option);
  };

  return (
    <div className="flex flex-col gap-[8px] mt-1 mb-3 w-full max-w-[280px]">
      {options.map((option) => (
        <button
          key={option}
          onClick={() => handleSelect(option)}
          disabled={selected !== null}
          className={`px-5 py-[13px] rounded-[26px] text-[14px] font-medium transition-all ${
            selected === option
              ? "bg-[#dceff0] text-[#0a5c64]"
              : selected !== null
              ? "bg-[#f3e9db] text-[#5a5042] opacity-50 cursor-not-allowed"
              : "bg-[#f3e9db] text-[#5a5042] active:bg-[#dceff0] active:text-[#0a5c64]"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
