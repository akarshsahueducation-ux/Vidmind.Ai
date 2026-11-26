"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  Lock,
  Mail,
  MessageSquareText,
  Sparkles,
} from "lucide-react";
import { Badge, Button, Card } from "@/components/ui/primitives";
import {
  createSupabaseBrowserClient,
  isSupabaseClientConfigured,
} from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const configured = isSupabaseClientConfigured();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "auth_callback_failed") {
      setErrorMsg("Email confirmation link expired or could not be verified. Request a fresh link or sign in below.");
    }
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setStatusMsg("");

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setErrorMsg(
        "Supabase credentials are not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local."
      );
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      if (error.message.toLowerCase().includes("email not confirmed")) {
        setErrorMsg(
          "Your email is not confirmed yet. Confirm it in your desktop browser (or disable 'Confirm email' in Supabase Auth → Providers → Email)."
        );
      } else {
        setErrorMsg(error.message);
      }
    } else {
      router.push("/dashboard");
    }
  }

  async function handleForgotPassword() {
    setErrorMsg("");
    setStatusMsg("");
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setErrorMsg("Configure Supabase environment variables first to send password reset emails.");
      return;
    }
    if (!email.trim()) {
      setErrorMsg("Enter your email address first.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    if (error) setErrorMsg(error.message);
    else setStatusMsg("Password reset instructions sent to your email.");
  }

  async function handleGoogleLogin() {
    setErrorMsg("");
    setStatusMsg("");
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setErrorMsg("Configure Supabase environment variables to enable Google OAuth.");
      return;
    }

    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (url && anonKey) {
        const settingsRes = await fetch(`${url}/auth/v1/settings`, {
          headers: { apikey: anonKey },
        });
        if (settingsRes.ok) {
          const settings = (await settingsRes.json()) as {
            external?: { google?: boolean };
          };
          if (!settings.external?.google) {
            setErrorMsg(
              "Google Sign-In is not enabled in your Supabase project yet. Use Email + Password above, or enable Google under Supabase Dashboard → Authentication → Providers → Google."
            );
            return;
          }
        }
      }
    } catch {
      // Proceed to OAuth attempt if settings pre-check is unreachable
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
    });
    if (error) {
      setErrorMsg(error.message);
    }
  }

  return (
    <div className="min-h-screen vm-grid-bg flex items-center justify-center p-4 sm:p-8">
      <div className="max-w-5xl w-full grid lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Feature Showcase */}
        <Card className="lg:col-span-6 p-8 flex flex-col justify-between bg-gradient-to-br from-[#181f38] via-[#121728] to-[#0d111e] border-indigo-400/25">
          <div className="space-y-6">
            <Link href="/" className="inline-flex items-center gap-2.5 text-lg font-bold text-white">
              <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </span>
              VIDMIND AI
            </Link>

            <div className="space-y-3">
              <Badge tone="cyan">Turn Every Video Into Knowledge</Badge>
              <h2 className="text-3xl font-bold text-white leading-tight">
                Your AI Video Intelligence &amp; Course Studio
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                Sign in to save summaries, generate adaptive study courses, track progress, and chat
                across YouTube transcripts with exact timestamps.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              {[
                { icon: Sparkles, text: "Instant structured summaries & chapters" },
                { icon: MessageSquareText, text: "RAG Video Chat with clickable [MM:SS] citations" },
                { icon: GraduationCap, text: "AI Course Architect with daily study plans" },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.text} className="flex items-center gap-3 rounded-xl bg-white/[0.05] border border-white/10 p-3.5 text-sm text-slate-100">
                    <Icon className="w-4 h-4 text-cyan-300 shrink-0" />
                    <span>{item.text}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-6 text-xs text-slate-400 flex items-center justify-between border-t border-white/10 mt-6">
            <span>VidMind AI Knowledge Studio</span>
            <Link href="/workspace" className="text-cyan-300 hover:underline inline-flex items-center gap-1">
              Explore Workspace <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </Card>

        {/* Right Auth Form */}
        <Card className="lg:col-span-6 p-8 flex flex-col justify-center space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Sign in to VidMind</h1>
              <p className="text-sm text-slate-400 mt-1">Access your personalized learning workspace.</p>
            </div>
            <Badge tone={configured ? "emerald" : "amber"}>
              {configured ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Supabase Ready
                </>
              ) : (
                "Supabase Unconfigured"
              )}
            </Badge>
          </div>

          {!configured && (
            <div className="rounded-xl bg-amber-500/15 border border-amber-400/35 p-3.5 text-xs text-amber-100 flex gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-300" />
              <div>
                Supabase env vars are missing. Add <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-xl bg-rose-500/15 border border-rose-400/40 p-3.5 text-xs text-rose-200 space-y-1">
              <div className="font-semibold">Sign-in issue</div>
              <div>{errorMsg}</div>
            </div>
          )}

          {statusMsg && (
            <div className="rounded-xl bg-emerald-500/15 border border-emerald-400/40 p-3.5 text-xs text-emerald-200">
              {statusMsg}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-200">Email Address</label>
              <div className="flex items-center gap-2.5 rounded-xl bg-[#0a0e18] border border-white/15 focus-within:border-indigo-400 px-3.5 py-3">
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
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-200">Password</label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs text-cyan-300 hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <div className="flex items-center gap-2.5 rounded-xl bg-[#0a0e18] border border-white/15 focus-within:border-indigo-400 px-3.5 py-3">
                <Lock className="w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-transparent text-sm text-white flex-1 focus:outline-none"
                />
              </div>
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <Button variant="secondary" size="md" className="w-full" onClick={handleGoogleLogin}>
            Continue with Google
          </Button>

          <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 text-[11px] text-slate-300">
            <strong>Tip:</strong> Signing up locally? Open the verification email link on{" "}
            <strong>this PC</strong> (not your phone, since <code className="font-mono">127.0.0.1</code>{" "}
            is local), or turn off <em>Confirm email</em> in Supabase Auth settings for instant login.
          </div>

          <div className="flex items-center justify-between text-xs text-slate-300 pt-2 border-t border-white/10">
            <span>
              New here?{" "}
              <Link href="/signup" className="text-indigo-300 font-semibold hover:underline">
                Create free account
              </Link>
            </span>
            <Link href="/dashboard" className="text-cyan-300 hover:underline">
              Skip to Dashboard →
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
