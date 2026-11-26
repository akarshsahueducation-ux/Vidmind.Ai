import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateStructuredSummary } from "@/lib/ai/pipeline";
import { extractJsonFromLLM, runLLMCompletion } from "@/lib/ai/provider";
import {
  inferMediaMimeType,
  isBinaryMediaFile,
  transcribeMediaWithGemini,
} from "@/lib/ai/transcribe";
import { embedTranscriptChunks } from "@/lib/rag/embeddings";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  chunkTranscript,
  extractYouTubeVideoId,
  fetchYouTubeVideoAndTranscript,
  formatTimestamp,
  parseSrtOrVtt,
  VideoExtractionError,
} from "@/lib/youtube/extractor";
import type { ProcessedVideoPayload, TranscriptSegment } from "@/types/vidmind";

const MAX_UPLOAD_BYTES = 120 * 1024 * 1024; // 120 MB limit
export const maxDuration = 60;

const ProcessSchema = z.object({
  url: z.string().optional().default(""),
  manualTranscript: z.string().optional().default(""),
  manualTitle: z.string().optional().default(""),
  mode: z.enum(["quick", "detailed", "learning"]).default("quick"),
  focus: z
    .enum(["full", "summary_only", "action_items", "definitions", "chapters_only"])
    .default("full"),
  level: z.enum(["beginner", "intermediate", "advanced"]).default("intermediate"),
  language: z.string().min(2).max(12).default("en"),
  stream: z.boolean().optional().default(false),
});

interface UploadedMediaPayload {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
}

