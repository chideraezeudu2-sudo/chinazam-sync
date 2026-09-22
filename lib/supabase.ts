import { createClient } from "@supabase/supabase-js";

// Server-side only. Uses the service role key so API routes can read/write
// connection_settings (which holds API keys) - never expose this key to the browser.
export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
