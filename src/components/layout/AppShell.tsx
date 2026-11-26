"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Command,
  Compass,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  Menu,
  Moon,
  Search,
  Settings,
  Sparkles,
  Sun,
  Video,
  X,
} from "lucide-react";
import { cn } from "@/components/ui/primitives";
import { loadWorkspaceSnapshot } from "@/lib/storage/workspace-store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { SystemHealthStatus } from "@/types/vidmind";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, hint: "Overview & Analytics" },
  { href: "/workspace", label: "Video Intelligence", icon: Video, hint: "Summarize, Chat & Notes" },
  { href: "/courses", label: "Course Architect", icon: GraduationCap, hint: "Curriculum & Planner" },
  { href: "/research", label: "Research Lab", icon: Compass, hint: "Compare Videos" },
  { href: "/library", label: "Knowledge Library", icon: FolderKanban, hint: "Saved Notes & Graph" },
  { href: "/settings", label: "Settings", icon: Settings, hint: "API Status & Export" },
];

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const [health, setHealth] = useState<SystemHealthStatus | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [lightMode, setLightMode] = useState(false);
  const [themeWave, setThemeWave] = useState<{ active: boolean; toLight: boolean }>({
    active: false,
    toLight: false,
  });

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("vidmind_theme");
    if (savedTheme === "light") {
      document.documentElement.classList.add("light");
      setLightMode(true);
    }

    fetch("/api/health")
      .then((r) => r.json())
      .then((data: SystemHealthStatus) => setHealth(data))
      .catch(() => null);

    const supabase = createSupabaseBrowserClient();
    if (supabase) {
      supabase.auth
        .getUser()
        .then(({ data }) => setUserEmail(data.user?.email ?? null))
        .catch(() => null);
    }
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      } else if (e.key === "Escape") {
        setCmdOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function toggleTheme() {
    const next = !lightMode;
    setThemeWave({ active: true, toLight: next });
    setTimeout(() => {
      setLightMode(next);
      document.documentElement.classList.toggle("light", next);
      window.localStorage.setItem("vidmind_theme", next ? "light" : "dark");
    }, 180);
    setTimeout(() => {
      setThemeWave((prev) => ({ ...prev, active: false }));
    }, 620);
  }

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    setUserEmail(null);
    router.push("/login");
  }

  const snap = typeof window !== "undefined" && cmdOpen ? loadWorkspaceSnapshot() : null;
  const q = cmdQuery.trim().toLowerCase();
  const isYouTubeUrl = /youtube\.com|youtu\.be/i.test(cmdQuery.trim());

  const filteredNav = NAV_ITEMS.filter(
    (n) => !q || n.label.toLowerCase().includes(q) || n.hint.toLowerCase().includes(q)
  );
  const filteredVideos = (snap?.videos || [])
    .filter((v) => !q || v.video.title.toLowerCase().includes(q))
    .slice(0, 4);

  return (
    <div className="min-h-screen vm-grid-bg flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-72 flex-col border-r border-white/10 bg-[#0b0e17]/95 backdrop-blur-xl px-4 py-6 sticky top-0 h-screen">
        <Link href="/" className="flex items-center gap-3 px-2 mb-6 group">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-400 flex items-center justify-center shadow-[0_8px_24px_-4px_rgba(99,102,241,0.85)] group-hover:scale-105 transition-transform">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-base font-bold tracking-tight text-white leading-none">
              VIDMIND <span className="text-cyan-300">AI</span>
            </div>
            <div className="text-xs text-slate-400 mt-1">Video Knowledge Studio</div>
          </div>
        </Link>

        {/* Quick Search / Paste URL Trigger */}
        <button
          type="button"
          onClick={() => setCmdOpen(true)}
          className="mb-6 flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl bg-[#151c2e] hover:bg-[#1c253d] border border-white/10 text-xs text-slate-300 cursor-pointer transition-colors"
        >
          <span className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-cyan-400" /> Quick jump or paste URL
          </span>
          <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-200 border border-white/15">
            Ctrl K
          </kbd>
        </button>

        <nav className="space-y-1.5 flex-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold transition-colors",
                  active
                    ? "text-white"
                    : "text-slate-300 hover:text-white hover:bg-white/[0.06]"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="activeNavPill"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-500/25 via-violet-500/15 to-cyan-500/10 border border-indigo-400/45 shadow-sm"
                  />
                )}
                <Icon className={cn("relative z-10 w-4 h-4 shrink-0", active ? "text-cyan-300" : "text-slate-400")} />
                <div className="relative z-10 min-w-0">
                  <div className="truncate leading-tight">{item.label}</div>
                  <div className="text-[11px] font-normal text-slate-400 truncate mt-0.5">
                    {item.hint}
                  </div>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-4 border-t border-white/10 space-y-3">
          <div className="rounded-xl bg-[#13192b] border border-white/10 p-3.5 text-xs space-y-2">
            <div className="flex items-center justify-between text-white font-semibold">
              <span>AI &amp; Auth Status</span>
              <span className="inline-flex items-center gap-1.5 text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Ready
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>AI Engine</span>
              <span className="text-cyan-300 font-mono uppercase">
                {health ? "VidMind AI" : "..."}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Database</span>
              <span className={health?.supabaseConfigured ? "text-emerald-400" : "text-amber-300"}>
                {health?.supabaseConfigured ? "Supabase Live" : "Local Studio"}
              </span>
            </div>
          </div>

          {userEmail ? (
            <div className="space-y-1.5">
              <div className="px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/35 text-xs text-emerald-200 truncate">
                {userEmail}
              </div>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-semibold bg-white/[0.06] hover:bg-rose-500/20 text-slate-200 border border-white/10 transition-colors cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-semibold bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-100 border border-indigo-400/40 transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5" /> Sign In / Account
            </Link>
          )}
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative w-72 bg-[#0b0e17] border-r border-white/10 p-5 flex flex-col z-10">
            <div className="flex items-center justify-between mb-6">
              <span className="font-bold text-white">VIDMIND AI</span>
              <button onClick={() => setMobileOpen(false)} className="text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="space-y-1.5">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold",
                      active ? "bg-indigo-500/25 text-white" : "text-slate-300"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#080a10]/85 backdrop-blur-xl px-4 sm:px-8 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-xl border border-white/15 text-slate-200"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
                {title}
              </h1>
              {subtitle && (
                <p className="text-xs sm:text-sm text-slate-400 truncate mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <motion.button
              type="button"
              onClick={toggleTheme}
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.04 }}
              transition={{ type: "spring", stiffness: 420, damping: 20 }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-xs font-semibold text-slate-100 cursor-pointer"
              title="Toggle Dark / Light Theme"
            >
              <AnimatePresence mode="wait">
                <motion.span
                  key={lightMode ? "moon" : "sun"}
                  initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.22 }}
                  className="inline-flex items-center gap-1.5"
                >
                  {lightMode ? (
                    <>
                      <Moon className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Dark Mode</span>
                    </>
                  ) : (
                    <>
                      <Sun className="w-3.5 h-3.5 text-amber-300" />
                      <span>Light Mode</span>
                    </>
                  )}
                </motion.span>
              </AnimatePresence>
            </motion.button>
            <button
              type="button"
              onClick={() => setCmdOpen(true)}
              className="lg:hidden inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-white/[0.06] border border-white/10 text-xs text-slate-200"
            >
              <Command className="w-3.5 h-3.5" />
            </button>
            {actions}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        </main>
      </div>

      {/* Animated Theme Switch Ripple Wave */}
      <AnimatePresence>
        {themeWave.active && (
          <motion.div
            initial={{ clipPath: "circle(0% at 92% 4%)", opacity: 0.9 }}
            animate={{ clipPath: "circle(150% at 92% 4%)", opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className={`fixed inset-0 z-[100] pointer-events-none ${
              themeWave.toLight
                ? "bg-gradient-to-br from-slate-100 via-cyan-100 to-indigo-100"
                : "bg-gradient-to-br from-[#080a10] via-indigo-950 to-slate-950"
            }`}
          />
        )}
      </AnimatePresence>

      {/* Global Command Palette */}
      {cmdOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-start justify-center pt-20 p-4"
          onClick={() => setCmdOpen(false)}
        >
          <div className="w-full max-w-xl vm-glass rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/10">
              <Search className="w-4 h-4 text-cyan-400 shrink-0" />
              <input
                autoFocus
                type="text"
                value={cmdQuery}
                onChange={(e) => setCmdQuery(e.target.value)}
                placeholder="Search pages, saved videos, or paste a YouTube URL..."
                className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-400 focus:outline-none"
              />
              <button type="button" onClick={() => setCmdOpen(false)} className="text-xs text-slate-400 hover:text-white">
                ESC
              </button>
            </div>
            <div className="p-2.5 max-h-96 overflow-y-auto space-y-2">
              {isYouTubeUrl && (
                <div className="p-1.5 space-y-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setCmdOpen(false);
                      router.push(`/workspace?url=${encodeURIComponent(cmdQuery.trim())}`);
                    }}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-indigo-500/25 border border-indigo-400/40 text-sm text-white cursor-pointer"
                  >
                    <span>Summarize in Video Intelligence</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCmdOpen(false);
                      router.push(`/courses?url=${encodeURIComponent(cmdQuery.trim())}`);
                    }}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-sm text-white cursor-pointer"
                  >
                    <span>Build Course in Course Architect</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
              <div>
                <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Navigation
                </div>
                {filteredNav.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.href}
                      type="button"
                      onClick={() => {
                        setCmdOpen(false);
                        router.push(item.href);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/[0.08] text-left cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5 text-sm font-medium text-white">
                        <Icon className="w-4 h-4 text-indigo-400" /> {item.label}
                      </span>
                      <span className="text-xs text-slate-400">{item.hint}</span>
                    </button>
                  );
                })}
              </div>
              {filteredVideos.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Recent Videos
                  </div>
                  {filteredVideos.map((v) => (
                    <button
                      key={v.video.videoId + v.video.title}
                      type="button"
                      onClick={() => {
                        setCmdOpen(false);
                        router.push(`/workspace?videoId=${encodeURIComponent(v.video.videoId)}`);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white/[0.08] text-left cursor-pointer"
                    >
                      <span className="text-sm text-slate-200 truncate">{v.video.title}</span>
                      <span className="text-xs text-slate-400 ml-2 shrink-0">{v.video.durationFormatted}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