async function runVideoPipeline(
  parsed: z.infer<typeof ProcessSchema>,
  uploadedMedia?: UploadedMediaPayload | null,
  emit?: (stage: string, pct: number, detail: string) => void
): Promise<ProcessedVideoPayload> {
  const startedAt = Date.now();
  let videoId = `media-${Date.now().toString(36)}`;
  let url = parsed.url.trim();
  let title = parsed.manualTitle.trim() || "Untitled Media Workspace";
  let channelName = "Uploaded Media";
  let description = "";
  let durationSeconds = 0;
  let thumbnailUrl = "";
  let language = parsed.language;
  let isAutoCaptions = false;
  let segments: TranscriptSegment[] = [];
  let existingChapters: ProcessedVideoPayload["summary"]["chapters"] = [];
  let sourceType: ProcessedVideoPayload["video"]["sourceType"] = "user_text";
  let customNotice: string | undefined;

  if (uploadedMedia) {
    if (uploadedMedia.bytes.byteLength > MAX_UPLOAD_BYTES) {
      throw new VideoExtractionError(
        "Uploaded file exceeds the 120 MB limit. Upload an audio extract (.mp3/.m4a) or compress the video.",
        413
      );
    }

    if (isBinaryMediaFile(uploadedMedia.fileName, uploadedMedia.mimeType)) {
      emit?.("metadata", 15, `Inspecting uploaded media (${uploadedMedia.fileName})...`);
      emit?.(
        "transcript",
        30,
        "Transcribing speech & inferring title/chapters directly from uploaded media..."
      );
      const transcribed = await transcribeMediaWithGemini({
        fileBytes: uploadedMedia.bytes,
        mimeType: inferMediaMimeType(uploadedMedia.fileName, uploadedMedia.mimeType),
        fileName: uploadedMedia.fileName,
        existingTitle: parsed.manualTitle.trim(),
        language: parsed.language,
      });

      if (!transcribed || !transcribed.segments.length) {
        throw new VideoExtractionError(
          "Could not transcribe spoken audio from this uploaded media file. Ensure a Gemini API key is configured and the file contains clear audio.",
          422
        );
      }

      title = parsed.manualTitle.trim() || transcribed.inferredTitle;
      description = transcribed.inferredDescription;
      channelName = transcribed.speakerOrChannel || "Uploaded Media";
      language = transcribed.detectedLanguage || parsed.language;
      durationSeconds = transcribed.durationEstimateSeconds;
      existingChapters = transcribed.chapters;
      segments = transcribed.segments;
      isAutoCaptions = true;
      sourceType = "uploaded_media";
      customNotice =
        "Transcribed directly from your uploaded video/audio — AI automatically generated timestamps, title, and chapters.";
    } else {
      const textContent = new TextDecoder().decode(uploadedMedia.bytes);
      emit?.("transcript", 25, `Parsing subtitle/text file (${uploadedMedia.fileName})...`);
      const srtParsed = parseSrtOrVtt(textContent);
      if (srtParsed.length > 0) {
        segments = srtParsed;
        durationSeconds = Math.round(
          srtParsed[srtParsed.length - 1].start + srtParsed[srtParsed.length - 1].duration
        );
      } else {
        const lines = textContent
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        segments = lines.map((text, idx) => ({
          start: idx * 15,
          duration: 15,
          text,
          timestamp: formatTimestamp(idx * 15),
        }));
        durationSeconds = segments.length * 15;
      }
      title =
        parsed.manualTitle.trim() ||
        uploadedMedia.fileName.replace(/\.(srt|vtt|txt)$/i, "") ||
        "Uploaded Transcript";
      channelName = "Uploaded Transcript";
      sourceType = "user_text";
    }
  } else if (parsed.manualTranscript.trim()) {
    videoId = "custom";
    emit?.("transcript", 25, "Parsing pasted captions/transcript...");
    const srtParsed = parseSrtOrVtt(parsed.manualTranscript);
    if (srtParsed.length > 0) {
      segments = srtParsed;
      durationSeconds = Math.round(
        srtParsed[srtParsed.length - 1].start + srtParsed[srtParsed.length - 1].duration
      );
    } else {
      const lines = parsed.manualTranscript
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      segments = lines.map((text, idx) => ({
        start: idx * 15,
        duration: 15,
        text,
        timestamp: formatTimestamp(idx * 15),
      }));
      durationSeconds = segments.length * 15;
    }
    title = parsed.manualTitle.trim() || "Custom Transcript Workspace";
    channelName = "Uploaded Transcript";
    sourceType = "user_text";
  } else {
    emit?.("metadata", 15, "Validating URL & extracting YouTube metadata...");
    videoId = extractYouTubeVideoId(parsed.url);
    url = `https://www.youtube.com/watch?v=${videoId}`;

    emit?.("transcript", 30, "Checking YouTube captions & chapter markers...");
    const fetched = await fetchYouTubeVideoAndTranscript(videoId, parsed.language);
    title = fetched.title;
    channelName = fetched.channelName;
    description = fetched.description;
    durationSeconds = fetched.durationSeconds;
    thumbnailUrl = fetched.thumbnailUrl;
    language = fetched.language;
    isAutoCaptions = fetched.isAutoCaptions;
    segments = fetched.segments;
    existingChapters = fetched.chapters;

    if (segments.length > 0) {
      sourceType = "captions";
    } else {
      emit?.(
        "transcript",
        40,
        "No YouTube captions available — running automated AI audio transcription fallback..."
      );
      try {
        const transcribed = await transcribeMediaWithGemini({
          youtubeUrl: url,
          existingTitle: title,
          language: parsed.language,
        });
        if (transcribed && transcribed.segments.length > 0) {
          segments = transcribed.segments;
          if (!title || title.startsWith("YouTube Video (")) {
            title = transcribed.inferredTitle;
          }
          if (!description) {
            description = transcribed.inferredDescription;
          }
          if (!existingChapters.length && transcribed.chapters.length) {
            existingChapters = transcribed.chapters;
          }
          if (!durationSeconds && transcribed.durationEstimateSeconds) {
            durationSeconds = transcribed.durationEstimateSeconds;
          }
          isAutoCaptions = true;
          sourceType = "audio_transcription";
          customNotice =
            "YouTube captions were unavailable for this video — VidMind AI automatically transcribed the audio stream so full notes, flashcards, quizzes, and timestamp search work normally.";
        } else {
          sourceType = "metadata_fallback";
        }
      } catch {
        sourceType = "metadata_fallback";
      }

      if (!segments.length) {
        if (existingChapters.length > 0 || description.trim().length > 20) {
          const chapterSegs: TranscriptSegment[] = existingChapters.map((ch) => ({
            start: ch.startSeconds,
            duration: 30,
            text: `${ch.title}${ch.summary ? `: ${ch.summary}` : ""}`,
            timestamp: ch.timestamp,
          }));
          const descLines = description
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l.length > 15 && !/^https?:\/\//i.test(l))
            .slice(0, 12)
            .map((text, idx) => ({
              start: idx * 30,
              duration: 30,
              text,
              timestamp: formatTimestamp(idx * 30),
            }));
          segments = chapterSegs.length ? chapterSegs : descLines;
        }

        if (!segments.length && title && !title.startsWith("YouTube Video (")) {
          try {
            emit?.("transcript", 48, "Building AI study breakdown from video topic & metadata...");
            const synthRes = await runLLMCompletion({
              systemPrompt:
                "You are an expert educational content synthesizer. Given a YouTube video's title, channel, and any available metadata, produce a structured, accurate, educational topic breakdown so students can study, quiz, and ask questions.",
              jsonMode: true,
              userPrompt: `Video Title: ${title}
Channel: ${channelName}
Duration Seconds: ${durationSeconds || 1800}
Description: ${description.slice(0, 1200) || "Not exposed"}
Target Language: ${parsed.language}

Return STRICT JSON:
{
  "chapters": [{"startSeconds": number, "title": string}],
  "segments": [{"startSeconds": number, "text": string}]
}
Include 8 to 14 chronological study segments covering the core concepts taught in this video.`,
            });
            if (synthRes) {
              const synthJson = extractJsonFromLLM<{
                chapters?: Array<{ startSeconds?: number; title?: string }>;
                segments?: Array<{ startSeconds?: number; text?: string }>;
              }>(synthRes.text);
              if (Array.isArray(synthJson.segments) && synthJson.segments.length > 0) {
                segments = synthJson.segments
                  .filter((s) => s && String(s.text || "").trim())
                  .map((s) => {
                    const start = Math.max(0, Number(s.startSeconds || 0));
                    return {
                      start,
                      duration: 45,
                      text: String(s.text).trim(),
                      timestamp: formatTimestamp(start),
                    };
                  });
              }
              if (!existingChapters.length && Array.isArray(synthJson.chapters)) {
                existingChapters = synthJson.chapters
                  .filter((c) => c && String(c.title || "").trim())
                  .map((c) => {
                    const startSeconds = Math.max(0, Number(c.startSeconds || 0));
                    return {
                      startSeconds,
                      timestamp: formatTimestamp(startSeconds),
                      title: String(c.title).trim(),
                      summary: "",
                    };
                  });
              }
            }
          } catch {
            // Fall through gracefully
          }
        }

        if (segments.length) {
          sourceType = "metadata_fallback";
          customNotice =
            "YouTube blocked direct captions and the video exceeded the live audio transcription window — VidMind AI synthesized a structured study breakdown from the video's title, chapters, and topic context.";
        }
      }
    }
  }

  emit?.("chunking", 55, "Segmenting transcript into timestamped chunks...");
  const rawChunks = chunkTranscript(segments, 650);

  let chunks = rawChunks;
  if (rawChunks.length > 0 && Date.now() - startedAt < 40_000) {
    emit?.("embeddings", 68, `Indexing ${rawChunks.length} chunk(s) with vector embeddings...`);
    chunks = await embedTranscriptChunks(rawChunks, (done, total) => {
      const pct = 68 + Math.round((done / Math.max(1, total)) * 14);
      emit?.("embeddings", pct, `Embedded ${done}/${total} transcript chunks...`);
    });
  }

  const wordCount = segments
    .map((s) => s.text)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;

  emit?.("summarizing", 86, "Synthesizing focused knowledge & takeaways...");
  const { summary, warning } = await generateStructuredSummary({
    title,
    channelName,
    segments,
    chunks,
    existingChapters,
    mode: parsed.mode,
    focus: parsed.focus,
    level: parsed.level,
    language: parsed.language,
  });

  return {
    video: {
      videoId,
      url,
      title,
      channelName,
      description,
      thumbnailUrl,
      durationSeconds,
      durationFormatted: durationSeconds ? formatTimestamp(durationSeconds) : "Unknown",
      language,
      isAutoCaptions,
      hasTranscript: segments.length > 0,
      wordCount,
      sourceType,
    },
    summary,
    transcript: segments,
    chunks,
    warning: customNotice || warning,
  };
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "local";
  if (!checkRateLimit(`process:${ip}`, 20, 60_000).allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please wait a minute before processing another video." },
      { status: 429 }
    );
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    let parsed: z.infer<typeof ProcessSchema>;
    let uploadedMedia: UploadedMediaPayload | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const fileEntry = formData.get("file");
      if (fileEntry && typeof fileEntry === "object" && "arrayBuffer" in fileEntry) {
        const ab = await fileEntry.arrayBuffer();
        uploadedMedia = {
          bytes: new Uint8Array(ab),
          fileName: "name" in fileEntry ? String(fileEntry.name) : "uploaded-media.mp4",
          mimeType: "type" in fileEntry ? String(fileEntry.type) : "",
        };
      }
      parsed = ProcessSchema.parse({
        url: String(formData.get("url") || ""),
        manualTranscript: String(formData.get("manualTranscript") || ""),
        manualTitle: String(formData.get("manualTitle") || ""),
        mode: String(formData.get("mode") || "quick"),
        focus: String(formData.get("focus") || "full"),
        level: String(formData.get("level") || "intermediate"),
        language: String(formData.get("language") || "en"),
        stream: String(formData.get("stream") || "false") === "true",
      });
    } else {
      const raw = await req.json();
      parsed = ProcessSchema.parse(raw);
    }

    if (parsed.stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          const send = (obj: Record<string, unknown>) => {
            controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
          };
          try {
            const payload = await runVideoPipeline(parsed, uploadedMedia, (stage, pct, detail) => {
              send({ type: "progress", stage, pct, detail });
            });
            send({ type: "result", payload });
          } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to process video";
            send({ type: "error", error: message });
          } finally {
            controller.close();
          }
        },
      });
      return new Response(readable, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    const payload = await runVideoPipeline(parsed, uploadedMedia);
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof VideoExtractionError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request parameters", details: err.flatten() },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to process video" },
      { status: 500 }
    );
  }
}
