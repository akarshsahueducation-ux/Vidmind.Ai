import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateStructuredSummary } from "@/lib/ai/pipeline";
import {
  inferMediaMimeType,
  isBinaryMediaFile,
  probeYouTubeDurationWithGemini,
  transcribeMediaWithGemini,
  transcribeVideoSliceWithGemini,
} from "@/lib/ai/transcribe";
import { embedTranscriptChunks } from "@/lib/rag/embeddings";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  chunkTranscriptForTimeline,
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
  allowClientSlicing: z.boolean().optional().default(false),
});

interface UploadedMediaPayload {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
}

export interface SlicedTranscriptionHandoff {
  videoId: string;
  url: string;
  title: string;
  channelName: string;
  description: string;
  durationSeconds: number;
  thumbnailUrl: string;
  language: string;
  chapters: ProcessedVideoPayload["summary"]["chapters"];
}

type PipelineOutcome =
  | { kind: "result"; payload: ProcessedVideoPayload }
  | { kind: "needs_sliced_transcription"; meta: SlicedTranscriptionHandoff };

async function runVideoPipeline(
  parsed: z.infer<typeof ProcessSchema>,
  uploadedMedia?: UploadedMediaPayload | null,
  emit?: (stage: string, pct: number, detail: string) => void
): Promise<PipelineOutcome> {
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
        "AI actively listening to uploaded media to generate genuine timestamped captions..."
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
          "Could not transcribe spoken audio from this uploaded media file. Ensure GEMINI_API_KEY is configured and the file has audible speech.",
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
        "Genuine speech transcription generated directly from your uploaded media with synced timestamps.";
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
    emit?.("metadata", 12, "Validating URL & extracting YouTube metadata...");
    videoId = extractYouTubeVideoId(parsed.url);
    url = `https://www.youtube.com/watch?v=${videoId}`;

    emit?.("transcript", 22, "Checking direct YouTube caption tracks...");
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
      // No direct YouTube captions exposed: probe exact video length if watch HTML blocked on cloud IP
      if (!durationSeconds) {
        emit?.("transcript", 28, "Detecting true full video duration across hours...");
        durationSeconds = await probeYouTubeDurationWithGemini(url);
      }

      // If client orchestrator is enabled and video needs multi-slice listening (> 12m), hand off slices to client
      if (parsed.allowClientSlicing && parsed.stream && durationSeconds > 720) {
        return {
          kind: "needs_sliced_transcription",
          meta: {
            videoId,
            url,
            title,
            channelName,
            description,
            durationSeconds,
            thumbnailUrl,
            language,
            chapters: existingChapters,
          },
        };
      }

      // Single-request or parallel server-slice real audio transcription (strictly genuine audio listening)
      emit?.(
        "transcript",
        40,
        "No YouTube captions exposed — AI actively listening to video audio for genuine timestamps..."
      );

      if (durationSeconds > 900) {
        const sliceCount = Math.min(4, Math.max(2, Math.ceil(durationSeconds / 1800)));
        const windowSize = Math.ceil(durationSeconds / sliceCount);
        const sliceResults = await Promise.all(
          Array.from({ length: sliceCount }, (_, i) => {
            const s = i * windowSize;
            const e = Math.min(durationSeconds, (i + 1) * windowSize);
            return transcribeVideoSliceWithGemini({
              youtubeUrl: url,
              startSeconds: s,
              endSeconds: e,
              language: parsed.language,
              existingTitle: title,
            }).catch(() => null);
          })
        );

        const mergedSegs = sliceResults
          .flatMap((r) => r?.segments || [])
          .sort((a, b) => a.start - b.start);
        const mergedChapters = sliceResults.flatMap((r) => r?.chapters || []);

        if (mergedSegs.length > 0) {
          segments = mergedSegs;
          if (!existingChapters.length && mergedChapters.length) {
            existingChapters = mergedChapters;
          }
          isAutoCaptions = true;
          sourceType = "audio_transcription";
          customNotice = `AI listened across ${sliceCount} video sections (${formatTimestamp(
            durationSeconds
          )}) and extracted ${mergedSegs.length} genuine timestamped captions.`;
        }
      } else {
        const transcribed = await transcribeMediaWithGemini({
          youtubeUrl: url,
          existingTitle: title,
          language: parsed.language,
        }).catch(() => null);

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
            "AI actively listened to the video audio stream and generated genuine timestamped captions.";
        }
      }

      if (!segments.length) {
        throw new VideoExtractionError(
          "Could not extract YouTube captions or transcribe the audio stream for this video (it may be private, age-restricted, or temporarily rate-limited). Try again, upload the audio/video file, or use Paste Transcript Instead.",
          422
        );
      }
    }
  }

  emit?.("chunking", 62, "Segmenting genuine transcript across full timeline...");
  const rawChunks = chunkTranscriptForTimeline(segments, 24);

  let chunks = rawChunks;
  if (rawChunks.length > 0 && Date.now() - startedAt < 40_000) {
    emit?.("embeddings", 72, `Indexing ${rawChunks.length} chunk(s) with vector embeddings...`);
    chunks = await embedTranscriptChunks(rawChunks, (done, total) => {
      const pct = 72 + Math.round((done / Math.max(1, total)) * 12);
      emit?.("embeddings", pct, `Embedded ${done}/${total} transcript chunks...`);
    });
  }

  const wordCount = segments
    .map((s) => s.text)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;

  emit?.("summarizing", 88, "Synthesizing grounded knowledge & chapters...");
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
    kind: "result",
    payload: {
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
    },
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
        allowClientSlicing: String(formData.get("allowClientSlicing") || "false") === "true",
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
            const outcome = await runVideoPipeline(parsed, uploadedMedia, (stage, pct, detail) => {
              send({ type: "progress", stage, pct, detail });
            });
            if (outcome.kind === "needs_sliced_transcription") {
              send({ type: "needs_sliced_transcription", meta: outcome.meta });
            } else {
              send({ type: "result", payload: outcome.payload });
            }
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

    const outcome = await runVideoPipeline(parsed, uploadedMedia);
    if (outcome.kind === "needs_sliced_transcription") {
      return NextResponse.json(outcome.meta);
    }
    return NextResponse.json(outcome.payload);
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
