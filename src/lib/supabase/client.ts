import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export function isSupabaseClientConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function createSupabaseBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createBrowserClient(url, anon);
}

/**
 * Start Google OAuth after verifying the provider is enabled in Supabase,
 * preventing raw 400 JSON error redirects when Google OAuth is toggled off.
 */
export async function startGoogleOAuth(nextPath = "/dashboard"): Promise<{ error?: string }> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) {
    return { error: "Configure Supabase environment variables to enable Google Sign-In." };
  }

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && anon) {
      const settingsRes = await fetch(`${url}/auth/v1/settings`, {
        headers: { apikey: anon },
      });
      if (settingsRes.ok) {
        const settings = (await settingsRes.json()) as {
          external?: { google?: boolean };
        };
        if (!settings.external?.google) {
          return {
            error:
              "Google Sign-In is not enabled in your Supabase project yet. Use Email + Password above, or enable Google under Supabase Dashboard → Authentication → Providers → Google.",
          };
        }
      }
    }
  } catch {
    // Proceed to OAuth attempt if settings pre-check is unreachable
  }

  const safeNext = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/dashboard";
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}` },
  });

  return error ? { error: error.message } : {};
}
