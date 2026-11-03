import { createClient } from '@supabase/supabase-js';

// The shared database is used only when both values are present (see README).
// Without them the app runs in local mode, storing everything in this browser.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isRemote = Boolean(url && key);

// The anon key is meant to be public: what each person can do is decided by the
// Row Level Security rules in supabase/schema.sql, not by hiding this key.
export const supabase = isRemote
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
