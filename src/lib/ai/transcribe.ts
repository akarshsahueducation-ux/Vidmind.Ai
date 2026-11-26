import { getServerConfig } from "@/lib/config";
import { extractJsonFromLLM } from "@/lib/ai/provider";
import { formatTimestamp } from "@/lib/youtube/extractor";
import type { TranscriptSegment, VideoChapter } from "@/types/vidmind";

export interface TranscribeMediaInput {
  youtubeUrl?: string;
  fileBytes?: Uint8Array;
  mimeType?: string;
  fileName?: string;
  existingTitle?: string;
  language?: string;
}

export interface TranscribeMediaOutput {
  inferredTitle: string;
  inferredDescription: string;
  speakerOrChannel: string;
  detectedLanguage: string;
  durationEstimateSeconds: number;
  chapters: VideoChapter[];
  segments: TranscriptSegment[];
  engine: string;
}

export interface TranscribeSliceInput {
  youtubeUrl: string;
  startSeconds: number;
  endSeconds: number;
  language?: string;
  existingTitle?: string;
}

interface RawGeminiTranscribeResponse {
  inferredTitle?: string;
  inferredDescription?: string;
  speakerOrChannel?: string;
  detectedLanguage?: string;
  durationEstimateSeconds?: number;
  chapters?: Array<{ startSeconds?: number; title?: string }>;
  segments?: Array<{ startSeconds?: number; text?: string }>;
}

const GEMINI_INLINE_LIMIT_BYTES = 7 * 1024 * 1024; // 7 MB safe inline limit

const MEDIA_MIME_MAP: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
};

export function inferMediaMimeType(fileName: string, providedType?: string): string {
  if (providedType && (providedType.startsWith("video/") || providedType.startsWith("audio/"))) {
    return providedType;
  }
  const lower = (fileName || "").toLowerCase();
  for (const [ext, mime] of Object.entries(MEDIA_MIME_MAP)) {
    if (lower.endsWith(ext)) return mime;
  }
  return "video/mp4";
}

export function isBinaryMediaFile(fileName: string, providedType?: string): boolean {
  if (providedType && (providedType.startsWith("video/") || providedType.startsWith("audio/"))) {
    return true;
  }
  const lower = (fileName || "").toLowerCase();
  return Object.keys(MEDIA_MIME_MAP).some((ext) => lower.endsWith(ext));
}

async function uploadToGeminiFilesApi(
  bytes: Uint8Array,
  mimeType: string,
  displayName: string,
  geminiKey: string
): Promise<{ uri: string; name: string }> {
  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(
      geminiKey
    )}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: displayName || "uploaded-media" } }),
      signal: AbortSignal.timeout(30000),
    }
  );

  if (!startRes.ok) {
    throw new Error(`Gemini file upload init failed (${startRes.status})`);
  }

  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new Error("Missing Gemini resumable upload URL");
  }

  const bodyBytes = new Uint8Array(bytes.byteLength);
  bodyBytes.set(bytes);
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(bodyBytes.byteLength),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: bodyBytes.buffer,
    signal: AbortSignal.timeout(120000),
  });

  if (!uploadRes.ok) {
    throw new Error(`Gemini file upload failed (${uploadRes.status})`);
  }

  const uploadJson = (await uploadRes.json()) as {
    file?: { uri?: string; name?: string; state?: string };
  };
  const fileUri = uploadJson.file?.uri;
  const fileName = uploadJson.file?.name;
  if (!fileUri || !fileName) {
    throw new Error("Gemini upload returned incomplete file metadata");
  }

  let state = uploadJson.file?.state || "ACTIVE";
  let attempts = 0;
  while (state === "PROCESSING" && attempts < 20) {
    await new Promise((r) => setTimeout(r, 1500));
    const statusRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${encodeURIComponent(
        geminiKey
      )}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (statusRes.ok) {
      const statusJson = (await statusRes.json()) as { state?: string };
      state = statusJson.state || "ACTIVE";
    }
    attempts++;
  }

  if (state === "FAILED") {
    throw new Error("Media file could not be decoded for transcription.");
  }

  return { uri: fileUri, name: fileName };
}

