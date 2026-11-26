import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateStructuredSummary } from "@/lib/ai/pipeline";
import { embedTranscriptChunks } from "@/lib/rag/embeddings";
import {
  chunkTranscriptForTimeline,
  formatTimestamp,
  parseDescriptionChapters,
} from "@/lib/youtube/extractor";
import type { ProcessedVideoPayload, TranscriptSegment, VideoChapter } from "@/types/vidmind";

export const maxDuration = 60;

const FinalizeSchema = z.object({
  video: z.object({
    videoId: z.string().min(1),
    url: z.string().default(""),
    title: z.string().min(1),
    channelName: z.string().default("YouTube Creator"),
    description: z.string().default(""),
    durationSeconds: z.number().nonnegative().default(0),
    thumbnailUrl: z.string().default(""),
    language: z.string().default("en"),
    isAutoCaptions: z.boolean().default(true),
    sourceType: z
      .enum(["captions", "audio_transcription", "uploaded_media", "user_text", "metadata_fallback"])
      .default("audio_transcription"),
  }),
  segments: z.array(
    z.object({
      start: z.number().nonnegative(),
      duration: z.number().nonnegative(),
      text: z.string(),
      timestamp: z.string(),
    })
  ),
  chapters: z
    .array(
      z.object({
        startSeconds: z.number().nonnegative(),
        timestamp: z.string(),
        title: z.string(),
        summary: z.string().optional().default(""),
      })
    )
    .optional()
    .default([]),
  mode: z.enum(["quick", "detailed", "learning"]).default("quick"),
  focus: z
    .enum(["full", "summary_only", "action_items", "definitions", "chapters_only"])
    .default("full"),
  level: z.enum(["beginner", "intermediate", "advanced"]).default("intermediate"),
  language: z.string().min(2).max(12).default("en"),
  warning: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = FinalizeSchema.parse(await req.json());
    const startedAt = Date.now();

    // Sort & deduplicate segments chronologically across all slices
    const seen = new Set<string>();
    const segments: TranscriptSegment[] = parsed.segments
      .slice()
      .sort((a, b) => a.start - b.start)
      .filter((seg) => {
        const key = `${Math.floor(seg.start / 10)}:${seg.text.slice(0, 48).toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return seg.text.trim().length > 0;
      });

    if (!segments.length) {
      return NextResponse.json(
        {
          error:
            "Could not extract genuine captions or spoken audio from this video. Ensure a valid Gemini API key is active, or use Paste Transcript / Upload Video.",
        },
        { status: 422 }
      );
    }

    const chapterMap = new Map<number, VideoChapter>();
    for (const ch of [...parseDescriptionChapters(parsed.video.description), ...parsed.chapters]) {
      const bucket = Math.floor(ch.startSeconds / 30);
      if (!chapterMap.has(bucket) && ch.title.trim()) {
        chapterMap.set(bucket, {
          startSeconds: ch.startSeconds,
          timestamp: ch.timestamp || formatTimestamp(ch.startSeconds),
          title: ch.title.trim(),
          summary: ch.summary || "",
        });
      }
    }
    const existingChapters = Array.from(chapterMap.values()).sort(
      (a, b) => a.startSeconds - b.startSeconds
    );

    const rawChunks = chunkTranscriptForTimeline(segments, 24);
    const chunks =
      rawChunks.length > 0 && Date.now() - startedAt < 30_000
        ? await embedTranscriptChunks(rawChunks)
        : rawChunks;

    const wordCount = segments
      .map((s) => s.text)
      .join(" ")
      .split(/\s+/)
      .filter(Boolean).length;

    const lastSeg = segments[segments.length - 1];
    const effectiveDuration = Math.max(
      parsed.video.durationSeconds,
      lastSeg ? Math.round(lastSeg.start + lastSeg.duration) : 0
    );

    const { summary, warning } = await generateStructuredSummary({
      title: parsed.video.title,
      channelName: parsed.video.channelName,
      segments,
      chunks,
      existingChapters,
      mode: parsed.mode,
      focus: parsed.focus,
      level: parsed.level,
      language: parsed.language,
    });

    const payload: ProcessedVideoPayload = {
      video: {
        videoId: parsed.video.videoId,
        url: parsed.video.url,
        title: parsed.video.title,
        channelName: parsed.video.channelName,
        description: parsed.video.description,
        thumbnailUrl: parsed.video.thumbnailUrl,
        durationSeconds: effectiveDuration,
        durationFormatted: effectiveDuration ? formatTimestamp(effectiveDuration) : "Unknown",
        language: parsed.video.language,
        isAutoCaptions: parsed.video.isAutoCaptions,
        hasTranscript: true,
        wordCount,
        sourceType: parsed.video.sourceType,
      },
      summary,
      transcript: segments,
      chunks,
      warning: parsed.warning || warning,
    };

    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid finalize payload." }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to finalize video." },
      { status: 500 }
    );
  }
}
