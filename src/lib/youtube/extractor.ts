import type { TranscriptChunk, TranscriptSegment, VideoChapter } from "@/types/vidmind";

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export class VideoExtractionError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function extractYouTubeVideoId(rawUrl: string): string {
  const trimmed = (rawUrl || "").trim();
  if (!trimmed) {
    throw new VideoExtractionError("Please enter a YouTube URL or 11-character video ID.", 400);
  }
  if (VIDEO_ID_RE.test(trimmed)) return trimmed;

  const normalized = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new VideoExtractionError("Invalid URL syntax. Paste a valid YouTube link.", 400);
  }

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const validHosts = new Set([
    "youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtube-nocookie.com",
    "youtu.be",
  ]);
  if (!validHosts.has(host)) {
    throw new VideoExtractionError(
      "URL must belong to youtube.com or youtu.be (watch, Shorts, Live, or embed links).",
      400
    );
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  if (host === "youtu.be") {
    if (parts[0] && VIDEO_ID_RE.test(parts[0])) return parts[0];
    throw new VideoExtractionError("Could not extract video ID from youtu.be URL.", 400);
  }

  const vParam = parsed.searchParams.get("v")?.trim();
  if (vParam && VIDEO_ID_RE.test(vParam)) return vParam;

  if (parts.length >= 2 && ["shorts", "live", "embed", "v"].includes(parts[0])) {
    if (VIDEO_ID_RE.test(parts[1])) return parts[1];
  }

  throw new VideoExtractionError("Could not locate an 11-character YouTube video ID.", 400);
}

