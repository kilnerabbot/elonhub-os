"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canInviteMember } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
  // This action was relying on RLS alone. That is the right call for the
  // row-scoped actions elsewhere, where only the database knows whether the
  // caller owns the row — but changing a role is a flat role check that
  // permissions.ts already encodes, and addMember and revokeInvitation in this
  // same file both gate on it. Leaving the gate out made this the only write
  // in the app with a single control behind it.
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canInviteMember(session.role)) {
    return { ok: false, errors: {}, message: "Only a super admin can change roles." };
  }

  const userId = formData.get("user_id");
  const role = formData.get("role");

  if (typeof userId !== "string" || typeof role !== "string") {
    return { ok: false, errors: {}, message: "Missing user or role." };
  }
  // `find` rather than `includes` because it narrows the type as well as
  // validating, keeping an unknown value away from the enum column.
  const validRole = ROLES.find((r) => r === role);
  if (!validRole) {
    return { ok: false, errors: {}, message: "Unknown role." };
  }

  const supabase = await createClient();
  // The prevent_role_escalation trigger and RLS remain the real guards. This
  // reports what they decided rather than discarding it.
  //
  // The result is read back with .select() because this action needs the
  // stored role, not just a row count — see the revert check below. A count
  // would report 1 for a change the trigger quietly undid.
  const { data, error } = await supabase
    .from("profiles")
    .update({ role: validRole })
    .eq("id", userId)
    .select("id, role");

  if (error) {
    // 42703 here is a schema fault, not a permission one: set_updated_at is
    // attached to profiles but profiles has no updated_at column, so the
    // trigger raises before the row is ever written. Naming the migration
    // turns a five-character code into an instruction.
    if (error.code === "42703") {
      describeDbError(error, "updateRole.update");
      return {
        ok: false,
        errors: {},
        message:
          "Role changes are blocked by a schema fault. Apply migration 0011_profiles_updated_at.sql in the Supabase SQL editor, then try again.",
      };
    }
    return { ok: false, errors: {}, message: describeDbError(error, "updateRole.update") };
  }

  if (!data || data.length === 0) {
    return {
      ok: false,
      errors: {},
      message: "That change was rejected. Only a super admin can change roles.",
    };
  }

  // prevent_role_escalation does not raise when it refuses — it quietly puts
  // the old role back and lets the update succeed. So a row coming back is not
  // proof the role changed; the role on that row is.
  if (data[0].role !== validRole) {
    return {
      ok: false,
      errors: {},
      message: "The database refused that role change. Only a super admin can change roles.",
    };
  }

  revalidatePath("/dashboard/team");
  return { ok: true };
}

/**
 * Create a team member directly: name, email, password, role.
 *
 * Uses the service-role key, because creating an auth user is something the
 * anon key genuinely cannot do. The role is carried across by writing an
 * invitations row first and letting handle_new_user consume it, rather than
 * updating profiles.role afterwards — that reuses the one role-assignment path
 * the database already has, instead of adding a second that bypasses
 * prevent_role_escalation.
 */
export async function addMember(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canInviteMember(session.role)) {
    return { ok: false, errors: {}, message: "Only a super admin can add team members." };
  }

  const v = new Validator(formData);
  const fullName = v.required("full_name", "Full name", 120);
  const email = v.optionalEmail("email", "Email");
  const password = v.password("password", "Password");
  const role = v.choice("role", "Role", ROLES, "employee");
  if (!email) v.errors.email = v.errors.email ?? "An email address is required.";
  if (!v.ok) return v.fail();

  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false,
      errors: {},
      message:
        "Creating accounts needs SUPABASE_SERVICE_ROLE_KEY set in the Vercel environment. See README.",
    };
  }

  const normalised = email!.toLowerCase();
  const supabase = await createClient();

  // Written first so handle_new_user finds it during the insert into
  // auth.users. Cleaned up below if account creation then fails, so a failed
  // attempt does not leave a stale grant that would apply to a later signup.
  const { data: invitation, error: inviteError } = await supabase
    .from("invitations")
    .insert({
      org_id: session.orgId,
      email: normalised,
      full_name: fullName,
      role,
      invited_by: session.userId,
    })
    .select("id")
    .single();

  if (inviteError) {
    if (inviteError.code === "23505") {
      return { ok: false, errors: { email: "That address has already been added." } };
    }
    return { ok: false, errors: {}, message: describeDbError(inviteError, "addMember.invitation") };
  }

  const { error: authError } = await admin.auth.admin.createUser({
    email: normalised,
    password,
    // Confirmed on creation: an admin setting the password has already
    // established who this is, and without it the person cannot sign in until
    // they click a verification email that may never arrive.
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (authError) {
    await supabase.from("invitations").delete().eq("id", invitation.id);

    // Never log the password. Supabase reports a duplicate address as a 422.
    console.error("[auth] addMember", { status: authError.status, message: authError.message });

    if (/already/i.test(authError.message)) {
      return { ok: false, errors: { email: "An account with that address already exists." } };
    }
    return { ok: false, errors: {}, message: `Could not create the account: ${authError.message}` };
  }

  revalidatePath("/dashboard/team");
  return { ok: true };
}

/** Remove a pending grant that never got consumed. */
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
