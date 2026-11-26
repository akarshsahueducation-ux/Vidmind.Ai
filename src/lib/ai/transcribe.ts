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

  // Wait briefly for video processing if state is PROCESSING
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
      mediaPart = { fileData: { fileUri: input.youtubeUrl } };
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

    const prompt = `Listen to the spoken audio and observe any key on-screen slides/text in this media carefully.
Your task:
1. Transcribe/capture the spoken content into 15-32 chronological segments (roughly every 25-45 seconds for longer videos, or 10-15 seconds for short clips) with exact startSeconds timestamps, preserving key quotes, terms, and ideas.
2. Even if there is NO existing title, caption, or description, infer an accurate, clear inferredTitle, a 2-sentence inferredDescription, speakerOrChannel, and major chapters from what you hear and see.
3. Target language for output fields (keep spoken quotes faithful, or translate transcript only if requested language "${input.language || "en"}" differs cleanly): "${input.language || "en"}".
Existing hint title (may be blank or generic): ${JSON.stringify(input.existingTitle || input.fileName || "")}

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

    const deadline = Date.now() + (input.youtubeUrl ? 25000 : 40000);
    let lastError = "";
    for (const modelName of candidateModels) {
      const remainingMs = deadline - Date.now();
      if (remainingMs < 3000) break;

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
                  text: "You are a fast, accurate multimodal audio/video transcription engine. Always return clean JSON with accurate chronological timestamps starting near 0.",
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
          const duration = nextStart && nextStart > seg.start ? Math.min(45, nextStart - seg.start) : 12;
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