export function extractPlaylistId(rawUrl: string): string | null {
  try {
    const normalized = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(rawUrl.trim())
      ? rawUrl.trim()
      : `https://${rawUrl.trim()}`;
    const parsed = new URL(normalized);
    const listId = parsed.searchParams.get("list")?.trim();
    if (listId && /^[A-Za-z0-9_-]{10,}$/.test(listId) && parsed.pathname.includes("playlist")) {
      return listId;
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchPlaylistVideoIds(playlistId: string, limit = 8): Promise<string[]> {
  try {
    const res = await fetch(`https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: "CONSENT=YES+cb.20210328-17-p0.en+FX+667",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const matches = html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g);
    const seen = new Set<string>();
    for (const m of matches) {
      seen.add(m[1]);
      if (seen.size >= limit) break;
    }
    return Array.from(seen);
  } catch {
    return [];
  }
}

/**
 * Parse .srt or .vtt subtitle files into timestamped TranscriptSegments.
 */
export function parseSrtOrVtt(content: string): TranscriptSegment[] {
  const lines = (content || "").replace(/\r\n/g, "\n").split("\n");
  const segments: TranscriptSegment[] = [];
  const tsRe =
    /^(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})/;

  const toSeconds = (h: string | undefined, m: string, s: string, ms: string) =>
    Number(h || 0) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;

  let i = 0;
  while (i < lines.length) {
    const match = tsRe.exec(lines[i].trim());
    if (match) {
      const start = toSeconds(match[1], match[2], match[3], match[4]);
      const end = toSeconds(match[5], match[6], match[7], match[8]);
      i++;
      const textLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== "") {
        textLines.push(lines[i].replace(/<[^>]+>/g, "").trim());
        i++;
      }
      const text = textLines.join(" ").replace(/\s+/g, " ").trim();
      if (text) {
        segments.push({
          start,
          duration: Math.max(1, end - start),
          text,
          timestamp: formatTimestamp(start),
        });
      }
    }
    i++;
  }
  return segments;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function cleanCaptionText(raw: string): string {
  return decodeHtmlEntities(raw)
    .replace(/<[^>]+>/g, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCaptionPayload(payload: string): TranscriptSegment[] {
  const trimmed = (payload || "").trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as {
        events?: Array<{
          tStartMs?: number;
          dDurationMs?: number;
          segs?: Array<{ utf8?: string }>;
        }>;
      };
      const segments: TranscriptSegment[] = [];
      for (const ev of parsed.events || []) {
        const text = cleanCaptionText((ev.segs || []).map((s) => s.utf8 || "").join(""));
        if (!text) continue;
        const start = (ev.tStartMs || 0) / 1000;
        const duration = (ev.dDurationMs || 0) / 1000;
        segments.push({
          start,
          duration,
          text,
          timestamp: formatTimestamp(start),
        });
      }
      return segments;
    } catch {
      return [];
    }
  }

  // XML caption formats (<text start=".." dur=".."> or <p t=".." d="..">)
  const segments: TranscriptSegment[] = [];
  const textTagRe = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
  let match: RegExpExecArray | null;
  while ((match = textTagRe.exec(trimmed)) !== null) {
    const attrs = match[1];
    const body = cleanCaptionText(match[2]);
    if (!body) continue;
    const startMatch = /start="([\d.]+)"/i.exec(attrs);
    const durMatch = /dur="([\d.]+)"/i.exec(attrs);
    const start = startMatch ? Number(startMatch[1]) : 0;
    const duration = durMatch ? Number(durMatch[1]) : 0;
    segments.push({ start, duration, text: body, timestamp: formatTimestamp(start) });
  }
  if (segments.length > 0) return segments;

  const pTagRe = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  while ((match = pTagRe.exec(trimmed)) !== null) {
    const attrs = match[1];
    const body = cleanCaptionText(match[2]);
    if (!body) continue;
    const tMatch = /\bt="([\d.]+)"/i.exec(attrs);
    const dMatch = /\bd="([\d.]+)"/i.exec(attrs);
    const start = tMatch ? Number(tMatch[1]) / 1000 : 0;
    const duration = dMatch ? Number(dMatch[1]) / 1000 : 0;
    segments.push({ start, duration, text: body, timestamp: formatTimestamp(start) });
  }
  return segments;
}

export function parseDescriptionChapters(description: string): VideoChapter[] {
  const chapters: VideoChapter[] = [];
  const lineRe = /^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s*[-–—:|]?\s*(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(description || "")) !== null) {
    const hrs = Number(m[1] || 0);
    const mins = Number(m[2]);
    const secs = Number(m[3]);
    const title = m[4].trim();
    if (!title || title.length > 140) continue;
    const startSeconds = hrs * 3600 + mins * 60 + secs;
    chapters.push({
      startSeconds,
      timestamp: formatTimestamp(startSeconds),
      title,
      summary: "",
    });
  }
  return chapters;
}

function extractBalancedJson(source: string, marker: string): Record<string, unknown> | null {
  const idx = source.indexOf(marker);
  if (idx === -1) return null;
  const start = source.indexOf("{", idx);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else {
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(source.slice(start, i + 1)) as Record<string, unknown>;
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

interface CaptionTrack {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
  isTranslatable?: boolean;
}

function selectCaptionTrack(tracks: CaptionTrack[], preferredLang: string): {
  track: CaptionTrack | null;
  translateTo?: string;
} {
  if (!tracks.length) return { track: null };
  const pref = (preferredLang || "en").toLowerCase().split("-")[0];

  const manualExact = tracks.find(
    (t) => (t.languageCode || "").toLowerCase() === preferredLang.toLowerCase() && t.kind !== "asr"
  );
  if (manualExact) return { track: manualExact };

  const manualBase = tracks.find(
    (t) => (t.languageCode || "").toLowerCase().split("-")[0] === pref && t.kind !== "asr"
  );
  if (manualBase) return { track: manualBase };

  const asrBase = tracks.find(
    (t) => (t.languageCode || "").toLowerCase().split("-")[0] === pref
  );
  if (asrBase) return { track: asrBase };

  const enTrack = tracks.find(
    (t) => (t.languageCode || "").toLowerCase().split("-")[0] === "en"
  );
  if (enTrack) return { track: enTrack, translateTo: pref !== "en" ? pref : undefined };

  return {
    track: tracks[0],
    translateTo: (tracks[0].languageCode || "").split("-")[0] !== pref ? pref : undefined,
  };
}

export function chunkTranscript(
  segments: TranscriptSegment[],
  maxWordsPerChunk = 650
): TranscriptChunk[] {
  if (!segments.length) return [];

  const chunks: TranscriptChunk[] = [];
  let buffer: TranscriptSegment[] = [];
  let words = 0;

  for (const seg of segments) {
    const segWords = seg.text.split(/\s+/).filter(Boolean).length;
    if (buffer.length > 0 && words + segWords > maxWordsPerChunk) {
      const startSeconds = buffer[0].start;
      const last = buffer[buffer.length - 1];
      const endSeconds = last.start + last.duration;
      chunks.push({
        index: chunks.length,
        startSeconds,
        endSeconds,
        startTimestamp: formatTimestamp(startSeconds),
        endTimestamp: formatTimestamp(endSeconds),
        content: buffer.map((b) => b.text).join(" "),
      });
      buffer = [];
      words = 0;
    }
    buffer.push(seg);
    words += segWords;
  }

  if (buffer.length > 0) {
    const startSeconds = buffer[0].start;
    const last = buffer[buffer.length - 1];
    const endSeconds = last.start + last.duration;
    chunks.push({
      index: chunks.length,
      startSeconds,
      endSeconds,
      startTimestamp: formatTimestamp(startSeconds),
      endTimestamp: formatTimestamp(endSeconds),
      content: buffer.map((b) => b.text).join(" "),
    });
  }

  return chunks;
}

export async function fetchYouTubeVideoAndTranscript(
  videoId: string,
  preferredLang = "en"
): Promise<{
  title: string;
  channelName: string;
  description: string;
  durationSeconds: number;
  thumbnailUrl: string;
  language: string;
  isAutoCaptions: boolean;
  chapters: VideoChapter[];
  segments: TranscriptSegment[];
}> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=en`;
  let [playerResponse, oembed] = await Promise.all([
    (async (): Promise<Record<string, unknown> | null> => {
      try {
        const res = await fetch(watchUrl, {
          headers: {
            "User-Agent": USER_AGENT,
            "Accept-Language": "en-US,en;q=0.9",
            Cookie: "CONSENT=YES+cb.20210328-17-p0.en+FX+667",
          },
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const html = await res.text();
          return extractBalancedJson(html, "ytInitialPlayerResponse");
        }
      } catch {
        // Fallback to Innertube/oEmbed
      }
      return null;
    })(),
    (async (): Promise<{ title?: string; author_name?: string }> => {
      try {
        const oeRes = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
          { signal: AbortSignal.timeout(6000) }
        );
        if (oeRes.ok) return (await oeRes.json()) as { title?: string; author_name?: string };
      } catch {
        // Ignore oEmbed failure
      }
      return {};
    })(),
  ]);

  const getTracks = (pr: Record<string, unknown> | null): CaptionTrack[] => {
    const captions = pr?.captions as Record<string, unknown> | undefined;
    const renderer = captions?.playerCaptionsTracklistRenderer as
      | Record<string, unknown>
      | undefined;
    return (renderer?.captionTracks as CaptionTrack[] | undefined) || [];
  };

  let tracks = getTracks(playerResponse);

  if (!tracks.length && !playerResponse?.videoDetails) {
    try {
      const innerRes = await fetch(
        "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent":
              "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip",
          },
          body: JSON.stringify({
            context: {
              client: {
                clientName: "ANDROID",
                clientVersion: "19.09.37",
                androidSdkVersion: 30,
                hl: "en",
                gl: "US",
              },
            },
            videoId,
          }),
          signal: AbortSignal.timeout(8000),
        }
      );
      if (innerRes.ok) {
        const innerJson = (await innerRes.json()) as Record<string, unknown>;
        if (!playerResponse) playerResponse = innerJson;
        const innerTracks = getTracks(innerJson);
        if (innerTracks.length) tracks = innerTracks;
      }
    } catch {
      // Handled gracefully below
    }
  }

  const details = (playerResponse?.videoDetails as Record<string, unknown> | undefined) || {};
  const title = String(details.title || oembed.title || `YouTube Video (${videoId})`);
  const channelName = String(details.author || oembed.author_name || "YouTube Channel");
  const description = String(details.shortDescription || "");
  const durationSeconds = Number(details.lengthSeconds || 0);
  const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  if (!playerResponse && !oembed.title) {
    throw new VideoExtractionError(
      "Could not reach YouTube or retrieve video metadata. Verify network connectivity or paste transcript text directly.",
      502
    );
  }

  let segments: TranscriptSegment[] = [];
  let language = preferredLang;
  let isAutoCaptions = false;

  if (tracks.length > 0) {
    const { track, translateTo } = selectCaptionTrack(tracks, preferredLang);
    if (track?.baseUrl) {
      language = track.languageCode || preferredLang;
      isAutoCaptions = track.kind === "asr";
      let captionUrl = track.baseUrl;
      if (translateTo && track.isTranslatable) {
        captionUrl += `${captionUrl.includes("?") ? "&" : "?"}tlang=${encodeURIComponent(translateTo)}`;
      }
      for (const suffix of ["&fmt=json3", ""]) {
        try {
          const capRes = await fetch(captionUrl + suffix, {
            headers: { "User-Agent": USER_AGENT },
            signal: AbortSignal.timeout(15000),
          });
          if (capRes.ok) {
            const raw = await capRes.text();
            const parsed = parseCaptionPayload(raw);
            if (parsed.length > 0) {
              segments = parsed;
              break;
            }
          }
        } catch {
          continue;
        }
      }
    }
  }

  const computedDuration =
    durationSeconds ||
    (segments.length
      ? Math.round(segments[segments.length - 1].start + segments[segments.length - 1].duration)
      : 0);

  return {
    title,
    channelName,
    description,
    durationSeconds: computedDuration,
    thumbnailUrl,
    language,
    isAutoCaptions,
    chapters: parseDescriptionChapters(description),
    segments,
  };
}
