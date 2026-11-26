import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateCourseCurriculum } from "@/lib/ai/pipeline";
import { buildAdaptiveStudySchedule } from "@/lib/scheduler/engine";
import type { GeneratedCourse } from "@/types/vidmind";

const CourseRequestSchema = z.object({
  videoId: z.string().min(1),
  title: z.string().min(1),
  durationSeconds: z.number().nonnegative(),
  chunks: z.array(
    z.object({
      index: z.number(),
      startSeconds: z.number(),
      endSeconds: z.number(),
      startTimestamp: z.string(),
      endTimestamp: z.string(),
      content: z.string(),
    })
  ),
  profile: z.object({
    deadlineDays: z.number().min(1).max(365),
    dailyMinutes: z.number().min(15).max(600),
    knowledgeLevel: z.enum(["beginner", "intermediate", "advanced"]),
    learningSpeed: z.enum(["slow", "moderate", "fast"]),
    schedulingMode: z.enum(["intensive", "balanced", "relaxed", "custom"]),
    preferredTime: z.string().default("19:00"),
    breakMinutes: z.number().min(0).max(60).default(10),
    daysOff: z.array(z.string()).default([]),
  }),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = CourseRequestSchema.parse(await req.json());
    const curriculum = await generateCourseCurriculum({
      videoId: parsed.videoId,
      title: parsed.title,
      durationSeconds: parsed.durationSeconds,
      chunks: parsed.chunks,
      knowledgeLevel: parsed.profile.knowledgeLevel,
    });

    const schedule = buildAdaptiveStudySchedule(curriculum.modules, parsed.profile);
    const estimatedStudyMinutes = curriculum.modules.reduce(
      (sum, mod) => sum + mod.estimatedMinutes,
      0
    );

    const course: GeneratedCourse = {
      id: `course-${parsed.videoId}-${Date.now()}`,
      title: curriculum.courseTitle,
      description: curriculum.description,
      videoId: parsed.videoId,
      videoTitle: parsed.title,
      totalVideoSeconds: parsed.durationSeconds,
      estimatedStudyMinutes,
      objectives: curriculum.objectives,
      modules: curriculum.modules,
      projectIdea: curriculum.projectIdea,
      schedule,
      engine: curriculum.engine,
    };

    return NextResponse.json(course);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid course parameters." }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Course generation failed" },
      { status: 500 }
    );
  }
}
