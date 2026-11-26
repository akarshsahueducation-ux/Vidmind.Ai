import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { transcribeVideoSliceWithGemini } from "@/lib/ai/transcribe";
import { extractYouTubeVideoId } from "@/lib/youtube/extractor";

export const maxDuration = 60;

const SliceSchema = z.object({
  url: z.string().min(5),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().positive(),
  language: z.string().min(2).max(12).default("en"),
  existingTitle: z.string().optional().default(""),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = SliceSchema.parse(await req.json());
    const videoId = extractYouTubeVideoId(parsed.url);
    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

    const result = await transcribeVideoSliceWithGemini({
      youtubeUrl: canonicalUrl,
      startSeconds: parsed.startSeconds,
      endSeconds: parsed.endSeconds,
      language: parsed.language,
      existingTitle: parsed.existingTitle,
    });

    if (!result) {
      return NextResponse.json({
        sliceComplete: false,
        segments: [],
        chapters: [],
      });
    }

    return NextResponse.json({
      sliceComplete: true,
      segments: result.segments,
      chapters: result.chapters,
      inferredTitle: result.inferredTitle,
      speakerOrChannel: result.speakerOrChannel,
      engine: result.engine,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid slice request." }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Slice transcription failed." },
      { status: 500 }
    );
  }
}
