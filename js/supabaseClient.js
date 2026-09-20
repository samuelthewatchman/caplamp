// ==========================================================
// supabaseClient.js
// ----------------------------------------------------------
// Creates ONE shared connection to your Supabase project and
// exports it so every other file can `import { supabase }` and
// reuse the same connection, instead of each file creating its
// own separately.
//
// ACTION NEEDED — fill in the two lines below with YOUR
// project's own values. Find them in Supabase: Settings (gear
// icon, bottom of the left sidebar) → API.
//   - "Project URL"     → paste into SUPABASE_URL
//   - "anon public" key → paste into SUPABASE_ANON_KEY
//
// Is it safe for this key to sit in a plain JS file anyone could
// view in their browser's dev tools? Yes — on purpose. The
// "anon" key is DESIGNED to be public; by itself it doesn't grant
// access to anything. What actually protects your data is the
// Row Level Security (RLS) rules living in the database. This is
// exactly why we turned RLS on before writing any app code — the
// key being public is only safe BECAUSE RLS is doing the real
// work. (Contrast this with the "service role" key used inside
// the Edge Function — THAT one bypasses RLS entirely and must
// never appear in any file like this one.)
// ==========================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://nliylewmbervoqmrwluf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ECcz2hmYPQa6WvgDyKCvUQ_HB_HbO5m";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
