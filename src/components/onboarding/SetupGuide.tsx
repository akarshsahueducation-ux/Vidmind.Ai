"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Compass,
  FileText,
  GraduationCap,
  HelpCircle,
  MessageSquareText,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import { Badge, Button, Card } from "@/components/ui/primitives";
import type { WorkspaceSnapshot } from "@/lib/storage/workspace-store";

interface GuideStep {
  id: string;
  title: string;
  whatItDoes: string;
  href: string;
  cta: string;
  icon: React.ComponentType<{ className?: string }>;
  done: boolean;
}

export function SetupGuide({ snap }: { snap: WorkspaceSnapshot | null }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("vidmind_guide_dismissed");
    if (saved === "true") setDismissed(true);
  }, []);

  const steps: GuideStep[] = [
    {
      id: "video",
      title: "1. Summarize Any YouTube Video",
      whatItDoes:
        "Paste a YouTube link and pick your exact output focus (Summary Only, Action Steps, Definitions, or Chapters) so you get only what you asked for.",
      href: "/workspace",
      cta: "Open Workspace",
      icon: Video,
      done: (snap?.videos.length || 0) > 0,
    },
    {
      id: "course",
      title: "2. Build an AI Study Course",
      whatItDoes:
        "Turn long 3–50h tutorials into structured modules, realistic daily schedules, missed-day recovery, and a live AI Personal Tutor.",
      href: "/courses",
      cta: "Open Course Architect",
      icon: GraduationCap,
      done: (snap?.courses.length || 0) > 0,
    },
    {
      id: "notes",
      title: "3. Save Notes, Quizzes & Bookmarks",
      whatItDoes:
        "Generate Markdown notes, spaced-repetition flashcards, and interactive React Flow mind maps stored in your Knowledge Library.",
      href: "/library",
      cta: "Open Library",
      icon: FileText,
      done: (snap?.notes.length || 0) > 0 || (snap?.quizAttempts.length || 0) > 0,
    },
    {
      id: "research",
      title: "4. Compare Multiple Videos",
      whatItDoes:
        "Select 2 or more processed videos to find overlapping concepts, unique insights, and beginner recommendations.",
      href: "/research",
      cta: "Open Research Lab",
      icon: Compass,
      done: (snap?.videos.length || 0) >= 2,
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  const pct = Math.round((completed / steps.length) * 100);

  if (dismissed) {
    return (
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setDismissed(false);
            window.localStorage.setItem("vidmind_guide_dismissed", "false");
          }}
        >
          <HelpCircle className="w-3.5 h-3.5 text-cyan-300" /> Show Setup Guide ({completed}/{steps.length})
        </Button>
      </div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
      >
        <Card className="border-cyan-400/30 bg-gradient-to-br from-[#151d34] via-[#111728] to-[#0d1220] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge tone="cyan">
                  <Sparkles className="w-3 h-3" /> Interactive Setup Guide
                </Badge>
                <span className="text-xs font-mono text-emerald-300">
                  {completed}/{steps.length} completed ({pct}%)
                </span>
              </div>
              <h2 className="text-lg font-bold text-white">
                How VidMind AI Works — Step-by-Step Feature Guide
              </h2>
            </div>

            <button
              type="button"
              onClick={() => {
                setDismissed(true);
                window.localStorage.setItem("vidmind_guide_dismissed", "true");
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
              title="Minimize Setup Guide"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="w-full h-2 rounded-full bg-slate-800/80 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  whileHover={{ y: -2 }}
                  className={`rounded-xl p-4 border flex flex-col justify-between gap-3 transition-colors ${
                    step.done
                      ? "bg-emerald-500/10 border-emerald-400/35"
                      : "bg-[#090d16]/85 border-white/10 hover:border-indigo-400/45"
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Icon className={`w-4 h-4 ${step.done ? "text-emerald-300" : "text-cyan-300"}`} />
                      {step.done ? (
                        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        </motion.span>
                      ) : (
                        <MessageSquareText className="w-3.5 h-3.5 text-slate-500" />
                      )}
                    </div>
                    <div className="text-sm font-bold text-white">{step.title}</div>
                    <p className="text-xs text-slate-300 leading-relaxed">{step.whatItDoes}</p>
                  </div>
                  <Link href={step.href} className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-300 hover:underline">
                    {step.done ? "Revisit" : step.cta} <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
