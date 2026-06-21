"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ChatBubble from "@/components/ChatBubble";
import ChipOptions from "@/components/ChipOptions";
import LoadingScreen from "@/components/LoadingScreen";
import { ChatMessage, RecommendationResponse } from "@/lib/types";

const OPENING_MESSAGE =
  "Hi! Tell me what's going on — what are you dealing with right now, or what kind of support are you looking for? No need to be formal, just talk to me like a friend.";

const INCOME_CHIPS = [
  "Very low / no income",
  "Low income",
  "Moderate income",
  "Middle income",
  "Above average",
];

const INCOME_TRIGGERS = ["income", "salary", "earn", "household income", "monthly income", "how much"];

function shouldShowIncomeChips(text: string): boolean {
  const lower = text.toLowerCase();
  return INCOME_TRIGGERS.some((t) => lower.includes(t));
}

function tryParseRecommendations(text: string): RecommendationResponse | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && Array.isArray(parsed.recommendations)) {
      return parsed as RecommendationResponse;
    }
  } catch {
    // not JSON
  }
  return null;
}

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "model", content: OPENING_MESSAGE },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showChips, setShowChips] = useState(false);
  const [chipOptions, setChipOptions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, showChips]);

  async function fetchGeminiResponse(history: ChatMessage[], message: string) {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history, message }),
      });

      if (!res.ok) throw new Error("Server error");

      const data = await res.json();
      const responseText: string = data.response;

      const recommendations = tryParseRecommendations(responseText);
      if (recommendations) {
        sessionStorage.setItem("recommendations", JSON.stringify(recommendations));
        router.push("/results");
        return;
      }

      const aiMessage: ChatMessage = { role: "model", content: responseText };
      setMessages((prev) => [...prev, aiMessage]);

      if (shouldShowIncomeChips(responseText)) {
        setChipOptions(INCOME_CHIPS);
        setShowChips(true);
      } else {
        setShowChips(false);
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSend(text?: string) {
    const messageText = (text ?? input).trim();
    if (!messageText || isLoading) return;

    setInput("");
    setShowChips(false);

    // Capture history BEFORE adding user message — Gemini receives history + message separately.
    const historyBeforeUser = [...messages];
    const userMessage: ChatMessage = { role: "user", content: messageText };
    setMessages((prev) => [...prev, userMessage]);

    await fetchGeminiResponse(historyBeforeUser, messageText);
  }

  function handleChipSelect(option: string) {
    handleSend(option);
  }

  function handleRetry() {
    setError(null);
    const last = messages[messages.length - 1];
    if (last?.role === "user") {
      const historyWithoutLast = messages.slice(0, -1);
      fetchGeminiResponse(historyWithoutLast, last.content);
    }
  }

  return (
    <div className="min-h-screen bg-[#fbf6ef] flex flex-col">
      {isLoading && <LoadingScreen />}

      {/* Header */}
      <header className="bg-[#fbf6ef] border-b border-[#efe6d8] px-5 pt-[6px] pb-4 flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={() => router.push("/")}
          className="w-[30px] h-[30px] flex items-center justify-center text-[#11808a] text-[18px] font-semibold rounded-full"
        >
          ‹
        </button>
        <div>
          <p className="text-[16px] font-semibold text-[#2b2620] leading-none">ClaimIt</p>
          <p className="text-[12px] text-[#11808a] mt-0.5">● Online · ready to help</p>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-5 py-6 flex flex-col">
        {messages.map((msg, i) => (
          <ChatBubble key={i} role={msg.role} content={msg.content} />
        ))}

        {showChips && chipOptions.length > 0 && (
          <ChipOptions options={chipOptions} onSelect={handleChipSelect} />
        )}

        {error && (
          <div className="bg-[#fde8e8] border border-[#f5c6c6] rounded-[16px] px-4 py-3 text-[13px] text-[#b02a2a] mb-3 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={handleRetry} className="ml-3 underline font-semibold whitespace-nowrap">
              Try again
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Input area */}
      <div className="bg-[#fbf6ef] border-t border-[#efe6d8] px-[18px] pt-[14px] pb-7 sticky bottom-0">
        <div className="flex gap-[10px] items-end">
          <div
            className="flex-1 bg-white border border-[#eadfcf] px-4 py-[14px] min-h-[48px] max-h-32 flex items-center"
            style={{ borderRadius: "20px" }}
          >
            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = e.target.scrollHeight + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={showChips ? "or type your answer…" : "Share what's going on…"}
              disabled={isLoading}
              rows={1}
              className="w-full resize-none bg-transparent text-[15px] text-[#2b2620] placeholder-[#b3a795] focus:outline-none disabled:text-[#b3a795] leading-[22px]"
            />
          </div>
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
            className="w-[48px] h-[48px] bg-[#11808a] text-white flex items-center justify-center flex-shrink-0 hover:bg-[#0e6e76] disabled:bg-[#d4c9b8] disabled:cursor-not-allowed transition-colors text-[20px] font-semibold"
            style={{ borderRadius: showChips ? "50%" : "18px" }}
          >
            ↑
          </button>
        </div>
        {!showChips && messages.length <= 1 && (
          <p className="text-[13px] text-[#a89c8c] mt-3 leading-[18px]">
            Example: I just lost my job and have 2 kids in school
          </p>
        )}
      </div>
    </div>
  );
}