async function deleteGeminiFile(fileName: string, geminiKey: string): Promise<void> {
  try {
    await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${encodeURIComponent(
        geminiKey
      )}`,
      { method: "DELETE", signal: AbortSignal.timeout(8000) }
    );
  } catch {
    // Best-effort cleanup
  }
}

async function probeOffsetExists(
  youtubeUrl: string,
  offsetSec: number,
  geminiKey: string,
  modelName: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        modelName
      )}:generateContent?key=${encodeURIComponent(geminiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  fileData: { fileUri: youtubeUrl },
                  videoMetadata: {
                    startOffset: `${offsetSec}s`,
                    endOffset: `${offsetSec + 5}s`,
                    fps: 0.1,
                  },
                },
                { text: "Reply OK." },
              ],
            },
          ],
          generationConfig: { maxOutputTokens: 4 },
        }),
        signal: AbortSignal.timeout(9000),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Determine true YouTube video duration (from 1m up to 50h+) via fast parallel binary probes
 * when YouTube blocks watch-page metadata from cloud IPs. Runs in ~2.5s total.
 */
export async function probeYouTubeDurationWithGemini(youtubeUrl: string): Promise<number> {
  const cfg = getServerConfig();
  if (!cfg.geminiKey) return 0;

  const model = cfg.geminiModel || "gemini-3.5-flash-lite";
  const landmarks = [600, 1800, 3600, 7200, 14400, 28800, 54000, 108000, 180000];
  const wave1 = await Promise.all(
    landmarks.map(async (t) => ({ t, ok: await probeOffsetExists(youtubeUrl, t, cfg.geminiKey, model) }))
  );

  const okList = wave1.filter((w) => w.ok).map((w) => w.t);
  const failList = wave1.filter((w) => !w.ok).map((w) => w.t);

  if (!okList.length) {
    // Under 10 minutes: probe 60s, 180s, 360s
    const shortWave = await Promise.all(
      [60, 180, 360].map(async (t) => ({
        t,
        ok: await probeOffsetExists(youtubeUrl, t, cfg.geminiKey, model),
      }))
    );
    const maxShort = Math.max(0, ...shortWave.filter((w) => w.ok).map((w) => w.t));
    return maxShort > 0 ? maxShort + 120 : 480;
  }

  let lo = Math.max(...okList);
  let hi = failList.find((f) => f > lo) ?? lo + 3600;

  // One parallel 3-point binary refinement wave (~1.5s)
  const q1 = Math.round(lo + (hi - lo) * 0.25);
  const q2 = Math.round(lo + (hi - lo) * 0.5);
  const q3 = Math.round(lo + (hi - lo) * 0.75);
  const wave2 = await Promise.all(
    [q1, q2, q3].map(async (t) => ({ t, ok: await probeOffsetExists(youtubeUrl, t, cfg.geminiKey, model) }))
  );

  for (const w of wave2) {
    if (w.ok && w.t > lo) lo = w.t;
    if (!w.ok && w.t < hi) hi = w.t;
  }

  return Math.round((lo + Math.min(hi, lo + 2400)) / 2);
}

/**
 * Genuine audio+visual slice transcription for ANY window of a YouTube video (supports 1h to 50h+).
 * Uses Gemini videoMetadata startOffset/endOffset and anti-RECITATION phrasing so Gemini
 * actively listens to that exact window without regenerating titles/timestamps.
 */
export async function transcribeVideoSliceWithGemini(
  input: TranscribeSliceInput
): Promise<TranscribeMediaOutput | null> {
  const cfg = getServerConfig();
  const geminiKey = cfg.geminiKey;
  if (!geminiKey) return null;

  const start = Math.max(0, Math.floor(input.startSeconds));
  const end = Math.max(start + 15, Math.floor(input.endSeconds));
  const spanMins = Math.max(1, Math.round((end - start) / 60));
  const targetSegCount = spanMins >= 25 ? "14 to 22" : spanMins >= 12 ? "10 to 16" : "8 to 14";

  const prompt = `Actively listen to the spoken audio and observe on-screen slides, diagrams, or code STRICTLY between startSeconds=${start} and endSeconds=${end} (${formatTimestamp(
    start
  )} to ${formatTimestamp(end)}) of this video.

Requirements:
1. Extract ${targetSegCount} genuine chronological spoken-content notes spaced evenly across [${start}, ${end}].
2. Every segment's startSeconds MUST be an integer strictly between ${start} and ${end} reflecting when that exact concept/explanation was spoken.
3. Capture real concepts, examples, Hindi/English spoken explanations, formulas, or code discussed in clear paraphrased wording (avoid copying huge verbatim blocks verbatim so recitation filters never trigger). Never invent timestamps outside [${start}, ${end}].
4. Identify real topic chapters that begin inside [${start}, ${end}].
5. Target language for explanations: "${input.language || "en"}". Title hint: ${JSON.stringify(
    input.existingTitle || ""
  )}.

Return STRICT JSON:
{
  "inferredTitle": string,
  "speakerOrChannel": string,
  "detectedLanguage": string,
  "chapters": [{"startSeconds": number, "title": string}],
  "segments": [{"startSeconds": number, "text": string}]
}`;

  const candidateModels = Array.from(
    new Set([cfg.geminiModel, "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"])
  );

  const deadline = Date.now() + 34000;
  let lastError = "";

  for (const modelName of candidateModels) {
    const remainingMs = deadline - Date.now();
    if (remainingMs < 4000) break;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      modelName
    )}:generateContent?key=${encodeURIComponent(geminiKey)}`;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: `You are a genuine multimodal video-listening note & caption engine. Report ONLY what is spoken or shown between ${start}s and ${end}s using exact integer timestamps inside [${start}, ${end}]. Return clean JSON.`,
              },
            ],
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  fileData: { fileUri: input.youtubeUrl },
                  videoMetadata: {
                    startOffset: `${start}s`,
                    endOffset: `${end}s`,
                    fps: 0.12,
                  },
                },
                { text: prompt },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json" },
        }),
        signal: AbortSignal.timeout(remainingMs),
      });

      if (!res.ok) {
        const errText = await res.text();
        lastError = `Gemini slice ${res.status} (${modelName}): ${errText.slice(0, 140)}`;
        if ([404, 429, 500, 503].includes(res.status)) continue;
        if (res.status === 400) return null; // Slice past actual video end
        throw new Error(lastError);
      }

      const json = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      };
      const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!rawText) continue;

      const parsed = extractJsonFromLLM<RawGeminiTranscribeResponse>(rawText);
      const rawSegments = Array.isArray(parsed.segments) ? parsed.segments : [];
      const cleanSegments = rawSegments
        .map((s) => {
          let sec = Math.round(Number(s.startSeconds ?? start));
          if (start > 60 && sec < start - 15 && sec <= end - start + 15) {
            sec = start + sec;
          }
          return {
            rawSec: sec,
            start: Math.max(start, Math.min(end, sec)),
            text: String(s.text || "").trim(),
          };
        })
        .filter((s) => s.text.length > 0 && s.rawSec <= end + 20 && s.rawSec >= start - 20)
        .map(({ start: segStart, text }) => ({ start: segStart, text }))
        .sort((a, b) => a.start - b.start);

      if (!cleanSegments.length) continue;

      const segments: TranscriptSegment[] = cleanSegments.map((seg, idx) => {
        const nextStart = cleanSegments[idx + 1]?.start;
        const duration = nextStart && nextStart > seg.start ? Math.min(120, nextStart - seg.start) : 30;
        return {
          start: seg.start,
          duration,
          text: seg.text,
          timestamp: formatTimestamp(seg.start),
        };
      });

      const chapters: VideoChapter[] = Array.isArray(parsed.chapters)
        ? parsed.chapters
            .filter((c) => c?.title)
            .map((c) => {
              let sec = Math.round(Number(c.startSeconds ?? start));
              if (start > 60 && sec < start - 15 && sec <= end - start + 15) {
                sec = start + sec;
              }
              const clamped = Math.max(start, Math.min(end, sec));
              return {
                startSeconds: clamped,
                timestamp: formatTimestamp(clamped),
                title: String(c.title).trim(),
                summary: "",
              };
            })
        : [];

      return {
        inferredTitle:
          String(parsed.inferredTitle || "").trim() || input.existingTitle || "Untitled Video",
        inferredDescription: "",
        speakerOrChannel: String(parsed.speakerOrChannel || "").trim() || "YouTube Creator",
        detectedLanguage: String(parsed.detectedLanguage || input.language || "en").trim(),
        durationEstimateSeconds: end,
        chapters,
        segments,
        engine: `Gemini Multimodal Slice (${modelName})`,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        break;
      }
      continue;
    }
  }

  if (lastError) {
    throw new Error(lastError);
  }
  return null;
}

