"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Award,
  Bot,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  GitBranch,
  GraduationCap,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Send,
  Sparkles,
  Youtube,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge, Button, Card, ProgressRing } from "@/components/ui/primitives";
import {
  hydrateWorkspaceFromSupabase,
  loadWorkspaceSnapshot,
  saveGeneratedCourse,
  saveProcessedVideo,
} from "@/lib/storage/workspace-store";
import { processVideoWithClientPipeline } from "@/lib/youtube/client-pipeline";
import type {
  CourseLesson,
  GeneratedCourse,
  KnowledgeLevel,
  LearningSpeed,
  ProcessedVideoPayload,
  SchedulePlan,
  SchedulingMode,
} from "@/types/vidmind";

interface DiagnosticQ {
  id: string;
  topic: string;
  question: string;
  options: string[];
  correctAnswer: string;
  gapAdvice: string;
}

const BUILD_STAGES = [
  "Extracting YouTube metadata & transcript...",
  "Analyzing topic boundaries & prerequisites...",
  "Architecting modules, lessons & practice drills...",
  "Computing feasible daily study blocks...",
];

function CoursesInner() {
  const searchParams = useSearchParams();
  const [videos, setVideos] = useState<ProcessedVideoPayload[]>([]);
  const [courses, setCourses] = useState<GeneratedCourse[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [directUrl, setDirectUrl] = useState("");
  const [activeCourse, setActiveCourse] = useState<GeneratedCourse | null>(null);

  // Personalized Learning Profile
  const [deadlineDays, setDeadlineDays] = useState(14);
  const [dailyMinutes, setDailyMinutes] = useState(60);
  const [knowledgeLevel, setKnowledgeLevel] = useState<KnowledgeLevel>("beginner");
  const [learningSpeed, setLearningSpeed] = useState<LearningSpeed>("moderate");
  const [schedulingMode, setSchedulingMode] = useState<SchedulingMode>("balanced");
  const [preferredTime, setPreferredTime] = useState("19:00");
  const [breakMinutes, setBreakMinutes] = useState(10);
  const [daysOff, setDaysOff] = useState<string[]>(["Sun"]);

  const [generating, setGenerating] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);
  const [stageDetail, setStageDetail] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [activeLessonStart, setActiveLessonStart] = useState(0);
  const [activeLesson, setActiveLesson] = useState<CourseLesson | null>(null);
  const [viewMode, setViewMode] = useState<"modules" | "roadmap">("modules");

  // AI Personal Tutor
  const [tutorInput, setTutorInput] = useState("");
  const [tutorLoading, setTutorLoading] = useState(false);
  const [tutorChat, setTutorChat] = useState<Array<{ role: "user" | "tutor"; text: string }>>([]);

  // Diagnostic Check
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagQuestions, setDiagQuestions] = useState<DiagnosticQ[]>([]);
  const [diagAnswers, setDiagAnswers] = useState<Record<string, string>>({});
  const [diagSubmitted, setDiagSubmitted] = useState(false);

  // Certificate modal
  const [certOpen, setCertOpen] = useState(false);
  const [missedDaysSimulated, setMissedDaysSimulated] = useState(0);

  useEffect(() => {
    const snap = loadWorkspaceSnapshot();
    setVideos(snap.videos);
    setCourses(snap.courses);

    const qUrl = searchParams.get("url");
    const paramVid = searchParams.get("videoId");
    if (qUrl) setDirectUrl(qUrl);
    if (paramVid && snap.videos.some((v) => v.video.videoId === paramVid)) {
      setSelectedVideoId(paramVid);
    } else if (snap.videos.length > 0) {
      setSelectedVideoId(snap.videos[0].video.videoId);
    }
    if (snap.courses.length > 0) {
      setActiveCourse(snap.courses[0]);
      setActiveLesson(snap.courses[0].modules[0]?.lessons[0] || null);
    }
    void hydrateWorkspaceFromSupabase().then((merged) => {
      if (merged && merged.videos.length > 0) {
        setVideos(merged.videos);
        setSelectedVideoId((prev) => prev || merged.videos[0].video.videoId);
      }
    });
  }, [searchParams]);

  async function handleGenerateCourse() {
    setErrorMsg("");
    setGenerating(true);
    setStageIdx(0);
    setStageDetail("Starting course pipeline...");

    try {
      let source = videos.find((v) => v.video.videoId === selectedVideoId);

      // Support pasting a YouTube Playlist URL directly!
      if (directUrl.trim() && /youtube\.com\/playlist\?list=/i.test(directUrl.trim())) {
        setStageDetail("Extracting playlist videos & building multi-part curriculum...");
        const plRes = await fetch("/api/courses/playlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playlistUrl: directUrl.trim(),
            profile: {
              deadlineDays,
              dailyMinutes,
              knowledgeLevel,
              learningSpeed,
              schedulingMode,
              preferredTime,
              breakMinutes,
              daysOff,
            },
          }),
        });
        const plCourse = (await plRes.json()) as GeneratedCourse & { error?: string };
        if (!plRes.ok) throw new Error(plCourse.error || "Playlist course generation failed.");
        setActiveCourse(plCourse);
        setActiveLesson(plCourse.modules[0]?.lessons[0] || null);
        setDirectUrl("");
        const next = saveGeneratedCourse(plCourse);
        setCourses(next.courses);
        return;
      }

      // Allow creating a course directly from ANY pasted YouTube link (including 3h-50h lectures)!
      if (directUrl.trim()) {
        source = await processVideoWithClientPipeline({
          url: directUrl.trim(),
          mode: "detailed",
          focus: "full",
          level: knowledgeLevel,
          language: "en",
          onProgress: (p) => {
            setStageDetail(p.detail);
            setStageIdx(p.stage === "metadata" ? 0 : 1);
          },
        });
        const nextSnap = saveProcessedVideo(source);
        setVideos(nextSnap.videos);
        setSelectedVideoId(source.video.videoId);
        setDirectUrl("");
      }

      if (!source) {
        throw new Error("Paste a YouTube video link above or choose a processed video.");
      }

      setStageIdx(2);
      setStageDetail("Architecting structured modules & lessons across full video timeline...");
      const res = await fetch("/api/courses/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: source.video.videoId,
          title: source.video.title,
          durationSeconds: source.video.durationSeconds,
          chunks: source.chunks,
          profile: {
            deadlineDays,
            dailyMinutes,
            knowledgeLevel,
            learningSpeed,
            schedulingMode,
            preferredTime,
            breakMinutes,
            daysOff,
          },
        }),
      });
      const course = (await res.json()) as GeneratedCourse & { error?: string };
      if (!res.ok) throw new Error(course.error || "Failed to generate course");
      setStageIdx(3);

      setActiveCourse(course);
      setActiveLesson(course.modules[0]?.lessons[0] || null);
      setTutorChat([]);
      setDiagQuestions([]);
      setMissedDaysSimulated(0);
      const next = saveGeneratedCourse(course);
      setCourses(next.courses);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Course generation failed.");
    } finally {
      setGenerating(false);
      setStageDetail("");
    }
  }

  function selectLesson(lesson: CourseLesson) {
    setActiveLesson(lesson);
    setActiveLessonStart(Math.floor(lesson.startSeconds));
  }

  function toggleLessonComplete(lessonId: string) {
    if (!activeCourse) return;
    const updatedModules = activeCourse.modules.map((m) => ({
      ...m,
      lessons: m.lessons.map((l) =>
        l.id === lessonId ? { ...l, completed: !l.completed } : l
      ),
    }));
    const updatedCourse: GeneratedCourse = { ...activeCourse, modules: updatedModules };
    setActiveCourse(updatedCourse);
    saveGeneratedCourse(updatedCourse);
  }

  async function triggerReschedule(simulateMissedDays = 0) {
    if (!activeCourse) return;
    const nextMissed = missedDaysSimulated + simulateMissedDays;
    setMissedDaysSimulated(nextMissed);

    const effectiveDeadline = Math.max(1, deadlineDays - nextMissed);
    const completedIds = activeCourse.modules
      .flatMap((m) => m.lessons)
      .filter((l) => l.completed)
      .map((l) => l.id);

    const res = await fetch("/api/courses/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modules: activeCourse.modules,
        completedLessonIds: completedIds,
        profile: {
          deadlineDays: effectiveDeadline,
          dailyMinutes,
          knowledgeLevel,
          learningSpeed,
          schedulingMode,
          preferredTime,
          breakMinutes,
          daysOff,
        },
      }),
    });
    if (res.ok) {
      const nextSchedule = (await res.json()) as SchedulePlan;
      const updated = { ...activeCourse, schedule: nextSchedule };
      setActiveCourse(updated);
      saveGeneratedCourse(updated);
    }
  }

  async function askTutor(promptText?: string) {
    if (!activeCourse) return;
    const question = (promptText ?? tutorInput).trim();
    if (!question) return;

    const lesson = activeLesson || activeCourse.modules[0]?.lessons[0];
    setTutorChat((prev) => [...prev, { role: "user", text: question }]);
    if (!promptText) setTutorInput("");
    setTutorLoading(true);

    try {
      const res = await fetch("/api/courses/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "tutor",
          courseTitle: activeCourse.title,
          lessonTitle: lesson?.title || activeCourse.title,
          lessonContext: `${lesson?.aiExplanation || ""}\nPractice: ${lesson?.practicePrompt || ""}`,
          knowledgeLevel,
          question,
        }),
      });
      const json = (await res.json()) as { reply?: string };
      setTutorChat((prev) => [
        ...prev,
        { role: "tutor", text: json.reply || "Try focusing on the key concepts in this lesson." },
      ]);
    } finally {
      setTutorLoading(false);
    }
  }

  async function runDiagnostic() {
    if (!activeCourse) return;
    setDiagLoading(true);
    setDiagSubmitted(false);
    setDiagAnswers({});
    try {
      const context = activeCourse.modules
        .map((m) => `${m.title}: ${m.lessons.map((l) => l.title).join(", ")}`)
        .join("\n");
      const res = await fetch("/api/courses/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "diagnostic",
          courseTitle: activeCourse.title,
          lessonContext: context,
          knowledgeLevel,
        }),
      });
      const json = (await res.json()) as { questions?: DiagnosticQ[] };
      setDiagQuestions(json.questions || []);
    } finally {
      setDiagLoading(false);
    }
  }

  function downloadCompletionCertificate() {
    if (!activeCourse) return;
    const lessons = activeCourse.modules.flatMap((m) => m.lessons);
    const done = lessons.filter((l) => l.completed).length;
    const pct = lessons.length ? Math.round((done / lessons.length) * 100) : 0;
    const content = [
      "VIDMIND AI — COURSE COMPLETION RECORD",
      "=====================================",
      `Course: ${activeCourse.title}`,
      `Source Video: ${activeCourse.videoTitle}`,
      `Completion: ${pct}% (${done}/${lessons.length} lessons)`,
      `Date: ${new Date().toISOString().slice(0, 10)}`,
      "",
      "Notice: Platform-issued learning completion record (not an official creator certificate).",
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vidmind-completion-${activeCourse.videoId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const allLessons = activeCourse?.modules.flatMap((m) => m.lessons) || [];
  const completedCount = allLessons.filter((l) => l.completed).length;
  const completionPct = allLessons.length ? (completedCount / allLessons.length) * 100 : 0;

  return (
    <AppShell
      title="AI Course Architect"
      subtitle="Turn any YouTube lecture or tutorial into a structured curriculum with an adaptive study plan & AI tutor"
      actions={
        activeCourse && (
          <Button size="sm" variant="secondary" onClick={() => setCertOpen(true)}>
            <Award className="w-4 h-4 text-amber-400" /> Completion Record
          </Button>
        )
      }
    >
      <div className="space-y-6">
        {/* Hero Course Builder Card */}
        <Card className="space-y-5 border-indigo-500/20">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <Badge tone="indigo">
                <Sparkles className="w-3 h-3" /> Flagship Curriculum Engine
              </Badge>
              <h2 className="text-lg font-semibold text-white mt-2">
                Build a Personalized Course from Any YouTube Video
              </h2>
            </div>
            {courses.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {courses.slice(0, 4).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setActiveCourse(c);
                      setActiveLesson(c.modules[0]?.lessons[0] || null);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs border cursor-pointer transition-colors ${
                      activeCourse?.id === c.id
                        ? "bg-indigo-500/20 border-indigo-500/45 text-indigo-200"
                        : "bg-[#0a0f1c] border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {c.title.slice(0, 26)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Direct URL Input + Processed Video Selector */}
          <div className="grid md:grid-cols-2 gap-3">
            <div className="flex items-center gap-2.5 rounded-xl bg-[#070b14] border border-white/[0.08] px-3.5 py-2.5 focus-within:border-indigo-500/60">
              <Youtube className="w-4 h-4 text-rose-400 shrink-0" />
              <input
                type="text"
                value={directUrl}
                onChange={(e) => setDirectUrl(e.target.value)}
                placeholder="Paste ANY YouTube URL directly (3h–50h tutorials supported)..."
                className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
              />
            </div>

            <select
              value={selectedVideoId}
              onChange={(e) => setSelectedVideoId(e.target.value)}
              className="rounded-xl bg-[#070b14] border border-white/[0.08] px-3.5 py-2.5 text-sm text-slate-200"
            >
              <option value="">
                {videos.length ? "Or select a previously analyzed video..." : "No saved videos yet — paste a URL on the left"}
              </option>
              {videos.map((v) => (
                <option key={v.video.videoId} value={v.video.videoId}>
                  {v.video.title.slice(0, 56)} ({v.video.durationFormatted})
                </option>
              ))}
            </select>
          </div>

          {/* Personalized Learning Profile Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 text-xs">
            <div className="space-y-1">
              <label className="text-slate-400">Deadline (Days)</label>
              <input
                type="number"
                min={1}
                max={180}
                value={deadlineDays}
                onChange={(e) => setDeadlineDays(Number(e.target.value))}
                className="w-full rounded-lg bg-[#070b14] border border-slate-800 px-2.5 py-2 text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-400">Daily Mins</label>
              <input
                type="number"
                min={15}
                max={480}
                value={dailyMinutes}
                onChange={(e) => setDailyMinutes(Number(e.target.value))}
                className="w-full rounded-lg bg-[#070b14] border border-slate-800 px-2.5 py-2 text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-400">Level</label>
              <select
                value={knowledgeLevel}
                onChange={(e) => setKnowledgeLevel(e.target.value as KnowledgeLevel)}
                className="w-full rounded-lg bg-[#070b14] border border-slate-800 px-2 py-2 text-white"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-slate-400">Speed</label>
              <select
                value={learningSpeed}
                onChange={(e) => setLearningSpeed(e.target.value as LearningSpeed)}
                className="w-full rounded-lg bg-[#070b14] border border-slate-800 px-2 py-2 text-white"
              >
                <option value="slow">Thorough</option>
                <option value="moderate">Moderate</option>
                <option value="fast">Fast</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-slate-400">Mode</label>
              <select
                value={schedulingMode}
                onChange={(e) => setSchedulingMode(e.target.value as SchedulingMode)}
                className="w-full rounded-lg bg-[#070b14] border border-slate-800 px-2 py-2 text-white"
              >
                <option value="balanced">Balanced</option>
                <option value="intensive">Intensive</option>
                <option value="relaxed">Relaxed</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-slate-400">Start Time</label>
              <input
                type="time"
                value={preferredTime}
                onChange={(e) => setPreferredTime(e.target.value)}
                className="w-full rounded-lg bg-[#070b14] border border-slate-800 px-2 py-2 text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-400">Break (Min)</label>
              <input
                type="number"
                min={0}
                max={45}
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(Number(e.target.value))}
                className="w-full rounded-lg bg-[#070b14] border border-slate-800 px-2 py-2 text-white"
              />
            </div>
            <div className="flex items-end">
              <Button
                className="w-full"
                onClick={() => void handleGenerateCourse()}
                disabled={generating || (!directUrl.trim() && !selectedVideoId)}
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <GraduationCap className="w-4 h-4" />}
                Architect
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>Days off:</span>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => {
              const active = daysOff.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() =>
                    setDaysOff((prev) =>
                      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
                    )
                  }
                  className={`px-2.5 py-1 rounded-lg border cursor-pointer transition-colors ${
                    active
                      ? "bg-indigo-500/20 border-indigo-500/45 text-indigo-200"
                      : "bg-[#070b14] border-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>

          {generating && (
            <div className="space-y-2.5 pt-2">
              {stageDetail && (
                <div className="text-xs font-medium text-cyan-300 bg-cyan-500/10 border border-cyan-500/25 rounded-lg px-3 py-2">
                  {stageDetail}
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {BUILD_STAGES.map((label, i) => (
                  <div
                    key={label}
                    className={`rounded-xl p-2.5 text-xs border transition-all ${
                      i <= stageIdx
                        ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-100"
                        : "bg-[#070b14] border-slate-800 text-slate-500"
                    }`}
                  >
                    <div className="font-mono text-[10px] mb-1">STAGE {i + 1}</div>
                    {label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-300">
              {errorMsg}
            </div>
          )}
        </Card>

        {activeCourse && (
          <div className="grid lg:grid-cols-12 gap-6 items-start">
            {/* Left/Main Lesson & Curriculum Workspace */}
            <div className="lg:col-span-7 space-y-5">
              <Card className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap gap-2">
                      <Badge tone="indigo">VidMind Course Engine</Badge>
                      <Badge tone="cyan">{activeCourse.modules.length} Modules • {allLessons.length} Lessons</Badge>
                    </div>
                    <h2 className="text-xl font-bold text-white">{activeCourse.title}</h2>
                    <p className="text-xs sm:text-sm text-slate-400">{activeCourse.description}</p>
                  </div>
                  <ProgressRing percentage={completionPct} size={68} />
                </div>

                {/* Embedded Lesson Player */}
                {activeCourse.videoId !== "custom" && (
                  <div className="rounded-2xl overflow-hidden bg-black border border-white/[0.08] aspect-video shadow-2xl">
                    <iframe
                      className="w-full h-full"
                      src={`https://www.youtube.com/embed/${encodeURIComponent(
                        activeCourse.videoId
                      )}?start=${activeLessonStart}`}
                      title={activeCourse.title}
                      allowFullScreen
                    />
                  </div>
                )}

                {/* Active Lesson Highlight */}
                {activeLesson && (
                  <div className="rounded-xl bg-gradient-to-r from-indigo-500/10 to-cyan-500/10 border border-indigo-500/30 p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono text-cyan-300">
                        ACTIVE LESSON • {activeLesson.startTimestamp}–{activeLesson.endTimestamp}
                      </span>
                      <Button
                        size="sm"
                        variant={activeLesson.completed ? "secondary" : "primary"}
                        onClick={() => toggleLessonComplete(activeLesson.id)}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {activeLesson.completed ? "Completed" : "Mark Complete"}
                      </Button>
                    </div>
                    <div className="font-semibold text-white">{activeLesson.title}</div>
                    <p className="text-xs text-slate-300">{activeLesson.aiExplanation}</p>
                    {activeLesson.practicePrompt && (
                      <div className="text-xs text-indigo-200 bg-[#070b14]/70 rounded-lg p-2.5 border border-white/[0.06]">
                        <strong>Practice Drill:</strong> {activeLesson.practicePrompt}
                      </div>
                    )}
                  </div>
                )}

                {/* Curriculum View Switcher + Diagnostic Action */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] pb-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setViewMode("modules")}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                        viewMode === "modules"
                          ? "bg-indigo-500/20 text-indigo-200 border border-indigo-500/35"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" /> Curriculum
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("roadmap")}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                        viewMode === "roadmap"
                          ? "bg-indigo-500/20 text-indigo-200 border border-indigo-500/35"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <GitBranch className="w-3.5 h-3.5" /> Visual Roadmap
                    </button>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => void runDiagnostic()} disabled={diagLoading}>
                    {diagLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardCheck className="w-3.5 h-3.5 text-cyan-400" />}
                    Diagnostic Check
                  </Button>
                </div>

                {/* Diagnostic Check Panel */}
                {diagQuestions.length > 0 && (
                  <div className="rounded-xl bg-[#070b14] border border-cyan-500/30 p-4 space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
                      Diagnostic Readiness Check
                    </div>
                    {diagQuestions.map((dq, i) => (
                      <div key={dq.id} className="space-y-1.5">
                        <div className="text-xs font-medium text-white">
                          {i + 1}. {dq.question}
                        </div>
                        <div className="grid gap-1">
                          {dq.options.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() =>
                                !diagSubmitted &&
                                setDiagAnswers((p) => ({ ...p, [dq.id]: opt }))
                              }
                              className={`text-left text-xs px-2.5 py-2 rounded-lg border cursor-pointer ${
                                diagSubmitted && opt === dq.correctAnswer
                                  ? "bg-emerald-500/20 border-emerald-500/45 text-emerald-200"
                                  : diagAnswers[dq.id] === opt
                                    ? "bg-indigo-500/20 border-indigo-500/45 text-indigo-200"
                                    : "bg-[#0d1322] border-slate-800 text-slate-300"
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                        {diagSubmitted && diagAnswers[dq.id] !== dq.correctAnswer && (
                          <div className="text-[11px] text-amber-300">Tip: {dq.gapAdvice}</div>
                        )}
                      </div>
                    ))}
                    {!diagSubmitted && (
                      <Button size="sm" onClick={() => setDiagSubmitted(true)}>
                        Evaluate Readiness
                      </Button>
                    )}
                  </div>
                )}

                {/* Modules or Visual Roadmap */}
                {viewMode === "roadmap" ? (
                  <div className="relative pl-6 space-y-5 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gradient-to-b before:from-indigo-500 before:via-cyan-400 before:to-emerald-400">
                    {activeCourse.modules.map((mod) => {
                      const modDone = mod.lessons.filter((l) => l.completed).length;
                      const pct = mod.lessons.length ? Math.round((modDone / mod.lessons.length) * 100) : 0;
                      return (
                        <div key={mod.id} className="relative rounded-xl bg-[#070b14] border border-white/[0.08] p-4 space-y-2">
                          <span className="absolute -left-[22px] top-5 h-3.5 w-3.5 rounded-full bg-indigo-500 ring-4 ring-[#0f1524]" />
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm text-white">{mod.title}</span>
                            <Badge tone={pct === 100 ? "emerald" : "indigo"}>{pct}% mastery</Badge>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {mod.lessons.map((l) => (
                              <button
                                key={l.id}
                                type="button"
                                onClick={() => selectLesson(l)}
                                className={`text-[11px] px-2.5 py-1 rounded-lg border cursor-pointer ${
                                  l.completed
                                    ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-300"
                                    : "bg-[#111726] border-slate-800 text-slate-300 hover:border-indigo-500/40"
                                }`}
                              >
                                {l.title}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {activeCourse.modules.map((mod) => (
                      <div key={mod.id} className="rounded-xl bg-[#070b14] border border-white/[0.07] p-4 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-white text-sm">{mod.title}</h3>
                          <span className="text-xs text-slate-400">{mod.estimatedMinutes} min</span>
                        </div>
                        <div className="space-y-2">
                          {mod.lessons.map((les) => {
                            const isSelected = activeLesson?.id === les.id;
                            return (
                              <div
                                key={les.id}
                                className={`rounded-xl border p-3 flex items-start justify-between gap-3 transition-colors ${
                                  isSelected
                                    ? "bg-indigo-500/10 border-indigo-500/45"
                                    : "bg-[#0e1424] border-white/[0.06]"
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => selectLesson(les)}
                                  className="text-left space-y-1 flex-1 cursor-pointer"
                                >
                                  <div className="text-sm font-medium text-indigo-300 flex items-center gap-1.5">
                                    <Play className="w-3 h-3 shrink-0" />
                                    <span>[{les.startTimestamp}] {les.title}</span>
                                  </div>
                                  <p className="text-xs text-slate-400 line-clamp-2">{les.aiExplanation}</p>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleLessonComplete(les.id)}
                                  className={`shrink-0 p-1.5 rounded-lg border cursor-pointer ${
                                    les.completed
                                      ? "bg-emerald-500/20 border-emerald-500/45 text-emerald-300"
                                      : "border-slate-700 text-slate-500 hover:text-white"
                                  }`}
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Capstone Card */}
                <div className="rounded-xl bg-gradient-to-r from-indigo-500/10 to-emerald-500/10 border border-indigo-500/25 p-4 space-y-2">
                  <div className="font-semibold text-sm text-white">
                    Capstone Project: {activeCourse.projectIdea.title}
                  </div>
                  <p className="text-xs text-slate-300">{activeCourse.projectIdea.description}</p>
                </div>
              </Card>
            </div>

            {/* Right Column: AI Personal Tutor + Adaptive Daily Scheduler */}
            <div className="lg:col-span-5 space-y-5">
              {/* Interactive AI Personal Tutor */}
              <Card className="space-y-3.5 border-cyan-500/20">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <Bot className="w-5 h-5 text-cyan-400" /> AI Personal Tutor
                  </h3>
                  <Badge tone="cyan">{knowledgeLevel}</Badge>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Simplify this lesson",
                    "Give a real-world example",
                    "Create a quick practice exercise",
                    "What prerequisites do I need?",
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => void askTutor(chip)}
                      className="text-[11px] px-2.5 py-1 rounded-full bg-[#070b14] border border-white/[0.08] hover:border-cyan-400/50 text-slate-300 cursor-pointer"
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                <div className="max-h-56 overflow-y-auto space-y-2 rounded-xl bg-[#070b14] border border-white/[0.06] p-3">
                  {tutorChat.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">
                      Select any lesson and ask your AI Personal Tutor for tailored explanations,
                      examples, or drills.
                    </p>
                  )}
                  {tutorChat.map((m, idx) => (
                    <div
                      key={idx}
                      className={`rounded-lg p-2.5 text-xs whitespace-pre-wrap ${
                        m.role === "user"
                          ? "bg-indigo-500/15 text-indigo-100 ml-6"
                          : "bg-[#111726] text-slate-200 mr-4"
                      }`}
                    >
                      {m.text}
                    </div>
                  ))}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void askTutor();
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={tutorInput}
                    onChange={(e) => setTutorInput(e.target.value)}
                    placeholder="Ask tutor about the active lesson..."
                    className="flex-1 rounded-xl bg-[#070b14] border border-slate-800 px-3 py-2 text-xs text-white"
                  />
                  <Button size="sm" type="submit" disabled={tutorLoading}>
                    {tutorLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  </Button>
                </form>
              </Card>

              {/* Adaptive Study Schedule & Missed-Day Recovery */}
              <Card className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <CalendarClock className="w-5 h-5 text-indigo-400" /> Adaptive Study Plan
                  </h3>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => void triggerReschedule(1)}>
                      Missed Day
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => void triggerReschedule(0)}>
                      <RefreshCw className="w-3.5 h-3.5" /> Sync
                    </Button>
                  </div>
                </div>

                <div
                  className={`rounded-xl p-3 text-xs border flex gap-2 ${
                    activeCourse.schedule.feasible
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
                      : "bg-amber-500/10 border-amber-500/30 text-amber-200"
                  }`}
                >
                  {!activeCourse.schedule.feasible && (
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                  )}
                  <div>
                    <div>{activeCourse.schedule.feasibilityMessage}</div>
                    <div className="mt-1 font-mono text-[11px]">
                      Est. Completion: {activeCourse.schedule.estimatedCompletionDate}
                      {missedDaysSimulated > 0 ? ` (${missedDaysSimulated} missed day recovered)` : ""}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {activeCourse.schedule.sessions.map((sess) => (
                    <div
                      key={sess.id}
                      className="rounded-xl bg-[#070b14] border border-white/[0.07] p-3 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-cyan-300 font-mono">
                        <span>Day {sess.dayNumber} • {sess.dateISO}</span>
                        <span>{sess.startTime} – {sess.endTime}</span>
                      </div>
                      <div className="font-medium text-white">{sess.lessonTitle}</div>
                      <div className="flex flex-wrap gap-1.5 text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300">
                          Watch {sess.viewingMinutes}m
                        </span>
                        <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300">
                          Notes {sess.notesMinutes}m
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                          Practice {sess.practiceMinutes}m
                        </span>
                        {sess.breakMinutes > 0 && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300">
                            Break {sess.breakMinutes}m
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/[0.07] pt-3 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Spaced Repetition Milestones
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {activeCourse.schedule.spacedRevisions.map((rev) => (
                      <div
                        key={rev.revisionLabel}
                        className="rounded-lg bg-[#070b14] border border-white/[0.07] p-2.5 text-xs"
                      >
                        <div className="font-medium text-indigo-300">{rev.revisionLabel}</div>
                        <div className="text-slate-400">{rev.dateISO}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* Completion Record Modal */}
      {certOpen && activeCourse && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setCertOpen(false)}
        >
          <Card
            className="max-w-lg w-full p-7 space-y-4 border-amber-400/35 bg-gradient-to-br from-[#121828] to-[#080c16]"
          >
            <div onClick={(e) => e.stopPropagation()} className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge tone="amber">VidMind AI Completion Record</Badge>
                <span className="text-xs font-mono text-slate-400">
                  {new Date().toISOString().slice(0, 10)}
                </span>
              </div>
              <h3 className="text-2xl font-bold text-white">{activeCourse.title}</h3>
              <p className="text-sm text-slate-300">
                Completed <strong>{completedCount}</strong> of{" "}
                <strong>{allLessons.length}</strong> structured lessons ({Math.round(completionPct)}%).
              </p>
              <p className="text-xs text-slate-400 border-t border-white/[0.08] pt-3">
                Note: This is a platform-issued VidMind AI learning completion record, not an
                official credential from the original video creator.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setCertOpen(false)}>
                  Close
                </Button>
                <Button size="sm" onClick={downloadCompletionCertificate}>
                  Download Record (.txt)
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </AppShell>
  );
}

export default function CoursesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#05070d] p-8 text-slate-400">Loading Course Architect...</div>}>
      <CoursesInner />
    </Suspense>
  );
}
