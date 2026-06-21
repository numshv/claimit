import { NextRequest, NextResponse } from "next/server";
import { sendMessage } from "@/lib/gemini";
import { ChatMessage } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { history, message } = body as {
      history: ChatMessage[];
      message: string;
    };

    if (typeof message !== "string") {
      return NextResponse.json(
        { error: "Pesan tidak valid." },
        { status: 400 }
      );
    }

    const raw = await sendMessage(history ?? [], message);

    const clean = raw.replace(/```json\n?|\n?```/g, "").trim();

    return NextResponse.json({ response: clean });
  } catch (err) {
    console.error("[chat/route] error:", err);
    return NextResponse.json(
      {
        error:
          "Maaf, terjadi kesalahan saat memproses permintaanmu. Silakan coba lagi.",
      },
      { status: 500 }
    );
  }
}
