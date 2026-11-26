"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookmarkPlus,
  BookOpen,
  Check,
  Copy,
  Download,
  FileText,
  GraduationCap,
  HelpCircle,
  Loader2,
  MessageSquare,
  Network,
  Presentation,
  Search,
  Sparkles,
  Square,
  Upload,
  Volume2,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { MindMapCanvas } from "@/components/visuals/MindMapCanvas";
import { NeuralOrb3D } from "@/components/visuals/NeuralOrb3D";
import {
  loadWorkspaceSnapshot,
  saveBookmarkItem,
  saveProcessedVideo,
  saveQuizAttempt,
  saveUserNote,
} from "@/lib/storage/workspace-store";
import type {
  ChatResponsePayload,
  FlashcardItem,
  KnowledgeLevel,
  MindMapNodeData,
  PresentationSlide,
  ProcessedVideoPayload,
  QuizQuestion,
  SummaryFocus,
  SummaryMode,
} from "@/types/vidmind";

type WorkspaceTab =
  | "summary"
  | "chat"
  | "transcript"
  | "notes"
  | "assess"
  | "mindmap"
  | "studio";

const STAGES = [
  "1. Metadata & URL",
  "2. Caption Extraction",
  "3. Semantic Chunking",
  "4. AI Knowledge Build",
];

