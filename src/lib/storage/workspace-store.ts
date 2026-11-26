"use client";

import type {
  GeneratedCourse,
  ProcessedVideoPayload,
} from "@/types/vidmind";

export interface SavedNote {
  id: string;
  videoId: string;
  title: string;
  markdown: string;
  tags: string[];
  updatedAt: string;
}

export interface SavedBookmark {
  id: string;
  videoId: string;
  videoTitle: string;
  timestamp: string;
  startSeconds: number;
  title: string;
  note: string;
  createdAt: string;
}

export interface QuizAttemptRecord {
  id: string;
  videoTitle: string;
  scorePct: number;
  weakTopics: string[];
  createdAt: string;
}

export interface ActivityEntry {
  dateISO: string;
  minutes: number;
}

export interface WorkspaceSnapshot {
  videos: ProcessedVideoPayload[];
  courses: GeneratedCourse[];
  notes: SavedNote[];
  bookmarks: SavedBookmark[];
  quizAttempts: QuizAttemptRecord[];
  activity: ActivityEntry[];
}

const STORAGE_KEY = "vidmind_workspace_v1";

const EMPTY_SNAPSHOT: WorkspaceSnapshot = {
  videos: [],
  courses: [],
  notes: [],
  bookmarks: [],
  quizAttempts: [],
  activity: [],
};

export function loadWorkspaceSnapshot(): WorkspaceSnapshot {
  if (typeof window === "undefined") return EMPTY_SNAPSHOT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_SNAPSHOT;
    const parsed = JSON.parse(raw) as Partial<WorkspaceSnapshot>;
    return {
      videos: parsed.videos || [],
      courses: parsed.courses || [],
      notes: parsed.notes || [],
      bookmarks: parsed.bookmarks || [],
      quizAttempts: parsed.quizAttempts || [],
      activity: parsed.activity || [],
    };
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

export function saveWorkspaceSnapshot(snapshot: WorkspaceSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Handle storage quota gracefully
  }
}

export function saveProcessedVideo(videoPayload: ProcessedVideoPayload): WorkspaceSnapshot {
  const snap = loadWorkspaceSnapshot();
  const filtered = snap.videos.filter(
    (v) => v.video.videoId !== videoPayload.video.videoId || videoPayload.video.videoId === "custom"
  );
  const next: WorkspaceSnapshot = {
    ...snap,
    videos: [videoPayload, ...filtered].slice(0, 20),
    activity: recordTodayActivity(snap.activity, 10),
  };
  saveWorkspaceSnapshot(next);
  syncEntityToSupabase("video", videoPayload);
  return next;
}

export function saveGeneratedCourse(course: GeneratedCourse): WorkspaceSnapshot {
  const snap = loadWorkspaceSnapshot();
  const filtered = snap.courses.filter((c) => c.id !== course.id);
  const next: WorkspaceSnapshot = {
    ...snap,
    courses: [course, ...filtered].slice(0, 15),
    activity: recordTodayActivity(snap.activity, 15),
  };
  saveWorkspaceSnapshot(next);
  syncEntityToSupabase("course", course);
  return next;
}

export function saveUserNote(note: SavedNote): WorkspaceSnapshot {
  const snap = loadWorkspaceSnapshot();
  const filtered = snap.notes.filter((n) => n.id !== note.id);
  const next: WorkspaceSnapshot = {
    ...snap,
    notes: [note, ...filtered].slice(0, 50),
  };
  saveWorkspaceSnapshot(next);
  syncEntityToSupabase("note", note);
  return next;
}

function syncEntityToSupabase(type: "video" | "course" | "note", payload: unknown) {
  if (typeof window === "undefined") return;
  fetch("/api/library", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, payload }),
  }).catch(() => null);
}

export async function hydrateWorkspaceFromSupabase(): Promise<WorkspaceSnapshot | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch("/api/library");
    if (!res.ok) return null;
    const data = (await res.json()) as {
      authenticated?: boolean;
      videos?: ProcessedVideoPayload[];
      notes?: SavedNote[];
    };
    if (!data.authenticated) return null;
    const local = loadWorkspaceSnapshot();
    const mergedVideoMap = new Map<string, ProcessedVideoPayload>();
    for (const v of local.videos) mergedVideoMap.set(v.video.videoId, v);
    for (const v of data.videos || []) {
      const existing = mergedVideoMap.get(v.video.videoId);
      if (!existing || v.transcript.length >= existing.transcript.length) {
        mergedVideoMap.set(v.video.videoId, {
          ...v,
          chunks: v.chunks.length ? v.chunks : existing?.chunks || [],
          summary: {
            ...v.summary,
            topics: v.summary.topics.length ? v.summary.topics : existing?.summary.topics || [],
            chapters: v.summary.chapters.length ? v.summary.chapters : existing?.summary.chapters || [],
          },
        });
      }
    }
    const merged: WorkspaceSnapshot = {
      ...local,
      videos: Array.from(mergedVideoMap.values()).slice(0, 20),
      notes: data.notes && data.notes.length > 0 ? data.notes : local.notes,
    };
    saveWorkspaceSnapshot(merged);
    return merged;
  } catch {
    return null;
  }
}

export function saveBookmarkItem(bookmark: SavedBookmark): WorkspaceSnapshot {
  const snap = loadWorkspaceSnapshot();
  const next: WorkspaceSnapshot = {
    ...snap,
    bookmarks: [bookmark, ...snap.bookmarks].slice(0, 100),
  };
  saveWorkspaceSnapshot(next);
  return next;
}

export function saveQuizAttempt(attempt: QuizAttemptRecord): WorkspaceSnapshot {
  const snap = loadWorkspaceSnapshot();
  const next: WorkspaceSnapshot = {
    ...snap,
    quizAttempts: [attempt, ...snap.quizAttempts].slice(0, 50),
    activity: recordTodayActivity(snap.activity, 10),
  };
  saveWorkspaceSnapshot(next);
  return next;
}

function recordTodayActivity(entries: ActivityEntry[], addMinutes: number): ActivityEntry[] {
  const today = new Date().toISOString().slice(0, 10);
  const idx = entries.findIndex((e) => e.dateISO === today);
  if (idx === -1) {
    return [...entries, { dateISO: today, minutes: addMinutes }].slice(-90);
  }
  const updated = [...entries];
  updated[idx] = { ...updated[idx], minutes: updated[idx].minutes + addMinutes };
  return updated;
}
