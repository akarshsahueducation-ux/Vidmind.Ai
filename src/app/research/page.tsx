"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Compass, GitCompare, Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { hydrateWorkspaceFromSupabase, loadWorkspaceSnapshot } from "@/lib/storage/workspace-store";
import type { ProcessedVideoPayload } from "@/types/vidmind";

interface ComparisonResult {
  commonConcepts: string[];
  uniqueByVideo: Array<{ title: string; uniquePoints: string[] }>;
  beginnerRecommendation: string;
  synthesisSummary: string;
  engine: string;
}

export default function ResearchPage() {
  const [videos, setVideos] = useState<ProcessedVideoPayload[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);

  useEffect(() => {
    const snap = loadWorkspaceSnapshot();
    setVideos(snap.videos);
    setSelectedIds(snap.videos.slice(0, 2).map((v) => v.video.videoId));
    void hydrateWorkspaceFromSupabase().then((merged) => {
      if (merged && merged.videos.length > 0) {
        setVideos(merged.videos);
        setSelectedIds((prev) =>
          prev.length >= 2 ? prev : merged.videos.slice(0, 2).map((v) => v.video.videoId)
        );
      }
    });
  }, []);

  function toggleVideo(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function runComparison() {
    const chosen = videos.filter((v) => selectedIds.includes(v.video.videoId));
    if (chosen.length < 2) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/research/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videos: chosen.map((c) => ({
            title: c.video.title,
            durationFormatted: c.video.durationFormatted,
            topics: c.summary.topics,
            tldr: c.summary.tldr,
          })),
        }),
      });
      const json = (await res.json()) as ComparisonResult & { error?: string };
      if (!res.ok) throw new Error(json.error || "Comparison failed.");
      setComparison(json);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Comparison failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell
      title="Multi-Video Research & Comparison"
      subtitle="Compare explanations, detect overlapping concepts, and synthesize across multiple videos"
    >
      <div className="space-y-6">
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Compass className="w-5 h-5 text-cyan-400" /> Select 2+ Videos to Compare
            </h2>
            <Button
              disabled={selectedIds.length < 2 || loading}
              onClick={() => void runComparison()}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitCompare className="w-4 h-4" />}
              Compare Selected ({selectedIds.length})
            </Button>
          </div>
          {errorMsg && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/35 p-3 text-xs text-rose-300">
              {errorMsg}
            </div>
          )}

          {videos.length < 2 ? (
            <div className="text-sm text-slate-400 py-6 text-center space-y-2">
              <p>Process at least 2 YouTube videos to unlock Multi-Video Comparison.</p>
              <Link href="/workspace">
                <Button size="sm" variant="secondary">Open Video Intelligence →</Button>
              </Link>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {videos.map((v) => {
                const checked = selectedIds.includes(v.video.videoId);
                return (
                  <button
                    key={v.video.videoId}
                    type="button"
                    onClick={() => toggleVideo(v.video.videoId)}
                    className={`text-left rounded-xl p-3.5 border cursor-pointer transition-colors ${
                      checked
                        ? "bg-indigo-500/15 border-indigo-500/40"
                        : "bg-[#0b101b] border-slate-800"
                    }`}
                  >
                    <div className="font-medium text-sm text-white line-clamp-2">
                      {v.video.title}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {v.video.channelName} • {v.video.durationFormatted}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {comparison && (
          <div className="space-y-5">
            <Card className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">Cross-Video Synthesis</h3>
                <Badge tone="indigo">VidMind Synthesis</Badge>
              </div>
              <p className="text-sm text-slate-300">{comparison.synthesisSummary}</p>
              <div className="rounded-xl bg-[#0b101b] border border-slate-800 p-3 text-xs text-cyan-200">
                {comparison.beginnerRecommendation}
              </div>
            </Card>

            <div className="grid md:grid-cols-2 gap-4">
              <Card className="space-y-2">
                <h3 className="font-semibold text-white text-sm">Shared Concepts</h3>
                <div className="flex flex-wrap gap-2">
                  {comparison.commonConcepts.length ? (
                    comparison.commonConcepts.map((c) => (
                      <Badge key={c} tone="emerald">#{c}</Badge>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400">No direct keyword overlap found.</span>
                  )}
                </div>
              </Card>

              <Card className="space-y-3">
                <h3 className="font-semibold text-white text-sm">Unique Coverage by Video</h3>
                {comparison.uniqueByVideo.map((u) => (
                  <div key={u.title} className="text-xs space-y-1">
                    <div className="font-medium text-indigo-300">{u.title}</div>
                    <div className="text-slate-400">
                      {u.uniquePoints.join(", ") || "Minimal unique tokens"}
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
