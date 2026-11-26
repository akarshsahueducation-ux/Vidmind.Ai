"use client";

import type {
  KnowledgeLevel,
  ProcessedVideoPayload,
  SummaryFocus,
  SummaryMode,
  TranscriptSegment,
  VideoChapter,
} from "@/types/vidmind";

export interface ClientPipelineProgress {
  stage: "metadata" | "transcript" | "chunking" | "embeddings" | "summarizing";
  pct: number;
  detail: string;
}

export interface SlicedMetaHandoff {
  videoId: string;
  url: string;
  title: string;
  channelName: string;
  description: string;
  durationSeconds: number;
  thumbnailUrl: string;
  language: string;
  chapters: VideoChapter[];
}

function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function buildListeningWindows(totalSeconds: number): Array<{ start: number; end: number }> {
  const dur = Math.max(60, Math.round(totalSeconds));
  const windowSize =
    dur <= 3600
      ? 900 // 15m slices (<=1h -> max 4)
      : dur <= 14400
      ? 1200 // 20m slices (1h-4h -> max 12)
      : dur <= 54000
      ? 1800 // 30m slices (4h-15h -> max 30)
      : Math.max(2700, Math.ceil(dur / 48)); // 45m+ evenly spaced up to 48 slices for 50h+

  const windows: Array<{ start: number; end: number }> = [];
  for (let start = 0; start < dur; start += windowSize) {
    const end = Math.min(dur, start + windowSize);
    if (end - start < 45 && windows.length > 0) {
      windows[windows.length - 1].end = end;
    } else {
      windows.push({ start, end });
    }
  }
  return windows;
}

async function fetchSliceSingle(
  url: string,
  startSeconds: number,
  endSeconds: number,
  language: string,
  existingTitle: string
): Promise<{
  ok: boolean;
  segments: TranscriptSegment[];
  chapters: VideoChapter[];
  inferredTitle?: string;
  speakerOrChannel?: string;
}> {
  try {
    const res = await fetch("/api/videos/transcribe-slice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, startSeconds, endSeconds, language, existingTitle }),
    });
    if (!res.ok) {
      return { ok: false, segments: [], chapters: [] };
    }
    const json = (await res.json()) as {
      sliceComplete?: boolean;
      segments?: TranscriptSegment[];
      chapters?: VideoChapter[];
      inferredTitle?: string;
      speakerOrChannel?: string;
    };
    return {
      ok: true,
      segments: Array.isArray(json.segments) ? json.segments : [],
      chapters: json.chapters || [],
      inferredTitle: json.inferredTitle,
      speakerOrChannel: json.speakerOrChannel,
    };
  } catch {
    return { ok: false, segments: [], chapters: [] };
  }
}

async function fetchSliceWithRetry(
  url: string,
  startSeconds: number,
  endSeconds: number,
  language: string,
  existingTitle: string
): Promise<{
  segments: TranscriptSegment[];
  chapters: VideoChapter[];
  inferredTitle?: string;
  speakerOrChannel?: string;
} | null> {
  const first = await fetchSliceSingle(url, startSeconds, endSeconds, language, existingTitle);
  if (first.ok && first.segments.length > 0) return first;

  // On failure or empty response, bisect larger windows into two halves for high reliability
  const span = endSeconds - startSeconds;
  if (span > 600) {
    const mid = Math.floor((startSeconds + endSeconds) / 2);
    const [left, right] = await Promise.all([
      fetchSliceSingle(url, startSeconds, mid, language, existingTitle),
      fetchSliceSingle(url, mid, endSeconds, language, existingTitle),
    ]);
    const combinedSegs = [...left.segments, ...right.segments];
    if (combinedSegs.length > 0) {
      return {
        segments: combinedSegs,
        chapters: [...left.chapters, ...right.chapters],
        inferredTitle: left.inferredTitle || right.inferredTitle,
        speakerOrChannel: left.speakerOrChannel || right.speakerOrChannel,
      };
    }
    return null;
  }

  await new Promise((r) => setTimeout(r, 1000));
  const retry = await fetchSliceSingle(url, startSeconds, endSeconds, language, existingTitle);
  return retry.segments.length > 0 ? retry : null;
}

