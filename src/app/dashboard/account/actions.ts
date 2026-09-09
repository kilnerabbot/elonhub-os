"use server";

import { redirect } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Validator, type ActionResult } from "@/lib/validate";

/**
 * Change your own password.
 *
 * Supabase's updateUser({ password }) does not ask for the current one, so on
 * its own it means anyone who gets hold of a live session — a borrowed laptop,
 * a stolen cookie — can change the password and lock the real owner out. The
 * current password is verified first to close that.
 */
export async function changePassword(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const v = new Validator(formData);
  const current = v.password("current_password", "Current password", 1);
  const next = v.password("new_password", "New password");
  const confirm = v.password("confirm_password", "Confirmation", 1);
  if (!v.ok) return v.fail();

  if (next !== confirm) {
    return { ok: false, errors: { confirm_password: "The two passwords do not match." } };
  }
  if (next === current) {
    return {
      ok: false,
      errors: { new_password: "That is your current password. Choose a different one." },
    };
  }

  // Verified on a throwaway client that persists nothing. Using the
  // request-scoped client would issue a fresh session and rewrite the auth
  // cookies as a side effect of a check that is supposed to be read-only.
  const verifier = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error: verifyError } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: current,
  });

  if (verifyError) {
    // No detail beyond "wrong". The caller is already authenticated, so there
    // is nothing to enumerate, but the message should not hint at rate limits
    // or lockout state either.
    return { ok: false, errors: { current_password: "That is not your current password." } };
  }

  const { error } = await supabase.auth.updateUser({ password: next });

  if (error) {
    // Never log the password itself.
    console.error("[auth] changePassword", { status: error.status, message: error.message });
    return { ok: false, errors: {}, message: error.message };
  }

  return { ok: true };
}
