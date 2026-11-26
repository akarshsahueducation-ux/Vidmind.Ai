"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Sparkles } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setStatusMsg("");

    if (password.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setErrorMsg("Supabase credentials are not configured in .env.local.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setErrorMsg(error.message);
    } else {
      setStatusMsg("Password updated! Redirecting to dashboard...");
      setTimeout(() => router.push("/dashboard"), 1200);
    }
  }

  return (
    <div className="min-h-screen vm-grid-bg flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-7 space-y-5">
        <Link href="/" className="flex items-center gap-2 font-semibold text-white">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          VIDMIND AI
        </Link>

        <div>
          <h1 className="text-2xl font-bold text-white">Set a new password</h1>
          <p className="text-sm text-slate-400 mt-1">
            Choose a strong password for your VidMind AI account.
          </p>
        </div>

        {errorMsg && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-300">
            {errorMsg}
          </div>
        )}
        {statusMsg && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-300">
            {statusMsg}
          </div>
        )}

        <form onSubmit={handleUpdate} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">New Password</label>
            <div className="flex items-center gap-2 rounded-xl bg-[#0b101b] border border-slate-800 px-3 py-2.5">
              <Lock className="w-4 h-4 text-slate-400" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-transparent text-sm text-white flex-1 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Confirm Password</label>
            <div className="flex items-center gap-2 rounded-xl bg-[#0b101b] border border-slate-800 px-3 py-2.5">
              <Lock className="w-4 h-4 text-slate-400" />
              <input
                type="password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                className="bg-transparent text-sm text-white flex-1 focus:outline-none"
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Updating..." : "Update Password"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
