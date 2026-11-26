import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateStudyArtifact } from "@/lib/ai/pipeline";

export const maxDuration = 60;

const StudySchema = z.object({
  kind: z.enum(["notes", "quiz", "flashcards", "mindmap", "presentation", "repurpose"]),
  title: z.string().min(1),
  topics: z.array(z.string()).default([]),
  customTopic: z.string().optional().default(""),
  segments: z
    .array(
      z.object({
        start: z.number(),
        duration: z.number(),
        text: z.string(),
        timestamp: z.string(),
      })
    )
    .optional()
    .default([]),
  chunks: z.array(
    z.object({
      index: z.number(),
      startSeconds: z.number(),
      endSeconds: z.number(),
      startTimestamp: z.string(),
      endTimestamp: z.string(),
      content: z.string(),
      embedding: z.array(z.number()).optional(),
    })
  ),
  options: z.record(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = StudySchema.parse(await req.json());
    const result = await generateStudyArtifact(parsed);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid studio request." }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
