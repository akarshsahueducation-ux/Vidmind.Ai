import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateCourseCurriculum } from "@/lib/ai/pipeline";
import { buildAdaptiveStudySchedule } from "@/lib/scheduler/engine";
import {
  chunkTranscript,
  extractPlaylistId,
  fetchPlaylistVideoIds,
  fetchYouTubeVideoAndTranscript,
  formatTimestamp,
} from "@/lib/youtube/extractor";
import type { CourseModule, GeneratedCourse } from "@/types/vidmind";

export const maxDuration = 60;

const PlaylistCourseSchema = z.object({
  playlistUrl: z.string().min(5),
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
    const parsed = PlaylistCourseSchema.parse(await req.json());
    const playlistId = extractPlaylistId(parsed.playlistUrl);
    if (!playlistId) {
      return NextResponse.json(
        { error: "Not a valid YouTube playlist URL (expected youtube.com/playlist?list=...)." },
        { status: 400 }
      );
    }

    const videoIds = await fetchPlaylistVideoIds(playlistId, 6);
    if (!videoIds.length) {
      return NextResponse.json(
        { error: "Could not extract videos from that playlist. Ensure it is public." },
        { status: 404 }
      );
    }

    const fetchedList = await Promise.all(
      videoIds.map(async (vid) => {
        try {
          const data = await fetchYouTubeVideoAndTranscript(vid, "en");
          return { vid, data };
        } catch {
          return null;
        }
      })
    );

    const valid = fetchedList.filter((item): item is NonNullable<typeof item> => item !== null);
    if (!valid.length) {
      return NextResponse.json(
        { error: "Failed to load metadata from playlist videos." },
        { status: 502 }
      );
    }

    // Build one module per playlist video
    const modules: CourseModule[] = [];
    let totalVideoSeconds = 0;

    for (let i = 0; i < valid.length; i++) {
      const { vid, data } = valid[i];
      totalVideoSeconds += data.durationSeconds || 0;
      const chunks = chunkTranscript(data.segments, 650);
      const curr = await generateCourseCurriculum({
        videoId: vid,
        title: data.title,
        durationSeconds: data.durationSeconds,
        chunks: chunks.slice(0, 4),
        knowledgeLevel: parsed.profile.knowledgeLevel,
      });

      const mergedLessons = curr.modules.flatMap((m) => m.lessons).map((l, li) => ({
        ...l,
        id: `pl-${vid}-${li + 1}`,
        order: li + 1,
      }));

      modules.push({
        id: `pl-mod-${i + 1}`,
        order: i + 1,
        title: `Part ${i + 1}: ${data.title.slice(0, 52)}`,
        description: curr.description,
        estimatedMinutes:
          mergedLessons.reduce((acc, l) => acc + l.estimatedMinutes, 0) || 20,
        difficulty: parsed.profile.knowledgeLevel,
        lessons: mergedLessons.length
          ? mergedLessons
          : [
              {
                id: `pl-${vid}-1`,
                order: 1,
                title: data.title,
                startSeconds: 0,
                endSeconds: data.durationSeconds || 600,
                startTimestamp: "00:00",
                endTimestamp: formatTimestamp(data.durationSeconds || 600),
                estimatedMinutes: Math.max(10, Math.round((data.durationSeconds || 600) / 60)),
                difficulty: parsed.profile.knowledgeLevel,
                objectives: [`Complete ${data.title}`],
                keyConcepts: [],
                aiExplanation: data.description.slice(0, 260) || data.title,
                practicePrompt: "Summarize key takeaways after watching this playlist entry.",
                completed: false,
              },
            ],
      });
    }

    const schedule = buildAdaptiveStudySchedule(modules, parsed.profile);
    const estimatedStudyMinutes = modules.reduce((s, m) => s + m.estimatedMinutes, 0);

    const course: GeneratedCourse = {
      id: `playlist-${playlistId}-${Date.now()}`,
      title: `Playlist Course (${valid.length} Videos)`,
      description: `Multi-video course compiled from YouTube playlist ${playlistId}.`,
      videoId: valid[0].vid,
      videoTitle: valid[0].data.title,
      totalVideoSeconds,
      estimatedStudyMinutes,
      objectives: valid.map((v) => v.data.title),
      modules,
      projectIdea: {
        title: "Playlist Capstone Integration",
        description: "Combine techniques taught across all playlist videos into a single project.",
        criteria: ["Applies concepts across modules", "Documents architecture & learnings"],
      },
      schedule,
      engine: "VidMind Playlist Course Engine",
    };

    return NextResponse.json(course);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Playlist course generation failed" },
      { status: 500 }
    );
  }
}
