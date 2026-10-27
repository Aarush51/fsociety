import { createClient } from "@supabase/supabase-js";

// Defaults point at this project's live backend. The publishable key is public
// by design, so it is safe to ship; set the VITE_SUPABASE_* variables in .env
// to point the site at a different project.
const DEFAULT_URL = "https://rmqhhcfiqmlufhhfvewp.supabase.co";
const DEFAULT_ANON_KEY = "sb_publishable_DHIYgyWigTi599NtcniymQ_GScuR-YP";

const url = (import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL).trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY).trim();

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
