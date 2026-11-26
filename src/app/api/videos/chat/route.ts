import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { answerVideoQuestionRAG } from "@/lib/ai/pipeline";
import { checkRateLimit } from "@/lib/rate-limit";

const ChatSchema = z.object({
  question: z.string().min(1).max(1200),
  videoTitle: z.string().default("YouTube Video"),
  segments: z.array(
    z.object({
      start: z.number(),
      duration: z.number(),
      text: z.string(),
      timestamp: z.string(),
    })
  ),
  chunks: z.array(
    z.object({
      index: z.number(),
      startSeconds: z.number(),
      endSeconds: z.number(),
      startTimestamp: z.string(),
      endTimestamp: z.string(),
      content: z.string(),
    })
  ),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "local";
  if (!checkRateLimit(`chat:${ip}`, 40, 60_000).allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  try {
    const parsed = ChatSchema.parse(await req.json());
    const response = await answerVideoQuestionRAG(parsed);
    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid chat request." }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat failed" },
      { status: 500 }
    );
  }
}
