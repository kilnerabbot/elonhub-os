import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client.
 *
 * DANGER: this key bypasses Row Level Security on every table. Every policy in
 * 0002_rls.sql and 0005 is inert for requests made with it. Rules for touching
 * this file:
 *
 *   1. Never import it from a client component, or from any module a client
 *      component imports. The key would end up in the browser bundle.
 *   2. Use it only for operations the anon key genuinely cannot perform —
 *      currently just auth.admin user creation.
 *   3. Never widen it into a general-purpose "admin can do anything" client.
 *      Ordinary reads and writes go through the request-scoped client so RLS
 *      still applies.
 *
 * The env var is deliberately NOT prefixed NEXT_PUBLIC_, so Next will not
 * inline it into client bundles even by accident.
 */
export function createAdminClient() {
  // Belt and braces: if this ever gets pulled into a browser bundle, fail
  // loudly rather than shipping a key that reads the whole database.
  if (typeof window !== "undefined") {
    throw new Error("The service-role client must never run in the browser.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Returns null rather than throwing so callers can explain what is missing
  // instead of rendering a crash.
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
