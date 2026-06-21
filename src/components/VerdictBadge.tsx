import { VerdictType } from "@/lib/types";

interface VerdictBadgeProps {
  verdict: VerdictType;
}

const VERDICT_CONFIG: Record<VerdictType, { label: string; bg: string; text: string }> = {
  eligible: {
    label: "Kemungkinan Besar Eligible",
    bg: "#e3f3e8",
    text: "#1b7a43",
  },
  verify: {
    label: "Perlu Verifikasi",
    bg: "#fbead0",
    text: "#9a6207",
  },
  not_yet: {
    label: "Belum Optimal Sekarang",
    bg: "#fde8e8",
    text: "#b02a2a",
  },
};

export default function VerdictBadge({ verdict }: VerdictBadgeProps) {
  const { label, bg, text } = VERDICT_CONFIG[verdict];
  return (
    <span
      className="inline-block px-[11px] py-[5px] rounded-[20px] text-[11px] font-semibold whitespace-nowrap"
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  );
}
