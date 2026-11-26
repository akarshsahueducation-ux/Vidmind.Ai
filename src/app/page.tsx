"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  Compass,
  GraduationCap,
  Layers,
  MessageSquareText,
  Network,
  Play,
  Sparkles,
  Youtube,
} from "lucide-react";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { NeuralOrb3D } from "@/components/visuals/NeuralOrb3D";

const PREVIEW_TABS = [
  {
    id: "summary",
    label: "1. AI Summary",
    badge: "VidMind AI",
    heading: "Structured Executive Brief & Chapter Timestamps",
    points: [
      "[00:00] Core Thesis — Distills 3-hour talks into scannable takeaways without fluff.",
      "[14:20] Definitions & Action Items — Extracts key terms, formulas, and practical steps.",
      "[42:10] Jump-to-Player — Click any [MM:SS] badge to seek the embedded YouTube player.",
    ],
  },
  {
    id: "course",
    label: "2. AI Course Architect",
    badge: "Adaptive Plan",
    heading: "Turn Long Videos Into Realistic Daily Study Blocks",
    points: [
      "Module 1 → Module 4 — Automatically splits long tutorials by true topic boundaries.",
      "Feasibility Engine — Verifies whether your deadline fits your daily study minutes.",
      "Missed-Day Recovery — Recalculates remaining lessons and spaced-repetition dates.",
    ],
  },
  {
    id: "chat",
    label: "3. RAG Chat & Mind Map",
    badge: "Grounded Q&A",
    heading: "Ask Questions Across Transcripts With Visual Concept Graphs",
    points: [
      "Timestamp Citations — Every AI answer links back to verified transcript excerpts.",
      "React Flow Mind Map — Drag, zoom, and inspect topic hierarchies visually.",
      "Study Studio — Export Markdown notes, PPTX slide decks, quizzes, and flashcards.",
    ],
  },
];

const FEATURES = [
  {
    icon: Youtube,
    color: "text-rose-300 bg-rose-500/15 border-rose-400/30",
    title: "Long-Video Intelligence",
    desc: "Hierarchical chunking handles 3 to 50+ hour courses without dropping context or fabricating timestamps.",
  },
  {
    icon: GraduationCap,
    color: "text-indigo-300 bg-indigo-500/15 border-indigo-400/30",
    title: "AI Course Architect",
    desc: "Transform long lectures into structured modules, diagnostic checks, an AI tutor, and realistic daily study plans.",
  },
  {
    icon: MessageSquareText,
    color: "text-cyan-300 bg-cyan-500/15 border-cyan-400/30",
    title: "RAG Video Chat",
    desc: "Ask questions across transcripts and jump straight to the exact [MM:SS] citation in the embedded player.",
  },
  {
    icon: CalendarClock,
    color: "text-emerald-300 bg-emerald-500/15 border-emerald-400/30",
    title: "Adaptive Study Scheduler",
    desc: "Checks deadline feasibility before generating schedules and recalculates automatically if you miss a day.",
  },
  {
    icon: Network,
    color: "text-violet-300 bg-violet-500/15 border-violet-400/30",
    title: "Interactive Mind Maps",
    desc: "Explore concepts, prerequisites, and cross-video connections using interactive React Flow graphs.",
  },
  {
    icon: Layers,
    color: "text-amber-300 bg-amber-500/15 border-amber-400/30",
    title: "Notes, Quizzes & Decks",
    desc: "Export Markdown notes, PPTX slide decks, spaced-repetition flashcards, and difficulty-tuned quizzes.",
  },
];

