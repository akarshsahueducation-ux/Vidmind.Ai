"use client";

import React from "react";
import { motion } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}) {
  const variants = {
    primary:
      "btn-shimmer bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500 hover:brightness-110 text-white shadow-[0_8px_26px_-6px_rgba(99,102,241,0.75)] border border-indigo-300/30",
    secondary:
      "btn-shimmer bg-[#1e263d] hover:bg-[#27314f] text-white border border-white/15 hover:border-indigo-400/50",
    ghost:
      "bg-white/[0.04] hover:bg-white/[0.09] text-slate-200 hover:text-white border border-white/10",
    danger:
      "bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 border border-rose-500/40",
  };
  const sizes = {
    sm: "px-3.5 py-1.5 text-xs rounded-xl",
    md: "px-4 py-2.5 text-sm rounded-xl",
    lg: "px-6 py-3 text-base rounded-2xl",
  };

  return (
    <motion.button
      whileHover={{ y: -1.5, scale: 1.015 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 450, damping: 26 }}
      className={cn(
        "relative overflow-hidden inline-flex items-center justify-center gap-2 font-semibold transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
        variants[variant],
        sizes[size],
        className
      )}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </motion.button>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "indigo" | "cyan" | "emerald" | "amber" | "rose";
  className?: string;
}) {
  const tones = {
    neutral: "bg-slate-800/90 text-slate-200 border-white/15",
    indigo: "bg-indigo-500/20 text-indigo-200 border-indigo-400/40",
    cyan: "bg-cyan-500/20 text-cyan-200 border-cyan-400/40",
    emerald: "bg-emerald-500/20 text-emerald-200 border-emerald-400/40",
    amber: "bg-amber-500/20 text-amber-200 border-amber-400/40",
    rose: "bg-rose-500/20 text-rose-200 border-rose-400/40",
  };
  return (
    <motion.span
      initial={{ scale: 0.94, opacity: 0.8 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border",
        tones[tone],
        className
      )}
    >
      {children}
    </motion.span>
  );
}

export function Card({
  children,
  className,
  hover = false,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}) {
  const [tilt, setTilt] = React.useState({ rx: 0, ry: 0, gx: 50, gy: 50, active: false });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      onMouseMove={(e) => {
        if (!hover) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width;
        const py = (e.clientY - rect.top) / rect.height;
        setTilt({
          rx: (0.5 - py) * 8,
          ry: (px - 0.5) * 10,
          gx: px * 100,
          gy: py * 100,
          active: true,
        });
      }}
      onMouseLeave={() => {
        if (hover) setTilt({ rx: 0, ry: 0, gx: 50, gy: 50, active: false });
      }}
      style={
        hover
          ? {
              transform: `perspective(1000px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) translateZ(${tilt.active ? 6 : 0}px)`,
              transformStyle: "preserve-3d",
              backgroundImage: tilt.active
                ? `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgba(99,102,241,0.16), transparent 55%)`
                : undefined,
            }
          : undefined
      }
      className={cn(
        "vm-card p-6 transition-transform duration-200 ease-out",
        hover && "vm-card-hover",
        className
      )}
    >
      {children}
    </motion.div>
  );
}

export function ProgressRing({
  percentage,
  size = 64,
  strokeWidth = 6,
  label,
}: {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percentage));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="rgba(148,163,184,0.22)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="url(#vmRingGrad)"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="vmRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute text-xs font-bold text-white">
        {label ?? `${Math.round(clamped)}%`}
      </span>
    </div>
  );
}
