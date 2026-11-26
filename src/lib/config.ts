import type { SystemHealthStatus } from "@/types/vidmind";

export function getServerConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const geminiKey = process.env.GEMINI_API_KEY || "";
  const openaiKey = process.env.OPENAI_API_KEY || "";
  const nvidiaKey = process.env.NVIDIA_API_KEY || "";
  const youtubeApiKey = process.env.YOUTUBE_API_KEY || "";
  const aiProvider = (process.env.AI_PROVIDER || "auto").toLowerCase();

  return {
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceKey,
    geminiKey,
    geminiModel: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
    openaiKey,
    openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
    nvidiaKey,
    nvidiaModel: process.env.NVIDIA_MODEL || "nvidia/nemotron-3.5-bolt-e4b",
    youtubeApiKey,
    aiProvider,
    isSupabaseConfigured: Boolean(supabaseUrl && supabaseAnonKey),
  };
}

export function getPublicHealthStatus(): SystemHealthStatus {
  const cfg = getServerConfig();
  const hasGemini = Boolean(cfg.geminiKey);
  const hasOpenai = Boolean(cfg.openaiKey);
  const hasNvidia = Boolean(cfg.nvidiaKey);

  let activeDefault: "gemini" | "openai" | "nvidia" | "local-nlp" = "local-nlp";
  if (cfg.aiProvider === "nvidia" && hasNvidia) activeDefault = "nvidia";
  else if (cfg.aiProvider === "gemini" && hasGemini) activeDefault = "gemini";
  else if (cfg.aiProvider === "openai" && hasOpenai) activeDefault = "openai";
  else if (hasNvidia) activeDefault = "nvidia";
  else if (hasGemini) activeDefault = "gemini";
  else if (hasOpenai) activeDefault = "openai";

  return {
    status: "ok",
    supabaseConfigured: cfg.isSupabaseConfigured,
    aiProviders: {
      gemini: hasGemini,
      openai: hasOpenai,
      nvidia: hasNvidia,
      activeDefault,
    },
    youtubeApiConfigured: Boolean(cfg.youtubeApiKey),
  };
}