export default function LandingPage() {
  const router = useRouter();
  const [demoUrl, setDemoUrl] = useState("");
  const [previewTab, setPreviewTab] = useState("summary");

  function handleLaunch(e: React.FormEvent) {
    e.preventDefault();
    const target = demoUrl.trim()
      ? `/workspace?url=${encodeURIComponent(demoUrl.trim())}`
      : "/workspace";
    router.push(target);
  }

  const activePreview = PREVIEW_TABS.find((t) => t.id === previewTab) || PREVIEW_TABS[0];

  return (
    <div className="min-h-screen vm-grid-bg text-slate-100">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#080a10]/85 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold tracking-tight text-white">
              VIDMIND <span className="text-cyan-300">AI</span>
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
            <a href="#preview" className="hover:text-white">How It Works</a>
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#architect" className="hover:text-white">Course Architect</a>
            <Link href="/dashboard" className="hover:text-white">Dashboard</Link>
          </nav>
          <div className="flex items-center gap-2.5">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link href="/workspace">
              <Button size="sm">Start Learning</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-8 pt-16 pb-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-6"
        >
          <Badge tone="indigo" className="mx-auto">
            <BrainCircuit className="w-3.5 h-3.5" /> Turn Every Video Into Knowledge
          </Badge>

          <div className="flex justify-center -my-2">
            <NeuralOrb3D size={200} active label="Interactive 3D AI Core — Move Cursor" />
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-[1.08]">
            Your Videos. Your Knowledge.{" "}
            <span className="bg-gradient-to-r from-indigo-300 via-cyan-300 to-emerald-300 bg-clip-text text-transparent">
              Your AI-Powered Learning Journey.
            </span>
          </h1>

          <p className="text-base sm:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Transform hours of YouTube content into clear summaries, interactive courses,
            timestamped chat, notes, quizzes, and visual mind maps.
          </p>

          {/* Interactive YouTube URL Bar */}
          <form
            onSubmit={handleLaunch}
            className="max-w-2xl mx-auto mt-8 vm-glass rounded-2xl p-2 flex flex-col sm:flex-row gap-2"
          >
            <div className="flex items-center gap-2.5 flex-1 px-3">
              <Youtube className="w-5 h-5 text-rose-400 shrink-0" />
              <input
                type="text"
                value={demoUrl}
                onChange={(e) => setDemoUrl(e.target.value)}
                placeholder="Paste any YouTube link (watch, youtu.be, Shorts, or Live)..."
                className="w-full bg-transparent py-2.5 text-sm sm:text-base text-white placeholder:text-slate-400 focus:outline-none"
              />
            </div>
            <Button type="submit" size="lg" className="shrink-0">
              Start Learning <ArrowRight className="w-4 h-4" />
            </Button>
          </form>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <Link href="/courses">
              <Button variant="secondary" size="md">
                <GraduationCap className="w-4 h-4 text-cyan-300" /> Try AI Course Architect
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="ghost" size="md">Open Dashboard</Button>
            </Link>
          </div>
        </motion.div>

        {/* Interactive Product Preview */}
        <div id="preview" className="mt-14 vm-card p-6 sm:p-8 text-left border-indigo-400/25">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4 mb-6">
            <div className="flex flex-wrap gap-2">
              {PREVIEW_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPreviewTab(t.id)}
                  className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer transition-all ${
                    previewTab === t.id
                      ? "bg-indigo-500 text-white shadow-md"
                      : "bg-white/[0.05] text-slate-300 hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <Badge tone="cyan">{activePreview.badge}</Badge>
          </div>

          <div className="grid md:grid-cols-12 gap-6 items-center">
            <div className="md:col-span-7 space-y-4">
              <h3 className="text-xl sm:text-2xl font-bold text-white">{activePreview.heading}</h3>
              <div className="space-y-2.5">
                {activePreview.points.map((pt) => (
                  <div
                    key={pt}
                    className="flex items-start gap-3 rounded-xl bg-[#0b0f1b] border border-white/10 p-3.5 text-sm text-slate-200"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{pt}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="md:col-span-5 rounded-2xl bg-gradient-to-br from-[#1b2440] to-[#0d1221] border border-white/10 p-6 space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="font-mono">3-Step Workflow</span>
                <Play className="w-4 h-4 text-cyan-300" />
              </div>
              <div className="space-y-3 text-sm">
                <div className="p-3 rounded-xl bg-black/30 border border-white/10">
                  <strong className="text-indigo-300">Step 1:</strong> Paste any YouTube link
                </div>
                <div className="p-3 rounded-xl bg-black/30 border border-white/10">
                  <strong className="text-cyan-300">Step 2:</strong> Review Summary, Chapters &amp; Chat
                </div>
                <div className="p-3 rounded-xl bg-black/30 border border-white/10">
                  <strong className="text-emerald-300">Step 3:</strong> Generate Course &amp; Study Plan
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Highlights */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-8 py-14">
        <div className="text-center mb-10">
          <Badge tone="cyan">Core Capabilities</Badge>
          <h2 className="text-3xl font-bold text-white mt-3">
            Everything You Need in One Clear Workspace
          </h2>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((feat) => {
            const Icon = feat.icon;
            return (
              <Card key={feat.title} hover className="space-y-3">
                <div className={`h-11 w-11 rounded-xl border flex items-center justify-center ${feat.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-white">{feat.title}</h3>
                <p className="text-sm text-slate-300 leading-relaxed">{feat.desc}</p>
              </Card>
            );
          })}
        </div>
      </section>

      {/* AI Course Architect Showcase */}
      <section id="architect" className="max-w-7xl mx-auto px-4 sm:px-8 py-14">
        <Card className="p-8 bg-gradient-to-br from-[#171f36] to-[#0e1424] border-indigo-400/30">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div className="space-y-4">
              <Badge tone="indigo">Flagship Feature</Badge>
              <h2 className="text-3xl font-bold text-white">AI Course Architect</h2>
              <p className="text-slate-200 leading-relaxed">
                Turn a 5-hour or 20-hour YouTube tutorial into structured modules, lessons,
                diagnostic checks, and a realistic day-by-day study schedule.
              </p>
              <Link href="/courses" className="inline-block pt-1">
                <Button size="lg">
                  Open Course Architect <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
            <div className="rounded-2xl bg-[#090d16] border border-white/10 p-5 space-y-2.5 font-mono text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-white/10 font-sans">
                <span className="font-semibold text-white text-sm">Sample Daily Study Block</span>
                <Badge tone="emerald">Feasible Plan</Badge>
              </div>
              <div className="p-3 rounded-xl bg-[#13192b] border border-white/10 flex justify-between">
                <span className="text-indigo-300">7:00 – 7:30 PM</span>
                <span className="text-white">Watch Module 1 Lesson [00:00–28:40]</span>
              </div>
              <div className="p-3 rounded-xl bg-[#13192b] border border-white/10 flex justify-between">
                <span className="text-amber-300">7:30 – 7:40 PM</span>
                <span className="text-slate-200">Scheduled Break</span>
              </div>
              <div className="p-3 rounded-xl bg-[#13192b] border border-white/10 flex justify-between">
                <span className="text-cyan-300">7:40 – 8:05 PM</span>
                <span className="text-white">Notes Review &amp; Practice Questions</span>
              </div>
            </div>
          </div>
        </Card>
      </section>

      <footer className="border-t border-white/10 py-10 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-300">
          <div className="flex items-center gap-2 font-semibold text-white">
            <Compass className="w-4 h-4 text-cyan-300" />
            VIDMIND AI — Turn Every Video Into Knowledge.
          </div>
          <div className="flex items-center gap-6">
            <Link href="/workspace" className="hover:text-white">Workspace</Link>
            <Link href="/courses" className="hover:text-white">Courses</Link>
            <Link href="/login" className="hover:text-white">Sign In</Link>
            <Link href="/settings" className="hover:text-white">Settings</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
