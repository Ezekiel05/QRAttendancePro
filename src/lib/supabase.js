import { createClient } from '@supabase/supabase-js';
import { classifyKey } from '../utils/keyCheck.js';
import { normalizeSupabaseUrl } from '../utils/supabaseUrl.js';

// The shared database is used only when a URL and a key are present (see README).
// Without them the app runs in local mode, storing everything in this browser.
// The URL may be pasted with a trailing path (e.g. ".../rest/v1/"); only the origin is used.
const url = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
// Supabase's new "publishable" key replaces the old "anon" key; either name works here.
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

const kind = classifyKey(key);

export const supabaseHost = url ? new URL(url).host : '';

// A secret key must never be shipped in a web page: refuse it and say so.
export const keyProblem =
  kind === 'secret'
    ? 'The Supabase key in this build is a SECRET key, so the shared database is switched off. Use the publishable (or anon) key instead, and rotate the secret key in Supabase because it is now exposed.'
    : '';

export const isRemote = Boolean(url && key) && kind !== 'secret';

// The publishable/anon key is meant to be public: what each person can do is decided by
// the Row Level Security rules in supabase/schema.sql, not by hiding this key.
export const supabase = isRemote
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
