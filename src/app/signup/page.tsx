"use client";

import React, { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Lock, Mail, Sparkles, User } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui/primitives";
import {
  createSupabaseBrowserClient,
  isSupabaseClientConfigured,
  startGoogleOAuth,
} from "@/lib/supabase/client";

export default function SignupPage() {
  const configured = isSupabaseClientConfigured();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase credentials are not configured in .env.local.");
      return;
    }
    setLoading(true);
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });
    setLoading(false);
    if (err) {
      if (err.message.toLowerCase().includes("already registered")) {
        setError("An account with this email already exists. Use Sign In instead.");
      } else {
        setError(err.message);
      }
    } else if (data.session) {
      setMessage("Account created and signed in! Opening your dashboard...");
      window.location.href = "/dashboard";
    } else {
      setMessage(
        `Verification link sent! Check your inbox and open the confirmation link to activate your account on ${window.location.origin}.`
      );
    }
  }

  async function handleGoogleSignup() {
    setError("");
    setMessage("");
    const res = await startGoogleOAuth("/dashboard");
    if (res.error) setError(res.error);
  }

  return (
    <div className="min-h-screen vm-grid-bg flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-white">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            VIDMIND AI
          </Link>
          <Badge tone={configured ? "emerald" : "amber"}>
            {configured ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" /> Supabase Ready
              </>
            ) : (
              "Config Required"
            )}
          </Badge>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-white">Create your account</h1>
          <p className="text-sm text-slate-400 mt-1">
            Build personalized AI courses and save your knowledge library.
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-500/15 border border-rose-400/40 p-3 text-xs text-rose-200">
            {error}
          </div>
        )}
        {message && (
          <div className="rounded-xl bg-emerald-500/15 border border-emerald-400/40 p-3 text-xs text-emerald-200">
            {message}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-200">Full Name</label>
            <div className="flex items-center gap-2.5 rounded-xl bg-[#0a0e18] border border-white/15 px-3.5 py-3">
              <User className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Akarsh Sahu"
                className="bg-transparent text-sm text-white flex-1 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-200">Email</label>
            <div className="flex items-center gap-2.5 rounded-xl bg-[#0a0e18] border border-white/15 px-3.5 py-3">
              <Mail className="w-4 h-4 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="bg-transparent text-sm text-white flex-1 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-200">Password</label>
            <div className="flex items-center gap-2.5 rounded-xl bg-[#0a0e18] border border-white/15 px-3.5 py-3">
              <Lock className="w-4 h-4 text-slate-400" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="bg-transparent text-sm text-white flex-1 focus:outline-none"
              />
            </div>
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </Button>
        </form>

        <Button variant="secondary" size="md" className="w-full" onClick={handleGoogleSignup}>
          Continue with Google
        </Button>

        <div className="flex items-center justify-between text-xs text-slate-300 pt-2 border-t border-white/10">
          <Link href="/login" className="text-indigo-300 font-semibold hover:underline">
            Already have an account? Sign in
          </Link>
          <Link href="/workspace" className="text-cyan-300 hover:underline">
            Open Workspace →
          </Link>
        </div>
      </Card>
    </div>
  );
}
