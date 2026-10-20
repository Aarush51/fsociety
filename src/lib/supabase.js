import { createClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

export const isSupabaseConfigured =
  Boolean(url && anonKey) &&
  !url.includes("YOUR_PROJECT_ID") &&
  !anonKey.includes("YOUR_SUPABASE_");

// The publishable/anon key is safe in the browser: every table is guarded by
// Row Level Security and writes go through server-validated RPCs.
export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export const supabaseSetupMessage =
  "Add your Supabase project URL and publishable key to .env (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).";