export async function processVideoWithClientPipeline(params: {
  url?: string;
  file?: File | null;
  manualTranscript?: string;
  manualTitle?: string;
  mode: SummaryMode;
  focus: SummaryFocus;
  level: KnowledgeLevel;
  language: string;
  onProgress?: (p: ClientPipelineProgress) => void;
}): Promise<ProcessedVideoPayload> {
  const {
    url = "",
    file = null,
    manualTranscript = "",
    manualTitle = "",
    mode,
    focus,
    level,
    language,
    onProgress,
  } = params;

  let res: Response;
  if (file) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("manualTitle", manualTitle.trim());
    fd.append("mode", mode);
    fd.append("focus", focus);
    fd.append("level", level);
    fd.append("language", language);
    fd.append("stream", "true");
    res = await fetch("/api/videos/process", { method: "POST", body: fd });
  } else {
    res = await fetch("/api/videos/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: url.trim(),
        manualTranscript,
        manualTitle,
        mode,
        focus,
        level,
        language,
        stream: true,
        allowClientSlicing: true,
      }),
    });
  }

  if (!res.ok || !res.body) {
    const errData = await res.json().catch(() => ({}));
    throw new Error((errData as { error?: string }).error || "Failed to process video.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let processed: ProcessedVideoPayload | null = null;
  let slicedMeta: SlicedMetaHandoff | null = null;

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    const msg = JSON.parse(line) as {
      type: "progress" | "result" | "error" | "needs_sliced_transcription";
      stage?: ClientPipelineProgress["stage"];
      pct?: number;
      detail?: string;
      payload?: ProcessedVideoPayload;
      meta?: SlicedMetaHandoff;
      error?: string;
    };
    if (msg.type === "progress" && msg.stage) {
      onProgress?.({
        stage: msg.stage,
        pct: msg.pct || 25,
        detail: msg.detail || "Processing...",
      });
    } else if (msg.type === "error") {
      throw new Error(msg.error || "Processing error.");
    } else if (msg.type === "needs_sliced_transcription" && msg.meta) {
      slicedMeta = msg.meta;
    } else if (msg.type === "result" && msg.payload) {
      processed = msg.payload;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) handleLine(line);
  }
  if (buffer.trim()) handleLine(buffer);

  if (processed) return processed;

  if (!slicedMeta) {
    throw new Error("Processing timed out or stream ended early. Please retry.");
  }

  // Client-orchestrated parallel audio listening across the FULL multi-hour video (supports 1h-50h!)
  const meta: SlicedMetaHandoff = slicedMeta;
  const windows = buildListeningWindows(meta.durationSeconds);
  const concurrency = 5;
  const allSegments: TranscriptSegment[] = [];
  const allChapters: VideoChapter[] = [...meta.chapters];
  let completedSlices = 0;

  for (let i = 0; i < windows.length; i += concurrency) {
    const wave = windows.slice(i, i + concurrency);
    const waveStart = fmtClock(wave[0].start);
    const waveEnd = fmtClock(wave[wave.length - 1].end);
    onProgress?.({
      stage: "transcript",
      pct: Math.min(72, 30 + Math.round((completedSlices / windows.length) * 42)),
      detail: `AI listening [${waveStart}–${waveEnd}] • ${completedSlices}/${windows.length} sections • ${allSegments.length} genuine captions`,
    });

    const waveResults = await Promise.all(
      wave.map((w) =>
        fetchSliceWithRetry(meta.url, w.start, w.end, language, meta.title)
      )
    );

    for (const r of waveResults) {
      completedSlices++;
      if (r) {
        allSegments.push(...r.segments);
        allChapters.push(...r.chapters);
        if (meta.title.startsWith("YouTube Video (") && r.inferredTitle) {
          meta.title = r.inferredTitle;
        }
        if (meta.channelName === "YouTube Channel" && r.speakerOrChannel) {
          meta.channelName = r.speakerOrChannel;
        }
      }
    }
  }

  if (!allSegments.length) {
    throw new Error(
      "Could not extract spoken audio from this video (it may be private, age-restricted, or temporarily rate-limited). Try uploading an audio extract or using Paste Transcript Instead."
    );
  }

  onProgress?.({
    stage: "chunking",
    pct: 78,
    detail: `Embedding & indexing ${allSegments.length} genuine timestamped segments (${fmtClock(
      meta.durationSeconds
    )})...`,
  });

  onProgress?.({
    stage: "summarizing",
    pct: 88,
    detail: `Synthesizing full-timeline knowledge across all ${fmtClock(meta.durationSeconds)}...`,
  });

  const finalizeRes = await fetch("/api/videos/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      video: {
        videoId: meta.videoId,
        url: meta.url,
        title: meta.title,
        channelName: meta.channelName,
        description: meta.description,
        durationSeconds: meta.durationSeconds,
        thumbnailUrl: meta.thumbnailUrl,
        language: meta.language,
        isAutoCaptions: true,
        sourceType: "audio_transcription",
      },
      segments: allSegments,
      chapters: allChapters,
      mode,
      focus,
      level,
      language,
      warning: `AI listened across all ${windows.length} sections (${fmtClock(
        meta.durationSeconds
      )}) and generated ${allSegments.length} genuine timestamped captions.`,
    }),
  });

  const finalJson = (await finalizeRes.json()) as ProcessedVideoPayload & { error?: string };
  if (!finalizeRes.ok) {
    throw new Error(finalJson.error || "Failed to finalize video summary.");
  }

  return finalJson;
}
