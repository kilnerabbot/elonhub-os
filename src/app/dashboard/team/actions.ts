"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { describeDbError, type ActionResult } from "@/lib/validate";
import type { AppRole } from "@/lib/supabase/types";

const ROLES: AppRole[] = [
  "super_admin", "director", "sales_manager", "salesperson", "project_manager",
  "employee", "finance", "support_agent", "hr", "client",
];

export async function updateRole(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const userId = formData.get("user_id");
  const role = formData.get("role");

  if (typeof userId !== "string" || typeof role !== "string") {
    return { ok: false, errors: {}, message: "Missing user or role." };
  }
  // Reject anything outside the enum before it reaches Postgres, so a bad
  // value returns a clear message instead of a raw type error. `find` rather
  // than `includes` because it narrows the type as well as validating.
  const validRole = ROLES.find((r) => r === role);
  if (!validRole) {
    return { ok: false, errors: {}, message: "Unknown role." };
  }

  const supabase = await createClient();
  // The prevent_role_escalation trigger and RLS remain the real guards. This
  // now reports what they decided rather than discarding it — previously a
  // rejected change was indistinguishable from a successful one.
  const { error, count } = await supabase
    .from("profiles")
    .update({ role: validRole }, { count: "exact" })
    .eq("id", userId);

  if (error) return { ok: false, errors: {}, message: describeDbError(error) };
  if (count === 0) {
    return {
      ok: false,
      errors: {},
      message: "That change was rejected. Only a super admin can change roles.",
    };
  }

  revalidatePath("/dashboard/team");
  return { ok: true };
}
