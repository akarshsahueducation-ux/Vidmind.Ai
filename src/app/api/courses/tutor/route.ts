import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  extractJsonFromLLM,
  runLLMCompletion,
  sanitizeUntrustedTranscript,
} from "@/lib/ai/provider";

export const maxDuration = 60;

const TutorSchema = z.object({
  mode: z.enum(["tutor", "diagnostic"]).default("tutor"),
  courseTitle: z.string().default("VidMind Course"),
  lessonTitle: z.string().default("Lesson"),
  lessonContext: z.string().default(""),
  knowledgeLevel: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
  question: z.string().optional().default(""),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = TutorSchema.parse(await req.json());
    const cleanContext = sanitizeUntrustedTranscript(parsed.lessonContext).slice(0, 12000);

    if (parsed.mode === "diagnostic") {
      try {
        const llmRes = await runLLMCompletion({
          systemPrompt:
            "You are the VidMind AI Diagnostic Assessor. Create a short 3-question diagnostic check grounded strictly in the course topics to gauge prior knowledge.",
          jsonMode: true,
          userPrompt: `Course: ${parsed.courseTitle}
Target Level: ${parsed.knowledgeLevel}
Context:
${cleanContext}

Return JSON:
{
  "questions": [
    {
      "id": "d1",
      "topic": "...",
      "question": "...",
      "options": ["Option A", "Option B", "Option C"],
      "correctAnswer": "Option A",
      "gapAdvice": "What to focus on if missed"
    }
  ]
}`,
        });
        if (llmRes) {
          return NextResponse.json({
            ...extractJsonFromLLM<Record<string, unknown>>(llmRes.text),
            engine: llmRes.engine,
          });
        }
      } catch {
        // Fall through to deterministic diagnostic
      }

      return NextResponse.json({
        engine: "Deterministic Diagnostic",
        questions: [
          {
            id: "d1",
            topic: "Foundations",
            question: `How familiar are you with the core concepts introduced in "${parsed.courseTitle}"?`,
            options: [
              "Brand new — include step-by-step explanations",
              "Familiar with basics — standard pace",
              "Experienced — focus on advanced trade-offs",
            ],
            correctAnswer: "Familiar with basics — standard pace",
            gapAdvice: "Keep Beginner Mode active and complete every practice drill.",
          },
        ],
      });
    }

    // Interactive AI Personal Tutor mode
    try {
      const llmRes = await runLLMCompletion({
        systemPrompt:
          `You are the VidMind AI Personal Tutor for a ${parsed.knowledgeLevel} learner. ` +
          `Teach clearly with concrete examples, check understanding, and stay grounded in the lesson context.`,
        userPrompt: `Course: ${parsed.courseTitle}
Current Lesson: ${parsed.lessonTitle}
Lesson Transcript / Notes:
${cleanContext}

Student Question / Request: ${parsed.question}`,
      });

      if (llmRes) {
        return NextResponse.json({
          reply: llmRes.text,
          engine: llmRes.engine,
        });
      }
    } catch {
      // Deterministic fallback
    }

    return NextResponse.json({
      reply: `Lesson Focus (${parsed.lessonTitle}): ${
        cleanContext.slice(0, 320) || "Review the lesson timestamps and practice prompt."
      }`,
      engine: "Deterministic Tutor Fallback",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Tutor error" },
      { status: 400 }
    );
  }
}
