"use client";

import React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ActivityEntry } from "@/lib/storage/workspace-store";

export function StudyActivityChart({ data }: { data: ActivityEntry[] }) {
  const chartData =
    data.length > 0
      ? data.slice(-14).map((d) => ({ date: d.dateISO.slice(5), minutes: d.minutes }))
      : [{ date: "Today", minutes: 0 }];

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="studyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.5} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
          <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
          <YAxis stroke="#64748b" fontSize={11} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0d111b",
              borderColor: "rgba(148,163,184,0.2)",
              borderRadius: "10px",
              color: "#f1f5f9",
              fontSize: "12px",
            }}
          />
          <Area
            type="monotone"
            dataKey="minutes"
            stroke="#6366f1"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#studyGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StudyHeatmap({ activity }: { activity: ActivityEntry[] }) {
  const map = new Map(activity.map((a) => [a.dateISO, a.minutes]));
  const cells = Array.from({ length: 28 }, (_, idx) => {
    const d = new Date();
    d.setDate(d.getDate() - (27 - idx));
    const iso = d.toISOString().slice(0, 10);
    const mins = map.get(iso) || 0;
    return { iso, mins };
  });

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((cell) => {
          const level =
            cell.mins === 0
              ? "bg-slate-800/70"
              : cell.mins < 20
                ? "bg-indigo-900/80"
                : cell.mins < 45
                  ? "bg-indigo-600/80"
                  : "bg-cyan-400";
          return (
            <div
              key={cell.iso}
              title={`${cell.iso}: ${cell.mins} mins`}
              className={`h-6 rounded-md border border-slate-700/40 ${level} transition-colors`}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
        <span>Past 28 days</span>
        <span>Recorded study activity</span>
      </div>
    </div>
  );
}
