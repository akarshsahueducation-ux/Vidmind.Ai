import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildAdaptiveStudySchedule } from "@/lib/scheduler/engine";

const RescheduleSchema = z.object({
  modules: z.array(z.any()),
  completedLessonIds: z.array(z.string()).default([]),
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
    const parsed = RescheduleSchema.parse(await req.json());
    const schedule = buildAdaptiveStudySchedule(
      parsed.modules,
      parsed.profile,
      new Set(parsed.completedLessonIds)
    );
    return NextResponse.json(schedule);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to recalculate schedule" },
      { status: 400 }
    );
  }
}
