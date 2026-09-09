"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { canInviteMember } from "@/lib/permissions";
import { Validator, describeDbError, field, type ActionResult } from "@/lib/validate";
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

  if (error) return { ok: false, errors: {}, message: describeDbError(error, "updateRole.update") };
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

/**
 * Invite someone to the workspace.
 *
 * Records the address and the role they should hold. handle_new_user reads it
 * when they sign up, so they arrive already holding that role rather than
 * landing as an employee and waiting to be promoted.
 */
export async function inviteMember(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canInviteMember(session.role)) {
    return {
      ok: false,
      errors: {},
      message: "Only a super admin can invite team members.",
    };
  }

  const v = new Validator(formData);
  const email = v.optionalEmail("email", "Email");
  const fullName = v.optional("full_name", "Full name", 120);
  if (!email) {
    v.errors.email = v.errors.email ?? "An email address is required.";
  }
  const role = v.choice("role", "Role", ROLES, "employee");
  if (!v.ok) return v.fail();

  const supabase = await createClient();

  // No "are they already on the team" check: profiles carries no email column
  // — addresses live in auth.users, which is not readable without the
  // service_role key. Signing up with an address that already has an account
  // fails at the auth layer anyway, so the gap is cosmetic rather than a hole.
  const { error } = await supabase.from("invitations").insert({
    org_id: session.orgId,
    // Stored lowercase so the unique index and the trigger's lookup agree
    // regardless of how it was typed.
    email: email!.toLowerCase(),
    full_name: fullName,
    role,
    invited_by: session.userId,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, errors: { email: "That address has already been invited." } };
    }
    return { ok: false, errors: {}, message: describeDbError(error, "inviteMember.insert") };
  }

  revalidatePath("/dashboard/team");
  return { ok: true };
}

/** Withdraw a pending invitation. */
export async function revokeInvitation(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canInviteMember(session.role)) return;

  const id = field(formData, "invitation_id");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("invitations").delete().eq("id", id);

  revalidatePath("/dashboard/team");
}
