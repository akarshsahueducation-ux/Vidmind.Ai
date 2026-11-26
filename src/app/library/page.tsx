"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bookmark, Download, FileText, GraduationCap, Network, Search, Trash2, Video } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { MindMapCanvas } from "@/components/visuals/MindMapCanvas";
import {
  hydrateWorkspaceFromSupabase,
  loadWorkspaceSnapshot,
  saveWorkspaceSnapshot,
  type SavedNote,
  type WorkspaceSnapshot,
} from "@/lib/storage/workspace-store";
import type { MindMapNodeData } from "@/types/vidmind";

export default function LibraryPage() {
  const [snap, setSnap] = useState<WorkspaceSnapshot | null>(null);
  const [query, setQuery] = useState("");
  const [activeNote, setActiveNote] = useState<SavedNote | null>(null);

  useEffect(() => {
    setSnap(loadWorkspaceSnapshot());
    void hydrateWorkspaceFromSupabase().then((merged) => {
      if (merged) setSnap(merged);
    });
  }, []);

  const q = query.trim().toLowerCase();
  const videos = (snap?.videos || []).filter((v) =>
    !q ? true : v.video.title.toLowerCase().includes(q)
  );
  const notes = (snap?.notes || []).filter((n) =>
    !q ? true : n.title.toLowerCase().includes(q) || n.markdown.toLowerCase().includes(q)
  );
  const bookmarks = (snap?.bookmarks || []).filter((b) =>
    !q ? true : b.videoTitle.toLowerCase().includes(q) || b.title.toLowerCase().includes(q)
  );
  const courses = (snap?.courses || []).filter((c) =>
    !q ? true : c.title.toLowerCase().includes(q)
  );

  function deleteNote(id: string) {
    if (!snap) return;
    const next = { ...snap, notes: snap.notes.filter((n) => n.id !== id) };
    saveWorkspaceSnapshot(next);
    setSnap(next);
    if (activeNote?.id === id) setActiveNote(null);
  }

  function deleteBookmark(id: string) {
    if (!snap) return;
    const next = { ...snap, bookmarks: snap.bookmarks.filter((b) => b.id !== id) };
    saveWorkspaceSnapshot(next);
    setSnap(next);
  }

  function downloadNote(note: SavedNote) {
    const blob = new Blob([note.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${note.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const knowledgeGraphNodes: MindMapNodeData[] = useMemo(() => {
    if (!snap?.videos.length) return [];
    const nodes: MindMapNodeData[] = [
      {
        id: "root",
        label: "Your Knowledge Graph",
        category: "root",
        description: `${snap.videos.length} indexed videos`,
      },
    ];
    const seenTopics = new Set<string>();
    snap.videos.slice(0, 5).forEach((v, vi) => {
      const vidNodeId = `v-${vi}`;
      nodes.push({
        id: vidNodeId,
        label: v.video.title.slice(0, 32),
        category: "topic",
        parentId: "root",
        description: v.summary.tldr,
      });
      v.summary.topics.slice(0, 2).forEach((t, ti) => {
        if (!seenTopics.has(t)) {
          seenTopics.add(t);
          nodes.push({
            id: `c-${vi}-${ti}`,
            label: `#${t}`,
            category: "concept",
            parentId: vidNodeId,
            description: `Concept extracted from ${v.video.title}`,
          });
        }
      });
    });
    return nodes;
  }, [snap]);

  return (
    <AppShell
      title="Personal Knowledge Library & Graph"
      subtitle="Search saved videos, courses, editable Markdown notes, timestamp bookmarks & concept graphs"
    >
      <div className="space-y-6">
        <div className="flex items-center gap-2 rounded-xl bg-[#121826] border border-white/10 px-4 py-3">
          <Search className="w-4 h-4 text-cyan-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search videos, courses, notes, and bookmarks..."
            className="bg-transparent text-sm text-white flex-1 focus:outline-none"
          />
        </div>

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Network className="w-5 h-5 text-indigo-400" /> AI Knowledge Graph
            </h2>
            <Badge tone="cyan">{knowledgeGraphNodes.length} Nodes</Badge>
          </div>
          <MindMapCanvas items={knowledgeGraphNodes} />
        </Card>

        {activeNote && (
          <Card className="space-y-3 border-cyan-400/35">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white">{activeNote.title}</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => downloadNote(activeNote)}>
                  <Download className="w-3.5 h-3.5" /> Download .md
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setActiveNote(null)}>
                  Close
                </Button>
              </div>
            </div>
            <pre className="rounded-xl bg-[#070b14] border border-white/10 p-4 text-xs font-mono text-slate-200 whitespace-pre-wrap max-h-72 overflow-y-auto">
              {activeNote.markdown}
            </pre>
          </Card>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <Card className="space-y-3">
            <h3 className="font-semibold text-white text-sm flex items-center gap-2">
              <Video className="w-4 h-4 text-indigo-400" /> Videos ({videos.length})
            </h3>
            {videos.length === 0 && <p className="text-xs text-slate-400">No videos saved yet.</p>}
            {videos.map((v) => (
              <Link
                key={v.video.videoId + v.video.title}
                href={`/workspace?videoId=${encodeURIComponent(v.video.videoId)}`}
                className="block rounded-xl bg-[#0b101b] border border-white/10 p-3 text-xs hover:border-indigo-400/50"
              >
                <div className="font-medium text-white truncate">{v.video.title}</div>
                <div className="text-slate-400 mt-1">{v.video.durationFormatted}</div>
              </Link>
            ))}
          </Card>

          <Card className="space-y-3">
            <h3 className="font-semibold text-white text-sm flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-emerald-400" /> Courses ({courses.length})
            </h3>
            {courses.length === 0 && <p className="text-xs text-slate-400">No courses created yet.</p>}
            {courses.map((c) => (
              <Link
                key={c.id}
                href="/courses"
                className="block rounded-xl bg-[#0b101b] border border-white/10 p-3 text-xs hover:border-emerald-400/50"
              >
                <div className="font-medium text-white truncate">{c.title}</div>
                <div className="text-slate-400 mt-1">{c.modules.length} modules</div>
              </Link>
            ))}
          </Card>

          <Card className="space-y-3">
            <h3 className="font-semibold text-white text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-400" /> Notes ({notes.length})
            </h3>
            {notes.length === 0 && <p className="text-xs text-slate-400">Save notes from Video Intelligence.</p>}
            {notes.map((n) => (
              <div key={n.id} className="rounded-xl bg-[#0b101b] border border-white/10 p-3 text-xs space-y-2">
                <button
                  type="button"
                  onClick={() => setActiveNote(n)}
                  className="text-left font-medium text-cyan-300 hover:underline w-full truncate cursor-pointer"
                >
                  {n.title}
                </button>
                <div className="flex justify-between items-center text-slate-400">
                  <span>{n.updatedAt.slice(0, 10)}</span>
                  <button
                    type="button"
                    onClick={() => deleteNote(n.id)}
                    className="text-rose-300 hover:text-rose-200 cursor-pointer"
                    title="Delete note"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </Card>

          <Card className="space-y-3">
            <h3 className="font-semibold text-white text-sm flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-amber-400" /> Bookmarks ({bookmarks.length})
            </h3>
            {bookmarks.length === 0 && <p className="text-xs text-slate-400">Bookmark timestamps while watching.</p>}
            {bookmarks.map((b) => (
              <div key={b.id} className="rounded-xl bg-[#0b101b] border border-white/10 p-3 text-xs space-y-1.5">
                <Link
                  href={`/workspace?videoId=${encodeURIComponent(b.videoId)}&t=${Math.floor(b.startSeconds)}`}
                  className="font-mono text-indigo-300 hover:underline block truncate"
                >
                  [{b.timestamp}] {b.videoTitle}
                </Link>
                <div className="flex justify-between items-center text-slate-400">
                  <span className="truncate mr-2">{b.note}</span>
                  <button
                    type="button"
                    onClick={() => deleteBookmark(b.id)}
                    className="text-rose-300 hover:text-rose-200 shrink-0 cursor-pointer"
                    title="Delete bookmark"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