export async function transcribeMediaWithGemini(
  input: TranscribeMediaInput
): Promise<TranscribeMediaOutput | null> {
  const cfg = getServerConfig();
  const geminiKey = cfg.geminiKey;
  if (!geminiKey) return null;

  let uploadedGeminiFile: { uri: string; name: string } | null = null;
  let mediaPart: Record<string, unknown>;

  try {
    if (input.youtubeUrl) {
      mediaPart = {
        fileData: { fileUri: input.youtubeUrl },
        videoMetadata: { fps: 0.15 },
      };
    } else if (input.fileBytes && input.fileBytes.byteLength > 0) {
      const mimeType = inferMediaMimeType(input.fileName || "media.mp4", input.mimeType);
      if (input.fileBytes.byteLength <= GEMINI_INLINE_LIMIT_BYTES) {
        const b64 = Buffer.from(input.fileBytes).toString("base64");
        mediaPart = { inlineData: { mimeType, data: b64 } };
      } else {
        uploadedGeminiFile = await uploadToGeminiFilesApi(
          input.fileBytes,
          mimeType,
          input.fileName || "uploaded-media",
          geminiKey
        );
        mediaPart = {
          fileData: {
            mimeType,
            fileUri: uploadedGeminiFile.uri,
          },
        };
      }
    } else {
      return null;
    }

    const prompt = `Actively listen to the spoken audio and observe any key on-screen slides/code/text throughout this entire media carefully.
Your task:
1. Capture the spoken content into 16-32 genuine chronological segments spanning from the start (0s) to the end with accurate startSeconds timestamps, in clear paraphrased wording preserving core arguments, formulas, and terms (never copy large copyrighted blocks verbatim so recitation filters never trigger).
2. Infer an accurate inferredTitle, a 2-sentence inferredDescription, speakerOrChannel, and major chapters with exact timestamps from what you hear and see.
3. Target language for output fields: "${input.language || "en"}". Hint title: ${JSON.stringify(
      input.existingTitle || input.fileName || ""
    )}

Return STRICT JSON matching:
{
  "inferredTitle": string,
  "inferredDescription": string,
  "speakerOrChannel": string,
  "detectedLanguage": string,
  "durationEstimateSeconds": number,
  "chapters": [{"startSeconds": number, "title": string}],
  "segments": [{"startSeconds": number, "text": string}]
}`;

    const candidateModels = Array.from(
      new Set([cfg.geminiModel, "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"])
    );

    const deadline = Date.now() + (input.youtubeUrl ? 28000 : 42000);
    let lastError = "";
    for (const modelName of candidateModels) {
      const remainingMs = deadline - Date.now();
      if (remainingMs < 3500) break;

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        modelName
      )}:generateContent?key=${encodeURIComponent(geminiKey)}`;

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text: "You are a fast, accurate multimodal audio/video transcription engine. Always return clean JSON with genuine spoken-audio segments and accurate timestamps.",
                },
              ],
            },
            contents: [{ role: "user", parts: [mediaPart, { text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
          signal: AbortSignal.timeout(remainingMs),
        });

        if (!res.ok) {
          const errText = await res.text();
          lastError = `Gemini transcription ${res.status} (${modelName}): ${errText.slice(0, 160)}`;
          if ([404, 429, 500, 503].includes(res.status)) continue;
          throw new Error(lastError);
        }

        const json = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (!rawText) continue;

        const parsed = extractJsonFromLLM<RawGeminiTranscribeResponse>(rawText);
        const rawSegments = Array.isArray(parsed.segments) ? parsed.segments : [];
        const cleanSegments = rawSegments
          .map((s) => ({
            start: Math.max(0, Number(s.startSeconds || 0)),
            text: String(s.text || "").trim(),
          }))
          .filter((s) => s.text.length > 0)
          .sort((a, b) => a.start - b.start);

        if (!cleanSegments.length) continue;

        const segments: TranscriptSegment[] = cleanSegments.map((seg, idx) => {
          const nextStart = cleanSegments[idx + 1]?.start;
          const duration = nextStart && nextStart > seg.start ? Math.min(60, nextStart - seg.start) : 15;
          return {
            start: seg.start,
            duration,
            text: seg.text,
            timestamp: formatTimestamp(seg.start),
          };
        });

        const chapters: VideoChapter[] = Array.isArray(parsed.chapters)
          ? parsed.chapters
              .filter((c) => c?.title)
              .map((c) => {
                const startSeconds = Math.max(0, Number(c.startSeconds || 0));
                return {
                  startSeconds,
                  timestamp: formatTimestamp(startSeconds),
                  title: String(c.title).trim(),
                  summary: "",
                };
              })
          : [];

        const lastSeg = segments[segments.length - 1];
        const durationEstimateSeconds = Math.max(
          Number(parsed.durationEstimateSeconds || 0),
          Math.round(lastSeg.start + lastSeg.duration)
        );

        return {
          inferredTitle:
            String(parsed.inferredTitle || "").trim() ||
            input.existingTitle ||
            "Untitled Video Workspace",
          inferredDescription: String(parsed.inferredDescription || "").trim(),
          speakerOrChannel:
            String(parsed.speakerOrChannel || "").trim() ||
            (input.youtubeUrl ? "YouTube Creator" : "Uploaded Media"),
          detectedLanguage: String(parsed.detectedLanguage || input.language || "en").trim(),
          durationEstimateSeconds,
          chapters,
          segments,
          engine: `Gemini Audio Transcription (${modelName})`,
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
          break;
        }
        continue;
      }
    }

    if (lastError) {
      throw new Error(lastError);
    }
    return null;
  } finally {
    if (uploadedGeminiFile) {
      await deleteGeminiFile(uploadedGeminiFile.name, geminiKey);
    }
  }
}
