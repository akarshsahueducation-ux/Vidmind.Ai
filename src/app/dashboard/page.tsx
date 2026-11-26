"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Brain,
  Clock,
  Flame,
  GraduationCap,
  PlayCircle,
  Trophy,
  Youtube,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SetupGuide } from "@/components/onboarding/SetupGuide";
import { Badge, Button, Card, ProgressRing } from "@/components/ui/primitives";
import { StudyActivityChart, StudyHeatmap } from "@/components/visuals/AnalyticsCharts";
import { NeuralOrb3D } from "@/components/visuals/NeuralOrb3D";
import {
  hydrateWorkspaceFromSupabase,
  loadWorkspaceSnapshot,
  type WorkspaceSnapshot,
} from "@/lib/storage/workspace-store";

export default function DashboardPage() {
  const router = useRouter();
  const [snap, setSnap] = useState<WorkspaceSnapshot | null>(null);
  const [quickUrl, setQuickUrl] = useState("");

  useEffect(() => {
    setSnap(loadWorkspaceSnapshot());
    void hydrateWorkspaceFromSupabase().then((merged) => {
      if (merged) setSnap(merged);
    });
  }, []);

  const videos = snap?.videos || [];
  const courses = snap?.courses || [];
  const quizAttempts = snap?.quizAttempts || [];
  const activity = snap?.activity || [];

  const totalVideoSeconds = videos.reduce((a, v) => a + (v.video.durationSeconds || 0), 0);
  const totalStudyMinutes = activity.reduce((a, e) => a + e.minutes, 0);
  const avgQuizScore = quizAttempts.length
    ? Math.round(quizAttempts.reduce((a, q) => a + q.scorePct, 0) / quizAttempts.length)
    : 0;

  const activeDates = new Set(activity.filter((a) => a.minutes > 0).map((a) => a.dateISO));
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    if (activeDates.has(d.toISOString().slice(0, 10))) streak++;
    else if (i > 0) break;
  }

  const weakTopics = Array.from(new Set(quizAttempts.flatMap((q) => q.weakTopics))).slice(0, 4);
  const activeCourse = courses[0] || null;
  const nextSession = activeCourse?.schedule.sessions[0] || null;

  function launchQuickVideo(e: React.FormEvent) {
    e.preventDefault();
    if (!quickUrl.trim()) {
      router.push("/workspace");
      return;
    }
    router.push(`/workspace?url=${encodeURIComponent(quickUrl.trim())}`);
  }

  return (
    <AppShell
      title="Learning Command Center"
      subtitle={new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })}
      actions={
        <Link href="/workspace">
          <Button size="sm">
            <PlayCircle className="w-4 h-4" /> Analyze Video
          </Button>
        </Link>
      }
    >
      <div className="space-y-6">
        <SetupGuide snap={snap} />

        {/* First-Read Focus: Video Launcher + Next Scheduled Session */}
        <div className="grid lg:grid-cols-12 gap-5">
          <Card hover className="lg:col-span-7 bg-gradient-to-br from-[#19213c] via-[#13192c] to-[#0e1322] border-indigo-400/30 flex flex-col justify-between space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <Badge tone="cyan">Step 1 — Video Intelligence</Badge>
                <h2 className="text-xl sm:text-2xl font-bold text-white">
                  Turn Any YouTube Video Into Structured Knowledge
                </h2>
                <p className="text-sm text-slate-300">
                  Paste a watch, Shorts, Live, or youtu.be link to generate summaries, RAG chat, notes,
                  quizzes, and courses.
                </p>
              </div>
              <div className="hidden sm:block shrink-0">
                <NeuralOrb3D size={110} active />
              </div>
            </div>
            <form onSubmit={launchQuickVideo} className="flex flex-col sm:flex-row gap-2.5">
              <div className="flex-1 flex items-center gap-2.5 rounded-xl bg-[#090d16] border border-white/15 px-3.5 py-2.5 focus-within:border-cyan-400">
                <Youtube className="w-5 h-5 text-rose-400 shrink-0" />
                <input
                  type="text"
                  value={quickUrl}
                  onChange={(e) => setQuickUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-400 focus:outline-none"
                />
              </div>
              <Button type="submit" size="md">
                Analyze <ArrowRight className="w-4 h-4" />
              </Button>
            </form>
          </Card>

          <Card className="lg:col-span-5 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <Badge tone="emerald">Next Up</Badge>
              <Link href="/courses" className="text-xs font-semibold text-cyan-300 hover:underline">
                Course Architect →
              </Link>
            </div>
            {activeCourse && nextSession ? (
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-slate-400">Active Course</div>
                  <div className="font-bold text-white truncate">{activeCourse.title}</div>
                </div>
                <div className="rounded-xl bg-[#090d16] border border-white/10 p-3.5 text-xs space-y-1">
                  <div className="font-mono text-cyan-300">
                    Day {nextSession.dayNumber} • {nextSession.startTime} – {nextSession.endTime}
                  </div>
                  <div className="font-semibold text-white">{nextSession.lessonTitle}</div>
                  <div className="text-slate-400">
                    {nextSession.viewingMinutes}m watch • {nextSession.practiceMinutes}m practice
                  </div>
                </div>
                <Link href="/courses" className="block">
                  <Button variant="secondary" size="sm" className="w-full">
                    Resume Lesson <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3 py-2">
                <p className="text-sm text-slate-300">
                  No active course schedule yet. Convert any video into a personalized daily study
                  plan.
                </p>
                <Link href="/courses" className="block">
                  <Button variant="secondary" size="sm" className="w-full">
                    <GraduationCap className="w-4 h-4 text-cyan-300" /> Build First Course
                  </Button>
                </Link>
              </div>
            )}
          </Card>
        </div>

        {/* Compact Supporting Telemetry Strip */}
        <Card className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/10 gap-4 sm:gap-0">
            <div className="sm:px-4 flex items-center gap-3">
              <PlayCircle className="w-5 h-5 text-indigo-400 shrink-0" />
              <div>
                <div className="text-xl font-bold text-white">{videos.length}</div>
                <div className="text-xs text-slate-400">
                  Videos ({Math.round(totalVideoSeconds / 60)}m indexed)
                </div>
              </div>
            </div>
            <div className="sm:px-4 flex items-center gap-3">
              <GraduationCap className="w-5 h-5 text-cyan-400 shrink-0" />
              <div>
                <div className="text-xl font-bold text-white">{courses.length}</div>
                <div className="text-xs text-slate-400">AI Courses</div>
              </div>
            </div>
            <div className="sm:px-4 flex items-center gap-3">
              <Clock className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <div className="text-xl font-bold text-white">
                  {(totalStudyMinutes / 60).toFixed(1)}h
                </div>
                <div className="text-xs text-slate-400 flex items-center gap-1">
                  <Flame className="w-3 h-3 text-amber-400" /> {streak}d streak
                </div>
              </div>
            </div>
            <div className="sm:px-4 flex items-center gap-3">
              <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <div className="text-xl font-bold text-white">
                  {quizAttempts.length ? `${avgQuizScore}%` : "—"}
                </div>
                <div className="text-xs text-slate-400">{quizAttempts.length} quizzes</div>
              </div>
            </div>
          </div>
        </Card>

        {/* Analytics & Coach */}
        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-white">Study Activity Trend</h2>
                <p className="text-xs text-slate-400">Recorded study minutes across sessions</p>
              </div>
              <Badge tone="indigo">Activity</Badge>
            </div>
            <StudyActivityChart data={activity} />
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-cyan-400" />
              <h2 className="font-bold text-white">AI Study Coach</h2>
            </div>
            <StudyHeatmap activity={activity} />
            <div className="rounded-xl bg-[#090d16] border border-white/10 p-3.5 text-xs text-slate-200 leading-relaxed">
              {videos.length === 0 ? (
                <p>Process your first video above to start tracking study streaks and topic mastery.</p>
              ) : weakTopics.length > 0 ? (
                <p>
                  Recommended revision:{" "}
                  <span className="text-amber-300 font-semibold">{weakTopics.join(", ")}</span>.
                </p>
              ) : (
                <p>
                  {videos.length} video(s) indexed. Take a quiz inside Video Intelligence to surface
                  revision priorities.
                </p>
              )}
            </div>
          </Card>
        </div>

        {/* Recent Lists */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-white">Recently Processed Videos</h2>
              <Link href="/workspace" className="text-xs font-semibold text-cyan-300 hover:underline">
                View all →
              </Link>
            </div>
            {videos.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">No videos processed yet.</p>
            ) : (
              <div className="space-y-2.5">
                {videos.slice(0, 4).map((item) => (
                  <Link
                    key={item.video.videoId + item.video.title}
                    href={`/workspace?videoId=${encodeURIComponent(item.video.videoId)}`}
                    className="block rounded-xl bg-[#090d16] border border-white/10 hover:border-indigo-400/50 p-3.5 transition-colors"
                  >
                    <div className="font-semibold text-sm text-white truncate">{item.video.title}</div>
                    <div className="text-xs text-slate-400 mt-1 flex items-center justify-between">
                      <span>{item.video.channelName}</span>
                      <span>{item.video.durationFormatted}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-white">Courses Progress</h2>
              <Link href="/courses" className="text-xs font-semibold text-cyan-300 hover:underline">
                Manage →
              </Link>
            </div>
            {courses.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">No courses created yet.</p>
            ) : (
              <div className="space-y-3">
                {courses.slice(0, 3).map((course) => {
                  const lessons = course.modules.flatMap((m) => m.lessons);
                  const done = lessons.filter((l) => l.completed).length;
                  const pct = lessons.length ? (done / lessons.length) * 100 : 0;
                  return (
                    <Link
                      key={course.id}
                      href="/courses"
                      className="flex items-center justify-between gap-4 rounded-xl bg-[#090d16] border border-white/10 hover:border-indigo-400/50 p-3.5"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-white truncate">{course.title}</div>
                        <div className="text-xs text-slate-400 mt-1">
                          {done}/{lessons.length} lessons • Target {course.schedule.estimatedCompletionDate}
                        </div>
                      </div>
                      <ProgressRing percentage={pct} size={52} strokeWidth={5} />
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
