import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { GeneratedCourse, ProcessedVideoPayload } from "@/types/vidmind";

/**
 * Supabase Postgres Library Sync Endpoint.
 * Persists authenticated user videos, summaries, courses, notes, and bookmarks.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ configured: false, authenticated: false });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ configured: true, authenticated: false });
  }

  try {
    const [videosRes, summariesRes, transcriptsRes, notesRes, bookmarksRes, coursesRes] =
      await Promise.all([
        supabase.from("videos").select("*").order("created_at", { ascending: false }).limit(20),
        supabase.from("summaries").select("*").order("created_at", { ascending: false }),
        supabase.from("transcripts").select("*"),
        supabase.from("notes").select("*").order("updated_at", { ascending: false }).limit(50),
        supabase.from("bookmarks").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("courses").select("*").order("created_at", { ascending: false }).limit(15),
      ]);

    const summaryByVideo = new Map<string, Record<string, unknown>>();
    for (const s of summariesRes.data || []) {
      if (!summaryByVideo.has(s.video_id)) summaryByVideo.set(s.video_id, s);
    }

    const transcriptByVideo = new Map<string, Record<string, unknown>>();
    for (const t of transcriptsRes.data || []) {
      transcriptByVideo.set(t.video_id, t);
    }

    const videos: ProcessedVideoPayload[] = (videosRes.data || []).map((v) => {
      const sum = summaryByVideo.get(v.id);
      const tr = transcriptByVideo.get(v.id);
      const segs = Array.isArray(tr?.segments) ? tr.segments : [];
      return {
        video: {
          videoId: v.youtube_video_id,
          url: v.url,
          title: v.title,
          channelName: v.channel_name || "YouTube Channel",
          description: v.description || "",
          thumbnailUrl: v.thumbnail_url || "",
          durationSeconds: v.duration_seconds || 0,
          durationFormatted: `${Math.floor((v.duration_seconds || 0) / 60)}:${String(
            (v.duration_seconds || 0) % 60
          ).padStart(2, "0")}`,
          language: v.language || "en",
          isAutoCaptions: Boolean(tr?.is_auto_generated),
          hasTranscript: segs.length > 0,
          wordCount: Number(tr?.word_count || 0),
          sourceType: (tr?.source_type as "captions" | "user_text" | "metadata_fallback") || "captions",
        },
        summary: {
          mode: (sum?.mode as "quick" | "detailed" | "learning") || "quick",
          level: (sum?.level as "beginner" | "intermediate" | "advanced") || "intermediate",
          language: (sum?.language as string) || "en",
          engine: (sum?.engine as string) || "VidMind AI",
          tldr: (sum?.tldr as string) || "",
          keyPoints: Array.isArray(sum?.key_points) ? sum.key_points : [],
          definitions: Array.isArray(sum?.definitions) ? sum.definitions : [],
          actionItems: Array.isArray(sum?.action_items) ? sum.action_items : [],
          quotes: Array.isArray(sum?.quotes) ? sum.quotes : [],
          topics: [],
          chapters: [],
        },
        transcript: segs,
        chunks: [],
      };
    });

    const notes = (notesRes.data || []).map((n) => ({
      id: n.id,
      videoId: n.video_id || "custom",
      title: n.title,
      markdown: n.content_markdown,
      tags: n.tags || [],
      updatedAt: n.updated_at,
    }));

    const bookmarks = (bookmarksRes.data || []).map((b) => ({
      id: b.id,
      videoId: b.video_id || "custom",
      videoTitle: b.title,
      timestamp: `${Math.floor((b.timestamp_seconds || 0) / 60)}:${String(
        Math.floor(b.timestamp_seconds || 0) % 60
      ).padStart(2, "0")}`,
      startSeconds: Number(b.timestamp_seconds || 0),
      title: b.title,
      note: b.note || "",
      createdAt: b.created_at,
    }));

    return NextResponse.json({
      configured: true,
      authenticated: true,
      userEmail: user.email,
      videos,
      notes,
      bookmarks,
      coursesCount: (coursesRes.data || []).length,
    });
  } catch (err) {
    return NextResponse.json({
      configured: true,
      authenticated: true,
      schemaPending: true,
      error: err instanceof Error ? err.message : "Database tables not yet migrated",
    });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ persisted: false, reason: "not_configured" });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ persisted: false, reason: "unauthenticated" });

  try {
    const body = (await req.json()) as {
      type: "video" | "note" | "bookmark" | "course";
      payload: unknown;
    };

    if (body.type === "video") {
      const vp = body.payload as ProcessedVideoPayload;
      const { data: videoRow, error: vErr } = await supabase
        .from("videos")
        .upsert(
          {
            user_id: user.id,
            youtube_video_id: vp.video.videoId,
            url: vp.video.url,
            title: vp.video.title,
            channel_name: vp.video.channelName,
            description: vp.video.description,
            thumbnail_url: vp.video.thumbnailUrl,
            duration_seconds: vp.video.durationSeconds,
            language: vp.video.language,
            status: "ready",
          },
          { onConflict: "user_id,youtube_video_id" }
        )
        .select("id")
        .single();

      if (vErr || !videoRow) throw vErr;

      await supabase.from("transcripts").insert({
        video_id: videoRow.id,
        source_type: vp.video.sourceType === "metadata_fallback" ? "captions" : vp.video.sourceType,
        language: vp.video.language,
        is_auto_generated: vp.video.isAutoCaptions,
        word_count: vp.video.wordCount,
        segments: vp.transcript,
      });

      if (vp.chunks.length > 0) {
        const chunkRows = vp.chunks.slice(0, 40).map((c) => ({
          video_id: videoRow.id,
          chunk_index: c.index,
          start_seconds: c.startSeconds,
          end_seconds: c.endSeconds,
          content: c.content,
          embedding: c.embedding && c.embedding.length === 1536 ? c.embedding : null,
        }));
        await supabase.from("transcript_chunks").insert(chunkRows);
      }

      await supabase.from("summaries").insert({
        video_id: videoRow.id,
        user_id: user.id,
        mode: vp.summary.mode,
        level: vp.summary.level,
        language: vp.summary.language,
        tldr: vp.summary.tldr,
        key_points: vp.summary.keyPoints,
        definitions: vp.summary.definitions,
        action_items: vp.summary.actionItems,
        quotes: vp.summary.quotes,
        engine: vp.summary.engine,
      });

      return NextResponse.json({ persisted: true, videoDbId: videoRow.id });
    }

    if (body.type === "note") {
      const note = body.payload as { title: string; markdown: string; tags: string[] };
      await supabase.from("notes").insert({
        user_id: user.id,
        title: note.title,
        content_markdown: note.markdown,
        tags: note.tags || [],
      });
      return NextResponse.json({ persisted: true });
    }

    if (body.type === "course") {
      const c = body.payload as GeneratedCourse;
      await supabase.from("courses").insert({
        user_id: user.id,
        title: c.title,
        description: c.description,
        learning_objectives: c.objectives,
        total_video_seconds: c.totalVideoSeconds,
        estimated_study_minutes: c.estimatedStudyMinutes,
      });
      return NextResponse.json({ persisted: true });
    }

    return NextResponse.json({ persisted: false });
  } catch (err) {
    return NextResponse.json({
      persisted: false,
      error: err instanceof Error ? err.message : "Persistence failed",
    });
  }
}
