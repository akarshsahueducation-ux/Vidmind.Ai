import type { ChatCitation, TranscriptChunk, TranscriptSegment } from "@/types/vidmind";
import { cosineSimilarity, generateEmbedding } from "@/lib/rag/embeddings";
import { formatTimestamp } from "@/lib/youtube/extractor";

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from",
  "had", "has", "have", "he", "her", "his", "how", "i", "in", "is", "it",
  "its", "of", "on", "or", "that", "the", "their", "them", "they", "this",
  "to", "was", "we", "were", "what", "when", "where", "which", "who", "why",
  "will", "with", "you", "your",
]);

export function tokenizeText(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9']+/g) || []).filter(
    (w) => w.length > 2 && !STOPWORDS.has(w)
  );
}

/**
 * Retrieve the most relevant transcript segments/chunks for a user query.
 * Supports direct [MM:SS] timestamp lookup + Hybrid Vector Cosine + Lexical scoring.
 */
export function retrieveRelevantTranscript(
  query: string,
  segments: TranscriptSegment[],
  chunks: TranscriptChunk[],
  topK = 5,
  queryEmbedding: number[] | null = null
): ChatCitation[] {
  // 1. Direct timestamp queries (e.g., "what happened at 25:30?" or "1:05:10")
  const tsMatch = query.match(/\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b/);
  if (tsMatch && segments.length > 0) {
    const hrs = Number(tsMatch[1] || 0);
    const mins = Number(tsMatch[2]);
    const secs = Number(tsMatch[3]);
    const targetSeconds = hrs * 3600 + mins * 60 + secs;

    const nearby = segments.filter(
      (s) => s.start >= targetSeconds - 20 && s.start <= targetSeconds + 70
    );
    if (nearby.length > 0) {
      return [
        {
          timestamp: formatTimestamp(nearby[0].start),
          startSeconds: nearby[0].start,
          excerpt: nearby.map((s) => s.text).join(" ").slice(0, 750),
          score: 1.0,
        },
      ];
    }
  }

  const candidates =
    chunks.length > 0
      ? chunks.map((c) => ({
          startSeconds: c.startSeconds,
          timestamp: c.startTimestamp,
          text: c.content,
          embedding: c.embedding,
        }))
      : segments.map((s) => ({
          startSeconds: s.start,
          timestamp: s.timestamp,
          text: s.text,
          embedding: undefined,
        }));

  if (!candidates.length) return [];

  const isBroadQuery =
    /\b(entire|whole|overall|main|key|lessons|summary|summarize|takeaways|arguments|steps|warnings|pitfalls|thesis|explain)\b/i.test(
      query
    );

  const qTokens = new Set(tokenizeText(query));
  const scored: ChatCitation[] = [];

  for (const cand of candidates) {
    let lexicalScore = 0;
    if (qTokens.size > 0) {
      const cTokens = tokenizeText(cand.text);
      const cSet = new Set(cTokens);
      let overlap = 0;
      let prefixHits = 0;
      for (const qt of qTokens) {
        if (cSet.has(qt)) overlap += 1;
        else if (qt.length >= 4 && cTokens.some((ct) => ct.startsWith(qt.slice(0, 4)))) {
          prefixHits += 0.4;
        }
      }
      if (overlap + prefixHits > 0) {
        lexicalScore = Math.min(1, (overlap + prefixHits) / Math.sqrt(Math.max(1, cSet.size)));
      }
    }

    const semanticScore =
      queryEmbedding && cand.embedding?.length
        ? Math.max(0, cosineSimilarity(queryEmbedding, cand.embedding))
        : 0;

    const hybridScore =
      semanticScore > 0
        ? 0.72 * semanticScore + 0.28 * lexicalScore
        : lexicalScore;

    if (hybridScore > 0.05) {
      scored.push({
        timestamp: cand.timestamp,
        startSeconds: cand.startSeconds,
        excerpt: cand.text.slice(0, 650),
        score: Number(hybridScore.toFixed(4)),
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  if (scored.length >= 2 || (scored.length === 1 && !isBroadQuery)) {
    return scored.slice(0, topK);
  }

  if (isBroadQuery) {
    const step = Math.max(1, Math.floor(candidates.length / topK));
    const sampled: ChatCitation[] = [];
    for (let i = 0; i < candidates.length && sampled.length < topK; i += step) {
      const c = candidates[i];
      sampled.push({
        timestamp: c.timestamp,
        startSeconds: c.startSeconds,
        excerpt: c.text.slice(0, 600),
        score: 0.5,
      });
    }
    return sampled;
  }

  return scored.slice(0, topK);
}

export async function retrieveHybridTranscript(
  query: string,
  segments: TranscriptSegment[],
  chunks: TranscriptChunk[],
  topK = 5
): Promise<ChatCitation[]> {
  const hasEmbeddings = chunks.some((c) => Array.isArray(c.embedding) && c.embedding.length > 0);
  const queryVec = hasEmbeddings ? await generateEmbedding(query) : null;
  return retrieveRelevantTranscript(query, segments, chunks, topK, queryVec);
}
