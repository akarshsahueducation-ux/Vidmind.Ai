import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runLLMCompletion, extractJsonFromLLM, sanitizeUntrustedTranscript } from "@/lib/ai/provider";
import { tokenizeText } from "@/lib/rag/search";

const CompareSchema = z.object({
  videos: z
    .array(
      z.object({
        title: z.string(),
        durationFormatted: z.string(),
        topics: z.array(z.string()),
        tldr: z.string(),
      })
    )
    .min(2),
});

export async function POST(req: NextRequest) {
  try {
    const { videos } = CompareSchema.parse(await req.json());

    try {
      const llmRes = await runLLMCompletion({
        systemPrompt:
          "Compare these videos objectively based on topics, depth, and summaries. Distinguish measurable overlap from subjective assessments.",
        jsonMode: true,
        userPrompt: `Return JSON:
{
  "commonConcepts": ["..."],
  "uniqueByVideo": [{"title": "...", "uniquePoints": ["..."]}],
  "beginnerRecommendation": "...",
  "synthesisSummary": "..."
}

Videos:
${sanitizeUntrustedTranscript(JSON.stringify(videos, null, 2))}`,
      });
      if (llmRes) {
        return NextResponse.json({
          ...extractJsonFromLLM<Record<string, unknown>>(llmRes.text),
          engine: llmRes.engine,
        });
      }
    } catch {
      // Fallback below
    }

    const topicSets = videos.map((v) => new Set([...v.topics, ...tokenizeText(v.tldr)]));
    const commonConcepts = [...topicSets[0]].filter((t) =>
      topicSets.every((set) => set.has(t))
    );
    const uniqueByVideo = videos.map((v, idx) => ({
      title: v.title,
      uniquePoints: [...topicSets[idx]]
        .filter((t) => topicSets.every((s, j) => j === idx || !s.has(t)))
        .slice(0, 6),
    }));

    return NextResponse.json({
      commonConcepts: commonConcepts.slice(0, 8),
      uniqueByVideo,
      beginnerRecommendation: `Compare durations (${videos
        .map((v) => `${v.title}: ${v.durationFormatted}`)
        .join(" vs ")}) alongside topic density to pick your starting point.`,
      synthesisSummary: `Analyzed ${videos.length} videos across ${commonConcepts.length} shared concepts.`,
      engine: "Deterministic Research Comparator (No AI Key)",
    });
  } catch {
    return NextResponse.json(
      { error: "Select at least 2 processed videos to compare." },
      { status: 400 }
    );
  }
}
