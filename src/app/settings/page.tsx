"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, Download, KeyRound, Trash2, XCircle } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge, Button, Card } from "@/components/ui/primitives";
import {
  loadWorkspaceSnapshot,
  saveWorkspaceSnapshot,
} from "@/lib/storage/workspace-store";
import type { SystemHealthStatus } from "@/types/vidmind";

export default function SettingsPage() {
  const [health, setHealth] = useState<SystemHealthStatus | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data: SystemHealthStatus) => setHealth(data))
      .catch(() => null);
  }, []);

  function exportAllData() {
    const snap = loadWorkspaceSnapshot();
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vidmind-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetLocalData() {
    saveWorkspaceSnapshot({
      videos: [],
      courses: [],
      notes: [],
      bookmarks: [],
      quizAttempts: [],
      activity: [],
    });
    setMessage("Local workspace data cleared.");
  }

  return (
    <AppShell
      title="Settings & Environment Diagnostics"
      subtitle="Verify server-side API integrations, database connectivity, and export your data"
    >
      <div className="max-w-3xl space-y-6">
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-indigo-400" /> Host Environment Diagnostics
            </h2>
            <Badge tone="indigo">Admin / Deployment Info</Badge>
          </div>
          <p className="text-xs text-slate-400">
            This status panel shows which server integrations are active for this specific host
            deployment (<code className="font-mono">.env.local</code> or Vercel env vars)—it never
            exposes secrets and applies to the running app instance.
          </p>

          <div className="space-y-2.5 text-sm">
            {[
              {
                name: "Supabase Database & Authentication",
                ready: Boolean(health?.supabaseConfigured),
                vars: "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY",
              },
              {
                name: "NVIDIA NIM API",
                ready: Boolean(health?.aiProviders.nvidia),
                vars: "NVIDIA_API_KEY, NVIDIA_MODEL",
              },
              {
                name: "Google Gemini API",
                ready: Boolean(health?.aiProviders.gemini),
                vars: "GEMINI_API_KEY",
              },
              {
                name: "OpenAI API",
                ready: Boolean(health?.aiProviders.openai),
                vars: "OPENAI_API_KEY",
              },
              {
                name: "YouTube Data API v3 (Optional)",
                ready: Boolean(health?.youtubeApiConfigured),
                vars: "YOUTUBE_API_KEY",
              },
            ].map((row) => (
              <div
                key={row.name}
                className="flex items-center justify-between rounded-xl bg-[#0b101b] border border-slate-800 p-3.5"
              >
                <div>
                  <div className="font-medium text-white">{row.name}</div>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">{row.vars}</div>
                </div>
                {row.ready ? (
                  <Badge tone="emerald">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Configured
                  </Badge>
                ) : (
                  <Badge tone="amber">
                    <XCircle className="w-3.5 h-3.5" /> Not Set
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className="font-semibold text-white">Data Management</h2>
          {message && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-300">
              {message}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={exportAllData}>
              <Download className="w-4 h-4" /> Export Workspace JSON
            </Button>
            <Button variant="danger" onClick={resetLocalData}>
              <Trash2 className="w-4 h-4" /> Clear Local Workspace
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