function parseTimestampSeconds(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function WorkspaceInner() {
  const searchParams = useSearchParams();

  const [urlInput, setUrlInput] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedMediaUrl, setUploadedMediaUrl] = useState("");
  const mediaPlayerRef = useRef<HTMLVideoElement | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualTranscript, setManualTranscript] = useState("");
  const [mode, setMode] = useState<SummaryMode>("quick");
  const [focus, setFocus] = useState<SummaryFocus>("full");
  const [level, setLevel] = useState<KnowledgeLevel>("intermediate");
  const [language, setLanguage] = useState("en");

  const [loading, setLoading] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [streamPct, setStreamPct] = useState(0);
  const [streamDetail, setStreamDetail] = useState("Initializing pipeline...");
  const [errorMsg, setErrorMsg] = useState("");
  const [current, setCurrent] = useState<ProcessedVideoPayload | null>(null);
  const [playerStart, setPlayerStart] = useState(0);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("summary");
  const [speaking, setSpeaking] = useState(false);

  // Inline Active Recall Pop-Check under player
  const [popCheck, setPopCheck] = useState<QuizQuestion | null>(null);
  const [popPick, setPopPick] = useState("");
  const [popLoading, setPopLoading] = useState(false);

  // Custom Topic Quiz & Dual-Mode Flashcards
  const [customTopic, setCustomTopic] = useState("");
  const [quizTier, setQuizTier] = useState<"beginner" | "intermediate" | "advanced" | "custom">("intermediate");
  const [customQuizPrompt, setCustomQuizPrompt] = useState("");
  const [quizCount, setQuizCount] = useState("5");
  const [quizType, setQuizType] = useState<"mcq" | "true_false" | "short_answer" | "mixed">("mcq");
  const [matchedTimestamps, setMatchedTimestamps] = useState<string[]>([]);
  const [flashcardDepth, setFlashcardDepth] = useState<"normal" | "depth">("depth");
  const [flashcardLevel, setFlashcardLevel] = useState<"beginner" | "intermediate" | "advanced">("intermediate");

  // Chat state
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<
    Array<{ role: "user" | "assistant"; text: string; payload?: ChatResponsePayload }>
  >([]);

  // Transcript search
  const [transcriptQuery, setTranscriptQuery] = useState("");

  // Studio states
  const [notesMarkdown, setNotesMarkdown] = useState("");
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [flashcards, setFlashcards] = useState<FlashcardItem[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [mindMapNodes, setMindMapNodes] = useState<MindMapNodeData[]>([]);
  const [slides, setSlides] = useState<PresentationSlide[]>([]);
  const [repurposedText, setRepurposedText] = useState("");
  const [repurposeFormat, setRepurposeFormat] = useState("LinkedIn Post");
  const [studioLoading, setStudioLoading] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const qUrl = searchParams.get("url");
    const qVideoId = searchParams.get("videoId");
    const qStart = Number(searchParams.get("t") || "0");
    const snap = loadWorkspaceSnapshot();

    if (qVideoId) {
      const found = snap.videos.find((v) => v.video.videoId === qVideoId);
      if (found) {
        setCurrent(found);
        setUrlInput(found.video.url);
        if (!Number.isNaN(qStart) && qStart > 0) setPlayerStart(qStart);
        return;
      }
    }
    if (qUrl) {
      setUrlInput(qUrl);
      void processVideoRequest(qUrl);
    } else if (snap.videos.length > 0 && !current) {
      setCurrent(snap.videos[0]);
      setUrlInput(snap.videos[0].video.url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  }

  async function processVideoRequest(overrideUrl?: string, overrideFile?: File) {
    const targetFile = overrideFile ?? uploadedFile;
    const targetUrl = (overrideUrl ?? urlInput).trim();
    if (!targetUrl && !manualTranscript.trim() && !targetFile) {
      setErrorMsg("Paste a YouTube link, upload any video/audio file, or paste a transcript.");
      return;
    }

    setErrorMsg("");
    setLoading(true);
    setStageIndex(0);
    setStreamPct(10);
    setStreamDetail(
      targetFile
        ? `Uploading ${targetFile.name} & starting AI transcription...`
        : "Connecting to VidMind processing pipeline..."
    );

    try {
      let res: Response;
      if (targetFile) {
        const fd = new FormData();
        fd.append("file", targetFile);
        fd.append("manualTitle", manualTitle.trim());
        fd.append("mode", mode);
        fd.append("focus", focus);
        fd.append("level", level);
        fd.append("language", language);
        fd.append("stream", "true");
        res = await fetch("/api/videos/process", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/videos/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: targetUrl,
            manualTranscript: manualMode ? manualTranscript : "",
            manualTitle: manualMode ? manualTitle : "",
            mode,
            focus,
            level,
            language,
            stream: true,
          }),
        });
      }

      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || "Failed to process video.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let processed: ProcessedVideoPayload | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line) as {
            type: "progress" | "result" | "error";
            stage?: string;
            pct?: number;
            detail?: string;
            payload?: ProcessedVideoPayload;
            error?: string;
          };
          if (msg.type === "progress") {
            setStreamPct(msg.pct || 25);
            setStreamDetail(msg.detail || "Processing...");
            const stageMap: Record<string, number> = {
              metadata: 0,
              transcript: 1,
              chunking: 2,
              embeddings: 2,
              summarizing: 3,
            };
            if (msg.stage && msg.stage in stageMap) setStageIndex(stageMap[msg.stage]);
          } else if (msg.type === "error") {
            throw new Error(msg.error || "Processing error.");
          } else if (msg.type === "result" && msg.payload) {
            processed = msg.payload;
          }
        }
      }

      if (!processed) throw new Error("Incomplete processing stream.");

      setCurrent(processed);
      setPlayerStart(0);
      setChatMessages([]);
      setNotesMarkdown("");
      setQuizQuestions([]);
      setFlashcards([]);
      setMindMapNodes([]);
      setSlides([]);
      setRepurposedText("");
      setPopCheck(null);
      setMatchedTimestamps([]);
      saveProcessedVideo(processed);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Processing failed.");
    } finally {
      setLoading(false);
    }
  }

  async function askVideoQuestion(questionText: string) {
    if (!current || !questionText.trim()) return;
    const question = questionText.trim();
    setChatMessages((prev) => [...prev, { role: "user", text: question }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await fetch("/api/videos/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          videoTitle: current.video.title,
          segments: current.transcript,
          chunks: current.chunks,
        }),
      });
      const data = (await res.json()) as ChatResponsePayload;
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.answer, payload: data },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Unable to complete chat request right now." },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  async function runStudioGenerator(
    kind: "notes" | "quiz" | "flashcards" | "mindmap" | "presentation" | "repurpose",
    options?: Record<string, string>,
    topicOverride?: string
  ) {
    if (!current) return;
    setStudioLoading(true);
    try {
      const activeTopic = (topicOverride ?? customTopic).trim();
      const res = await fetch("/api/study/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          title: current.video.title,
          topics: current.summary.topics,
          customTopic: activeTopic,
          segments: current.transcript,
          chunks: current.chunks,
          options,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Generation failed.");

      setMatchedTimestamps(Array.isArray(json.matchedTimestamps) ? json.matchedTimestamps : []);
      if (kind === "notes") setNotesMarkdown(json.data.markdown || "");
      if (kind === "quiz") {
        setQuizQuestions(json.data.questions || []);
        setQuizAnswers({});
        setQuizSubmitted(false);
      }
      if (kind === "flashcards") {
        setFlashcards(json.data.flashcards || []);
        setCardIndex(0);
        setCardFlipped(false);
      }
      if (kind === "mindmap") setMindMapNodes(json.data.nodes || []);
      if (kind === "presentation") setSlides(json.data.slides || []);
      if (kind === "repurpose") setRepurposedText(json.data.content || "");
      notify("Generated cleanly with VidMind AI!");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to generate.");
    } finally {
      setStudioLoading(false);
    }
  }

  async function triggerInlinePopCheck() {
    if (!current) return;
    setPopLoading(true);
    setPopPick("");
    try {
      const nearestChunk =
        current.chunks.find(
          (c) => playerStart >= c.startSeconds && playerStart <= c.endSeconds
        ) || current.chunks[0];
      const res = await fetch("/api/study/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "quiz",
          title: current.video.title,
          topics: current.summary.topics,
          chunks: nearestChunk ? [nearestChunk] : current.chunks.slice(0, 1),
          options: { difficulty: level, count: "1", questionType: "mcq" },
        }),
      });
      const json = await res.json();
      const firstQ = json?.data?.questions?.[0] as QuizQuestion | undefined;
      if (firstQ) setPopCheck(firstQ);
    } finally {
      setPopLoading(false);
    }
  }

  function handleMediaOrCaptionUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (/\.(srt|vtt|txt)$/i.test(file.name)) {
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || "");
        setManualMode(true);
        setUploadedFile(null);
        setManualTranscript(text);
        if (!manualTitle) setManualTitle(file.name.replace(/\.(srt|vtt|txt)$/i, ""));
        notify(`Loaded ${file.name} (${text.length.toLocaleString()} chars)`);
      };
      reader.readAsText(file);
      return;
    }

    if (uploadedMediaUrl) URL.revokeObjectURL(uploadedMediaUrl);
    const objectUrl = URL.createObjectURL(file);
    setUploadedMediaUrl(objectUrl);
    setUploadedFile(file);
    setUrlInput("");
    notify(`Uploading ${file.name} for automatic AI transcription...`);
    void processVideoRequest(undefined, file);
  }

  useEffect(() => {
    if (mediaPlayerRef.current && current?.video.sourceType === "uploaded_media") {
      try {
        mediaPlayerRef.current.currentTime = playerStart;
      } catch {
        // Ignore seek errors before metadata loads
      }
    }
  }, [playerStart, current?.video.sourceType]);

  function gradeFlashcard(rating: "again" | "hard" | "good" | "easy") {
    if (!flashcards.length) return;
    const multipliers = { again: 1, hard: 2, good: 4, easy: 7 };
    const nextStatus = rating === "easy" ? "known" : rating === "again" ? "learning" : "review";
    setFlashcards((prev) =>
      prev.map((c, idx) =>
        idx === cardIndex
          ? {
              ...c,
              intervalDays:
                rating === "again" ? 1 : Math.max(1, c.intervalDays * multipliers[rating]),
              status: nextStatus,
            }
          : c
      )
    );
    setCardFlipped(false);
    setCardIndex((i) => (i + 1) % flashcards.length);
  }

  async function exportPPTX() {
    if (!slides.length || !current) return;
    const PptxGenJS = (await import("pptxgenjs")).default;
    const pptx = new PptxGenJS();
    pptx.title = current.video.title;
    for (const s of slides) {
      const slide = pptx.addSlide();
      slide.background = { color: "0B0F1A" };
      slide.addText(s.title, { x: 0.6, y: 0.5, w: 8.8, h: 0.8, fontSize: 24, bold: true, color: "F8FAFC" });
      slide.addText(s.bullets.map((b) => `• ${b}`).join("\n"), {
        x: 0.6,
        y: 1.5,
        w: 8.8,
        h: 3.5,
        fontSize: 15,
        color: "CBD5E1",
      });
      if (s.speakerNotes) slide.addNotes(s.speakerNotes);
    }
    await pptx.writeFile({ fileName: `vidmind-${current.video.videoId}.pptx` });
    notify("PPTX presentation downloaded!");
  }

  function toggleAudioSummary() {
    if (!current || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(
      `${current.video.title}. ${current.summary.tldr}`
    );
    utter.onend = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utter);
  }

  function submitQuiz() {
    if (!current || !quizQuestions.length) return;
    setQuizSubmitted(true);
    let correct = 0;
    const weak = new Set<string>();
    for (const q of quizQuestions) {
      if (quizAnswers[q.id] === q.correctAnswer) correct++;
      else weak.add(q.topic);
    }
    const scorePct = Math.round((correct / quizQuestions.length) * 100);
    saveQuizAttempt({
      id: `quiz-${Date.now()}`,
      videoTitle: current.video.title,
      scorePct,
      weakTopics: Array.from(weak),
      createdAt: new Date().toISOString(),
    });
    notify(`Quiz scored: ${scorePct}%`);
  }

  const filteredTranscript = useMemo(() => {
    if (!current) return [];
    const q = transcriptQuery.trim().toLowerCase();
    return q
      ? current.transcript.filter((t) => t.text.toLowerCase().includes(q))
      : current.transcript;
  }, [current, transcriptQuery]);

  function renderTimestampChips(text: string) {
    const parts = text.split(/(\[\d{1,2}:\d{2}(?::\d{2})?\])/g);
    return parts.map((part, idx) => {
      const match = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]$/.exec(part);
      if (match) {
        return (
          <button
            key={idx}
            type="button"
            onClick={() => setPlayerStart(parseTimestampSeconds(match[1]))}
            className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/35 font-mono text-xs hover:bg-indigo-500/30 cursor-pointer"
          >
            {match[1]}
          </button>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  }

  return (
    <AppShell
      title="Video Intelligence Workspace"
      subtitle="AI summarization, RAG timestamp chat, notes, spaced-repetition flashcards, mind maps & decks"
      actions={
        current && (
          <Link href={`/courses?videoId=${encodeURIComponent(current.video.videoId)}`}>
            <Button size="sm">
              <GraduationCap className="w-4 h-4" /> Turn Into Course
            </Button>
          </Link>
        )
      }
    >
      <div className="space-y-6">
        {/* Ingestion Card */}
        <Card className="space-y-4 border-indigo-500/20">
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value);
                if (e.target.value.trim()) setUploadedFile(null);
              }}
              placeholder="Paste any YouTube link — or upload any local Video/Audio file (MP4, MP3, WAV, WebM)..."
              className="flex-1 rounded-xl bg-[#070b14] border border-white/[0.08] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <label
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 px-4 py-3 text-xs font-semibold text-cyan-200 cursor-pointer shrink-0 transition-colors"
              title="Upload any video or audio file (even with no captions, title, or description)"
            >
              <Upload className="w-4 h-4" />
              {uploadedFile ? uploadedFile.name.slice(0, 18) : "Upload Video / Audio"}
              <input
                type="file"
                accept="video/*,audio/*,.mp4,.webm,.mov,.mkv,.mp3,.wav,.m4a,.aac,.ogg,.flac,.srt,.vtt,.txt"
                onChange={handleMediaOrCaptionUpload}
                className="hidden"
              />
            </label>
            <Button onClick={() => void processVideoRequest()} disabled={loading} size="lg">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Analyze Video
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <select
              value={focus}
              onChange={(e) => setFocus(e.target.value as SummaryFocus)}
              className="rounded-lg bg-[#070b14] border border-indigo-400/35 px-3 py-2 text-indigo-100 font-semibold"
              title="Choose exactly what output you want"
            >
              <option value="full">Output: Complete Breakdown</option>
              <option value="summary_only">Output: Summary &amp; Key Points Only</option>
              <option value="action_items">Output: Action Steps Only</option>
              <option value="definitions">Output: Definitions Only</option>
              <option value="chapters_only">Output: Chapters Only</option>
            </select>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as SummaryMode)}
              className="rounded-lg bg-[#070b14] border border-slate-800 px-3 py-2 text-slate-200"
            >
              <option value="quick">Quick Summary</option>
              <option value="detailed">Detailed Breakdown</option>
              <option value="learning">Learning Mode</option>
            </select>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as KnowledgeLevel)}
              className="rounded-lg bg-[#070b14] border border-slate-800 px-3 py-2 text-slate-200"
            >
              <option value="beginner">Beginner Level</option>
              <option value="intermediate">Intermediate Level</option>
              <option value="advanced">Advanced / Academic</option>
            </select>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="rounded-lg bg-[#070b14] border border-slate-800 px-3 py-2 text-slate-200"
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="hi">Hindi</option>
              <option value="fr">French</option>
              <option value="de">German</option>
            </select>
            <Button type="button" variant="ghost" size="sm" onClick={() => setManualMode((v) => !v)}>
              {manualMode ? "Use YouTube URL" : "Paste Transcript Instead"}
            </Button>
          </div>

          {manualMode && (
            <div className="space-y-2.5 pt-2 border-t border-white/[0.07]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <input
                  type="text"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="Optional video title..."
                  className="flex-1 min-w-[200px] rounded-xl bg-[#070b14] border border-slate-800 px-3 py-2 text-sm text-white"
                />
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs text-cyan-300 cursor-pointer">
                  Upload .SRT / .VTT / Media
                  <input
                    type="file"
                    accept=".srt,.vtt,.txt,video/*,audio/*"
                    onChange={handleMediaOrCaptionUpload}
                    className="hidden"
                  />
                </label>
              </div>
              <textarea
                rows={4}
                value={manualTranscript}
                onChange={(e) => setManualTranscript(e.target.value)}
                placeholder="Paste transcript lines or upload an .srt/.vtt subtitle file..."
                className="w-full rounded-xl bg-[#070b14] border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
          )}

          {errorMsg && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-300">
              {errorMsg}
            </div>
          )}

          {loading && (
            <div className="rounded-2xl bg-[#070b14] border border-cyan-500/30 p-4 flex flex-col sm:flex-row items-center gap-4">
              <NeuralOrb3D size={120} active label={`${streamPct}%`} />
              <div className="flex-1 space-y-2.5 w-full">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-cyan-200">{streamDetail}</span>
                  <span className="font-mono text-indigo-300">{streamPct}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400"
                    animate={{ width: `${streamPct}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {STAGES.map((st, idx) => (
                    <div
                      key={st}
                      className={`rounded-xl p-2 text-[11px] border transition-all ${
                        idx <= stageIndex
                          ? "bg-indigo-500/20 border-indigo-400/50 text-indigo-100"
                          : "bg-[#0c1120] border-slate-800 text-slate-500"
                      }`}
                    >
                      {st}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Card>

        {!current && !loading && (
          <Card hover className="p-8 text-center space-y-5 border-dashed border-white/15">
            <div className="flex justify-center">
              <NeuralOrb3D size={170} label="3D AI Video Engine" />
            </div>
            <div className="max-w-lg mx-auto space-y-2">
              <h2 className="text-xl font-bold text-white">Ready to Turn a Video Into Knowledge</h2>
              <p className="text-sm text-slate-300">
                Paste any YouTube URL above, or try one of these instant examples to explore summaries,
                RAG chat, flashcards, and mind maps right away.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {[
                { label: "TED: Inside the Mind of a Master Procrastinator", url: "https://www.youtube.com/watch?v=arj7oStGLkU" },
                { label: "3Blue1Brown: Neural Networks", url: "https://www.youtube.com/watch?v=aircAruvnKk" },
              ].map((sample) => (
                <Button
                  key={sample.url}
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setUrlInput(sample.url);
                    void processVideoRequest(sample.url);
                  }}
                >
                  {sample.label}
                </Button>
              ))}
            </div>
          </Card>
        )}

        {current && (
          <div className="grid lg:grid-cols-12 gap-6 items-start">
            {/* Left Video Player + Chapter Scrubber */}
            <Card className="lg:col-span-4 space-y-4">
              {current.video.sourceType === "uploaded_media" && uploadedMediaUrl ? (
                <div className="rounded-2xl overflow-hidden bg-black border border-white/[0.08] aspect-video flex items-center justify-center">
                  <video
                    ref={mediaPlayerRef}
                    src={uploadedMediaUrl}
                    controls
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : /^[A-Za-z0-9_-]{11}$/.test(current.video.videoId) && (
                <div className="rounded-2xl overflow-hidden bg-black border border-white/[0.08] aspect-video">
                  <iframe
                    className="w-full h-full"
                    src={`https://www.youtube.com/embed/${encodeURIComponent(
                      current.video.videoId
                    )}?start=${playerStart}`}
                    title={current.video.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              )}

              {/* Visual Chapter Scrubber */}
              {current.summary.chapters.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] text-slate-400 flex justify-between">
                    <span>Chapter Timeline Scrubber</span>
                    <span className="font-mono">{current.summary.chapters.length} segments</span>
                  </div>
                  <div className="flex gap-1 h-2.5 rounded-full overflow-hidden bg-slate-900">
                    {current.summary.chapters.map((ch, idx) => (
                      <button
                        key={idx}
                        type="button"
                        title={`${ch.timestamp} — ${ch.title}`}
                        onClick={() => setPlayerStart(ch.startSeconds)}
                        className="flex-1 bg-indigo-500/50 hover:bg-cyan-400 transition-colors cursor-pointer"
                      />
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h2 className="font-semibold text-white leading-snug">{current.video.title}</h2>
                <p className="text-xs text-slate-400 mt-1">
                  {current.video.channelName} • {current.video.durationFormatted}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge tone="indigo">VidMind AI</Badge>
                <Badge tone="cyan">{current.video.wordCount.toLocaleString()} words</Badge>
                <Badge tone={current.video.sourceType === "metadata_fallback" ? "amber" : "emerald"}>
                  {current.video.sourceType === "audio_transcription"
                    ? "Auto Audio Transcript"
                    : current.video.sourceType === "uploaded_media"
                    ? "Uploaded Media Transcript"
                    : current.video.sourceType === "captions"
                    ? "YouTube Captions"
                    : current.video.sourceType === "user_text"
                    ? "Uploaded Transcript"
                    : "Metadata Fallback"}
                </Badge>
              </div>

              {current.warning && (
                <div
                  className={`rounded-xl p-3 text-xs border ${
                    current.video.sourceType === "metadata_fallback"
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
                      : "bg-cyan-500/10 border-cyan-500/30 text-cyan-200"
                  }`}
                >
                  {current.warning}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    saveBookmarkItem({
                      id: `bm-${Date.now()}`,
                      videoId: current.video.videoId,
                      videoTitle: current.video.title,
                      timestamp: current.transcript[0]?.timestamp || "00:00",
                      startSeconds: playerStart,
                      title: `Bookmark at ${playerStart}s`,
                      note: current.summary.tldr.slice(0, 120),
                      createdAt: new Date().toISOString(),
                    });
                    notify("Saved bookmark to Library!");
                  }}
                >
                  <BookmarkPlus className="w-3.5 h-3.5" /> Bookmark
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const md = [
                      `# ${current.video.title}`,
                      "",
                      `## TL;DR`,
                      current.summary.tldr,
                      "",
                      ...(current.summary.keyPoints.length
                        ? ["## Key Points", ...current.summary.keyPoints.map((p) => `- ${p}`), ""]
                        : []),
                      ...(current.summary.actionItems.length
                        ? ["## Action Items", ...current.summary.actionItems.map((a) => `- ${a}`), ""]
                        : []),
                    ].join("\n");
                    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `vidmind-${current.video.videoId}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                    notify("Downloaded Markdown summary!");
                  }}
                >
                  <Download className="w-3.5 h-3.5" /> Export .md
                </Button>
                <Button size="sm" variant="ghost" onClick={toggleAudioSummary}>
                  {speaking ? <Square className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5" />}
                  {speaking ? "Stop Audio" : "Audio Brief"}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void triggerInlinePopCheck()} disabled={popLoading}>
                  {popLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <HelpCircle className="w-3.5 h-3.5 text-cyan-300" />}
                  Quick Pop-Check
                </Button>
              </div>

              {popCheck && (
                <div className="rounded-xl bg-[#070b14] border border-cyan-400/35 p-3.5 space-y-2 text-xs">
                  <div className="font-semibold text-cyan-300">Active Recall Check</div>
                  <div className="text-white">{popCheck.question}</div>
                  <div className="grid gap-1">
                    {popCheck.options.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setPopPick(opt)}
                        className={`text-left p-2 rounded-lg border cursor-pointer ${
                          popPick
                            ? opt === popCheck.correctAnswer
                              ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-200"
                              : popPick === opt
                                ? "bg-rose-500/20 border-rose-400/50 text-rose-200"
                                : "bg-slate-900 border-slate-800 text-slate-400"
                            : "bg-slate-900 border-slate-800 text-slate-200 hover:border-indigo-400/40"
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                  {popPick && <div className="text-[11px] text-slate-300">{popCheck.explanation}</div>}
                </div>
              )}
            </Card>

            {/* Right Multi-Tool Workspace */}
            <Card className="lg:col-span-8 space-y-5">
              <div className="flex flex-wrap gap-1.5 border-b border-white/[0.07] pb-3">
                {[
                  { id: "summary", label: "Summary", icon: BookOpen },
                  { id: "chat", label: "AI Video Chat", icon: MessageSquare },
                  { id: "transcript", label: "Transcript", icon: Search },
                  { id: "notes", label: "AI Notes", icon: FileText },
                  { id: "assess", label: "Quiz & Cards", icon: HelpCircle },
                  { id: "mindmap", label: "Mind Map", icon: Network },
                  { id: "studio", label: "Slides & Repurpose", icon: Presentation },
                ].map((t) => {
                  const Icon = t.icon;
                  const active = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveTab(t.id as WorkspaceTab)}
                      className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                        active ? "text-white" : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="wsTabPill"
                          transition={{ type: "spring", stiffness: 420, damping: 28 }}
                          className="absolute inset-0 rounded-lg bg-indigo-500/25 border border-indigo-400/45"
                        />
                      )}
                      <Icon className="relative z-10 w-3.5 h-3.5" />
                      <span className="relative z-10">{t.label}</span>
                    </button>
                  );
                })}
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                >
              {activeTab === "summary" && (
                <div className="space-y-5">
                  <div className="rounded-xl bg-[#070b14] border-l-2 border-indigo-500 p-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                        TL;DR
                      </span>
                      {current.summary.focus && current.summary.focus !== "full" && (
                        <Badge tone="cyan">Focus: {current.summary.focus.replace("_", " ")}</Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-200 leading-relaxed">{current.summary.tldr}</p>
                  </div>

                  {current.summary.keyPoints.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
                        Key Insights
                      </h3>
                      <ul className="space-y-2">
                        {current.summary.keyPoints.map((pt, i) => (
                          <li key={i} className="rounded-xl bg-[#070b14] border border-white/[0.07] p-3 text-sm text-slate-200">
                            {renderTimestampChips(pt)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {current.summary.actionItems.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-2.5">
                        Action Steps
                      </h3>
                      <ul className="space-y-2">
                        {current.summary.actionItems.map((act, i) => (
                          <li key={i} className="rounded-xl bg-emerald-500/10 border border-emerald-400/25 p-3 text-sm text-emerald-100">
                            {act}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {current.summary.definitions.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-2.5">
                        Key Definitions &amp; Concepts
                      </h3>
                      <div className="grid sm:grid-cols-2 gap-2.5">
                        {current.summary.definitions.map((d, i) => (
                          <div key={i} className="rounded-xl bg-[#070b14] border border-white/[0.07] p-3 text-xs space-y-1">
                            <div className="font-bold text-cyan-300">{d.term}</div>
                            <div className="text-slate-300">{d.definition}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {current.summary.chapters.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
                        Chapters &amp; Timeline
                      </h3>
                      <div className="grid sm:grid-cols-2 gap-2.5">
                        {current.summary.chapters.map((ch, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setPlayerStart(ch.startSeconds)}
                            className="text-left rounded-xl bg-[#070b14] border border-white/[0.07] hover:border-indigo-500/45 p-3 cursor-pointer"
                          >
                            <div className="flex items-center gap-2 text-xs font-mono text-indigo-300">
                              <span>{ch.timestamp}</span>
                              <span className="font-sans font-semibold text-white truncate">{ch.title}</span>
                            </div>
                            <p className="text-xs text-slate-400 mt-1 line-clamp-2">{ch.summary}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "chat" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "Explain the core thesis simply",
                      "What are the 5 key lessons?",
                      "List practical action items",
                      "Identify warnings or pitfalls",
                    ].map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => void askVideoQuestion(chip)}
                        className="text-[11px] px-2.5 py-1 rounded-full bg-[#070b14] border border-white/[0.08] hover:border-indigo-400/50 text-slate-300 cursor-pointer"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void askVideoQuestion(chatInput);
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Ask about any concept or timestamp (e.g. 'What happened at 02:30?')..."
                      className="flex-1 rounded-xl bg-[#070b14] border border-slate-800 px-3.5 py-2.5 text-sm text-white"
                    />
                    <Button type="submit" disabled={chatLoading}>
                      {chatLoading ? "Thinking..." : "Ask"}
                    </Button>
                  </form>

                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {chatMessages.length === 0 && (
                      <p className="text-sm text-slate-400 py-8 text-center">
                        Ask a question to search transcript chunks with RAG and clickable timestamps.
                      </p>
                    )}
                    {chatMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={`rounded-xl p-3.5 text-sm ${
                          msg.role === "user"
                            ? "bg-indigo-500/15 border border-indigo-500/30 text-indigo-100 ml-8"
                            : "bg-[#070b14] border border-white/[0.07] text-slate-200 mr-8"
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{renderTimestampChips(msg.text)}</div>
                        {msg.payload?.citations && msg.payload.citations.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2 border-t border-white/[0.07]">
                            {msg.payload.citations.map((cit, ci) => (
                              <button
                                key={ci}
                                type="button"
                                onClick={() => setPlayerStart(cit.startSeconds)}
                                className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 cursor-pointer"
                              >
                                Jump {cit.timestamp}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "transcript" && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="search"
                      value={transcriptQuery}
                      onChange={(e) => setTranscriptQuery(e.target.value)}
                      placeholder="Search transcript keywords..."
                      className="flex-1 rounded-xl bg-[#070b14] border border-slate-800 px-3.5 py-2 text-sm text-white"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          current.transcript.map((s) => `[${s.timestamp}] ${s.text}`).join("\n")
                        );
                        notify("Transcript copied!");
                      }}
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </Button>
                  </div>
                  <div className="max-h-[420px] overflow-y-auto space-y-2">
                    {filteredTranscript.map((seg, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 rounded-lg bg-[#070b14] p-2.5 text-sm">
                        <button
                          type="button"
                          onClick={() => setPlayerStart(seg.start)}
                          className="font-mono text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 shrink-0 cursor-pointer"
                        >
                          {seg.timestamp}
                        </button>
                        <span className="text-slate-300">{seg.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "notes" && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={studioLoading}
                      onClick={() => void runStudioGenerator("notes", { style: "student" })}
                    >
                      Generate Student Notes
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={studioLoading}
                      onClick={() => void runStudioGenerator("notes", { style: "exam" })}
                    >
                      Revision Notes
                    </Button>
                    {notesMarkdown && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          saveUserNote({
                            id: `note-${current.video.videoId}`,
                            videoId: current.video.videoId,
                            title: current.video.title,
                            markdown: notesMarkdown,
                            tags: current.summary.topics.slice(0, 4),
                            updatedAt: new Date().toISOString(),
                          });
                          notify("Saved note to Library!");
                        }}
                      >
                        <Check className="w-3.5 h-3.5" /> Save Note
                      </Button>
                    )}
                  </div>
                  <textarea
                    rows={14}
                    value={notesMarkdown}
                    onChange={(e) => setNotesMarkdown(e.target.value)}
                    placeholder="Generate structured AI notes or type Markdown notes here..."
                    className="w-full rounded-xl bg-[#070b14] border border-slate-800 p-3.5 text-sm font-mono text-slate-200"
                  />
                </div>
              )}

              {activeTab === "assess" && (
                <div className="space-y-6">
                  {/* Topic-Wise Filter & Custom Quiz / Flashcard Studio */}
                  <div className="rounded-2xl bg-[#070b14] border border-white/10 p-4 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-white">
                          Topic-Wise Quiz &amp; Flashcard Studio
                        </h3>
                        <p className="text-xs text-slate-400">
                          Click a topic from this video or type your own (e.g. &quot;Trees&quot;, &quot;Recursion&quot;).
                        </p>
                      </div>
                      {matchedTimestamps.length > 0 && (
                        <div className="flex flex-wrap gap-1 items-center text-[11px]">
                          <span className="text-slate-400">Matched:</span>
                          {matchedTimestamps.slice(0, 4).map((ts) => (
                            <button
                              key={ts}
                              type="button"
                              onClick={() => setPlayerStart(parseTimestampSeconds(ts))}
                              className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-mono cursor-pointer"
                            >
                              {ts}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {current.summary.topics.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {current.summary.topics.map((tp) => (
                          <button
                            key={tp}
                            type="button"
                            onClick={() => setCustomTopic(tp)}
                            className={`px-2.5 py-1 rounded-full text-xs border cursor-pointer transition-colors ${
                              customTopic.toLowerCase() === tp.toLowerCase()
                                ? "bg-indigo-500/25 border-indigo-400 text-white"
                                : "bg-[#111726] border-white/10 text-slate-300 hover:text-white"
                            }`}
                          >
                            #{tp}
                          </button>
                        ))}
                      </div>
                    )}

                    <input
                      type="text"
                      value={customTopic}
                      onChange={(e) => setCustomTopic(e.target.value)}
                      placeholder="Type any topic covered in the video (leave blank for entire video)..."
                      className="w-full rounded-xl bg-[#0e1424] border border-white/15 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500"
                    />

                    {/* Multi-Tier & Custom Quiz Controls */}
                    <div className="space-y-3 pt-2 border-t border-white/10">
                      <div className="flex flex-wrap gap-1.5">
                        {(["beginner", "intermediate", "advanced", "custom"] as const).map((tier) => (
                          <button
                            key={tier}
                            type="button"
                            onClick={() => setQuizTier(tier)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize border cursor-pointer ${
                              quizTier === tier
                                ? "bg-indigo-500 text-white border-indigo-400"
                                : "bg-[#111726] border-white/10 text-slate-300"
                            }`}
                          >
                            {tier === "custom" ? "Build Your Own Quiz" : `${tier} Quiz`}
                          </button>
                        ))}
                      </div>

                      {quizTier === "custom" && (
                        <div className="space-y-2.5 rounded-xl bg-[#0e1424] border border-indigo-400/30 p-3">
                          <textarea
                            rows={2}
                            value={customQuizPrompt}
                            onChange={(e) => setCustomQuizPrompt(e.target.value)}
                            placeholder="Describe exactly what you want (e.g., 'Ask 5 tricky coding & time-complexity questions on Trees with clear explanations')..."
                            className="w-full rounded-lg bg-[#070b14] border border-white/10 p-2.5 text-xs text-white"
                          />
                          <div className="flex flex-wrap gap-2 text-xs">
                            <select
                              value={quizType}
                              onChange={(e) =>
                                setQuizType(e.target.value as "mcq" | "true_false" | "short_answer" | "mixed")
                              }
                              className="rounded-lg bg-[#070b14] border border-white/10 px-2.5 py-1.5 text-white"
                            >
                              <option value="mcq">Multiple Choice</option>
                              <option value="true_false">True / False</option>
                              <option value="short_answer">Short Answer</option>
                              <option value="mixed">Mixed Format</option>
                            </select>
                            <select
                              value={quizCount}
                              onChange={(e) => setQuizCount(e.target.value)}
                              className="rounded-lg bg-[#070b14] border border-white/10 px-2.5 py-1.5 text-white"
                            >
                              <option value="3">3 Questions</option>
                              <option value="5">5 Questions</option>
                              <option value="8">8 Questions</option>
                            </select>
                          </div>
                        </div>
                      )}

                      <Button
                        size="sm"
                        disabled={studioLoading}
                        onClick={() =>
                          void runStudioGenerator("quiz", {
                            difficulty: quizTier === "custom" ? level : quizTier,
                            count: quizTier === "custom" ? quizCount : "5",
                            questionType: quizTier === "custom" ? quizType : "mcq",
                            customPrompt: quizTier === "custom" ? customQuizPrompt : "",
                          })
                        }
                      >
                        {studioLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        {quizTier === "custom" ? "Generate Custom Quiz" : `Generate ${quizTier} Quiz`}
                      </Button>
                    </div>

                    {/* Dual-Mode Flashcard Controls */}
                    <div className="space-y-2.5 pt-3 border-t border-white/10">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex rounded-xl bg-[#0e1424] border border-white/10 p-1">
                          {(["normal", "depth"] as const).map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setFlashcardDepth(d)}
                              className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                                flashcardDepth === d
                                  ? "bg-cyan-500 text-slate-950"
                                  : "text-slate-300"
                              }`}
                            >
                              {d === "normal" ? "Normal Flashcards" : "Depth Flashcards"}
                            </button>
                          ))}
                        </div>
                        <select
                          value={flashcardLevel}
                          onChange={(e) =>
                            setFlashcardLevel(e.target.value as "beginner" | "intermediate" | "advanced")
                          }
                          className="rounded-lg bg-[#0e1424] border border-white/10 px-2.5 py-1.5 text-xs text-white"
                        >
                          <option value="beginner">Beginner Cards</option>
                          <option value="intermediate">Intermediate Cards</option>
                          <option value="advanced">Advanced Cards</option>
                        </select>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={studioLoading}
                          onClick={() =>
                            void runStudioGenerator("flashcards", {
                              flashcardDepth,
                              difficulty: flashcardLevel,
                              count: "6",
                            })
                          }
                        >
                          Generate {flashcardDepth === "depth" ? "Depth" : "Normal"} Flashcards
                        </Button>
                      </div>
                    </div>
                  </div>

                  {quizQuestions.length > 0 && (
                    <div className="space-y-4">
                      {quizQuestions.map((q, qi) => (
                        <div key={q.id} className="rounded-xl bg-[#070b14] border border-white/[0.07] p-4 space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-white">
                              {qi + 1}. {q.question}
                            </span>
                            {q.topic && <Badge tone="indigo">{q.topic}</Badge>}
                          </div>
                          {q.options && q.options.length > 0 ? (
                            <div className="grid gap-1.5">
                              {q.options.map((opt) => {
                                const picked = quizAnswers[q.id] === opt;
                                const isCorrect = quizSubmitted && opt === q.correctAnswer;
                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() =>
                                      !quizSubmitted &&
                                      setQuizAnswers((prev) => ({ ...prev, [q.id]: opt }))
                                    }
                                    className={`text-left text-xs p-2.5 rounded-lg border cursor-pointer ${
                                      isCorrect
                                        ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-200"
                                        : picked
                                          ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-200"
                                          : "bg-slate-900 border-slate-800 text-slate-300"
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <textarea
                              rows={2}
                              disabled={quizSubmitted}
                              value={quizAnswers[q.id] || ""}
                              onChange={(e) =>
                                setQuizAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                              }
                              placeholder="Type your answer..."
                              className="w-full rounded-lg bg-slate-900 border border-slate-800 p-2.5 text-xs text-white"
                            />
                          )}
                          {quizSubmitted && (
                            <div className="text-xs text-slate-300 pt-1 space-y-1">
                              {(!q.options || q.options.length === 0) && (
                                <div className="text-emerald-300">
                                  <strong>Expected Answer:</strong> {q.correctAnswer}
                                </div>
                              )}
                              <div className="text-slate-400">{q.explanation}</div>
                            </div>
                          )}
                        </div>
                      ))}
                      {!quizSubmitted && <Button onClick={submitQuiz}>Submit Quiz</Button>}
                    </div>
                  )}

                  {flashcards.length > 0 && (
                    <div className="rounded-xl bg-[#070b14] border border-indigo-500/35 p-5 space-y-4">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>
                          Card {cardIndex + 1} / {flashcards.length} • {flashcards[cardIndex].topic}
                        </span>
                        <div className="flex gap-2">
                          {flashcards[cardIndex].timestamp && (
                            <button
                              type="button"
                              onClick={() =>
                                setPlayerStart(parseTimestampSeconds(flashcards[cardIndex].timestamp!))
                              }
                              className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono cursor-pointer"
                            >
                              {flashcards[cardIndex].timestamp}
                            </button>
                          )}
                          <Badge tone="cyan">Interval: {flashcards[cardIndex].intervalDays}d</Badge>
                          <Badge tone={flashcards[cardIndex].status === "known" ? "emerald" : "amber"}>
                            {flashcards[cardIndex].status}
                          </Badge>
                        </div>
                      </div>
                      <motion.button
                        type="button"
                        onClick={() => setCardFlipped((f) => !f)}
                        animate={{ rotateY: cardFlipped ? 180 : 0 }}
                        transition={{ type: "spring", stiffness: 280, damping: 24 }}
                        style={{ transformStyle: "preserve-3d" }}
                        className="w-full min-h-[160px] rounded-xl bg-[#111726] border border-indigo-400/25 p-6 text-center text-sm text-white cursor-pointer"
                      >
                        <div style={{ transform: cardFlipped ? "rotateY(180deg)" : "none" }} className="space-y-3">
                          {cardFlipped ? (
                            <>
                              <div className="font-medium text-white">{flashcards[cardIndex].back}</div>
                              {flashcards[cardIndex].deepNote && (
                                <div className="text-xs text-cyan-200 bg-cyan-500/10 border border-cyan-400/25 rounded-lg p-3 text-left">
                                  <strong>In-Depth Breakdown:</strong> {flashcards[cardIndex].deepNote}
                                </div>
                              )}
                              {flashcards[cardIndex].example && (
                                <div className="text-xs text-emerald-200 bg-emerald-500/10 border border-emerald-400/25 rounded-lg p-2.5 text-left">
                                  <strong>Example:</strong> {flashcards[cardIndex].example}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="font-semibold text-base">{flashcards[cardIndex].front}</div>
                          )}
                        </div>
                      </motion.button>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-400">Rate recall to adapt interval:</span>
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="danger" onClick={() => gradeFlashcard("again")}>Again (1d)</Button>
                          <Button size="sm" variant="ghost" onClick={() => gradeFlashcard("hard")}>Hard</Button>
                          <Button size="sm" variant="secondary" onClick={() => gradeFlashcard("good")}>Good</Button>
                          <Button size="sm" onClick={() => gradeFlashcard("easy")}>Easy</Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "mindmap" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={customTopic}
                      onChange={(e) => setCustomTopic(e.target.value)}
                      placeholder="Optional topic focus (e.g. Trees)..."
                      className="flex-1 min-w-[200px] rounded-xl bg-[#070b14] border border-white/15 px-3 py-2 text-xs text-white"
                    />
                    <Button size="sm" disabled={studioLoading} onClick={() => void runStudioGenerator("mindmap")}>
                      Generate Interactive Mind Map
                    </Button>
                  </div>
                  <MindMapCanvas items={mindMapNodes} />
                </div>
              )}

              {activeTab === "studio" && (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2 items-center">
                      <Button
                        size="sm"
                        disabled={studioLoading}
                        onClick={() => void runStudioGenerator("presentation", { slideCount: "6" })}
                      >
                        Generate Slide Deck
                      </Button>
                      {slides.length > 0 && (
                        <Button size="sm" variant="secondary" onClick={exportPPTX}>
                          <Download className="w-3.5 h-3.5" /> Export PPTX
                        </Button>
                      )}
                    </div>
                    {slides.length > 0 && (
                      <div className="grid sm:grid-cols-2 gap-3">
                        {slides.map((sl, si) => (
                          <div key={si} className="rounded-xl bg-[#070b14] border border-white/[0.07] p-3.5 space-y-1.5">
                            <div className="font-semibold text-sm text-indigo-300">
                              Slide {si + 1}: {sl.title}
                            </div>
                            <ul className="text-xs text-slate-300 list-disc pl-4 space-y-1">
                              {sl.bullets.map((b, bi) => (
                                <li key={bi}>{b}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 border-t border-white/[0.07] pt-4">
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={repurposeFormat}
                        onChange={(e) => setRepurposeFormat(e.target.value)}
                        className="rounded-lg bg-[#070b14] border border-slate-800 px-3 py-1.5 text-xs text-white"
                      >
                        <option>LinkedIn Post</option>
                        <option>X Thread</option>
                        <option>Blog Article</option>
                        <option>Newsletter Issue</option>
                        <option>Short-Video Script</option>
                      </select>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={studioLoading}
                        onClick={() => void runStudioGenerator("repurpose", { format: repurposeFormat })}
                      >
                        Repurpose Video Content
                      </Button>
                    </div>
                    {repurposedText && (
                      <textarea
                        rows={8}
                        value={repurposedText}
                        onChange={(e) => setRepurposedText(e.target.value)}
                        className="w-full rounded-xl bg-[#070b14] border border-slate-800 p-3 text-sm text-slate-200"
                      />
                    )}
                  </div>
                </div>
              )}
                </motion.div>
              </AnimatePresence>
            </Card>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl bg-indigo-600 text-white px-4 py-2.5 text-sm shadow-xl">
          {toast}
        </div>
      )}
    </AppShell>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#05070d] p-8 text-slate-400">Loading workspace...</div>}>
      <WorkspaceInner />
    </Suspense>
  );
}
