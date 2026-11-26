import { getServerConfig } from "@/lib/config";
import type { TranscriptChunk } from "@/types/vidmind";

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const cfg = getServerConfig();
  const input = (text || "").trim().slice(0, 6000);
  if (!input) return null;

  if (cfg.geminiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${encodeURIComponent(
        cfg.geminiKey
      )}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text: input }] },
          outputDimensionality: 1536,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const json = (await res.json()) as { embedding?: { values?: number[] } };
        if (Array.isArray(json.embedding?.values) && json.embedding.values.length > 0) {
          return json.embedding.values;
        }
      }
    } catch {
      // Fallback to lexical RAG if embedding call fails
    }
  }

  if (cfg.openaiKey) {
    try {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.openaiKey}`,
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
        const vec = json.data?.[0]?.embedding;
        if (Array.isArray(vec) && vec.length > 0) return vec;
      }
    } catch {
      // Fallback to lexical RAG
    }
  }

  return null;
}

export async function embedTranscriptChunks(
  chunks: TranscriptChunk[],
  onProgress?: (done: number, total: number) => void
): Promise<TranscriptChunk[]> {
  // Cap direct inline embedding to 12 chunks in a single parallel batch for low-latency processing
  const maxToEmbed = Math.min(chunks.length, 12);
  if (maxToEmbed === 0) return chunks;
  const result = [...chunks];
  const slice = result.slice(0, maxToEmbed);
  const vectors = await Promise.all(slice.map((c) => generateEmbedding(c.content)));
  slice.forEach((chunk, offset) => {
    const vec = vectors[offset];
    if (vec) {
      result[offset] = { ...chunk, embedding: vec };
    }
  });
  if (onProgress) onProgress(maxToEmbed, maxToEmbed);
  return result;
}
