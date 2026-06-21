"use client";

interface ChatBubbleProps {
  role: "user" | "model";
  content: string;
}

export default function ChatBubble({ role, content }: ChatBubbleProps) {
  if (role === "user") {
    return (
      <div className="flex justify-end mb-3">
        <div
          className="max-w-[80%] bg-[#11808a] text-white text-[15px] leading-[22.5px] px-4 py-[14px]"
          style={{ borderRadius: "20px 6px 20px 20px" }}
        >
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start mb-3">
      <div
        className="max-w-[85%] bg-white text-[#3a332a] text-[15px] leading-[23.25px] px-[18px] py-[16px] drop-shadow-[0px_1px_1.5px_rgba(0,0,0,0.04)]"
        style={{ borderRadius: "6px 20px 20px 20px" }}
      >
        {content}
      </div>
    </div>
  );
}
