import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getServerConfig } from "@/lib/config";

export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  const cfg = getServerConfig();
  if (!cfg.isSupabaseConfigured) return null;

  const cookieStore = await cookies();
  return createServerClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called inside a Server Component where setting cookies is ignored.
        }
      },
    },
  });
}
