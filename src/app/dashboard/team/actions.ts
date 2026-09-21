"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canInviteMember, canResetPassword } from "@/lib/permissions";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
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
    // 23001 is the constraint trigger from 0013 refusing to let the last
    // super admin be demoted. describeDbError maps codes to its own wording
    // and has no entry for this one, so it is named here where the context is
    // known.
    if (error.code === "23001") {
      describeDbError(error, "updateRole.update");
      return {
        ok: false,
        errors: {},
        message:
          "That would leave the organisation with no super admin. Promote someone else first.",
      };
    }
    // 42703 is a schema fault, not a permission one: set_updated_at is
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

/**
 * Set another member's password.
 *
 * There is no self-service reset in this app, so without this a forgotten
 * password means a trip to the Supabase dashboard. It is also the most
 * dangerous action in the product: it goes through the service-role key, which
 * bypasses every RLS policy, and it hands over an account outright.
 *
 * Every guard below is load-bearing in a way the rest of the app's checks are
 * not — for ordinary writes the database gets the final say, and here it gets
 * no say at all.
 *
 * IT DOES NOT END THE TARGET'S SESSIONS. Supabase's admin API can only end a
 * session it holds the JWT for; there is no revoke-by-user-id, and deleting
 * the auth user would cascade their profile away. So for an account that is
 * already compromised this buys very little: the intruder's access token stays
 * valid until it expires, and their refresh token keeps working. The only
 * instant, complete revocation is rotating the project JWT secret, which signs
 * everybody out. The form says so.
 */
export async function resetMemberPassword(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canResetPassword(session.role)) {
    return { ok: false, errors: {}, message: "Only a super admin can set someone's password." };
  }

  const userId = formData.get("user_id");
  if (typeof userId !== "string" || !userId) {
    return { ok: false, errors: {}, message: "Missing user." };
  }

  const v = new Validator(formData);
  // The caller's OWN password, as a step-up challenge. A stolen super_admin
  // session is otherwise a credential-harvesting tool: every colleague's
  // password reset one row at a time, with nothing asked at any point. This is
  // the same check changePassword makes, for the same reason.
  const actorPassword = v.password("actor_password", "Your password", 1);
  const password = v.password("password", "Password");
  const confirm = v.password("confirm_password", "Confirmation", 1);
  if (!v.ok) return v.fail();
  if (password !== confirm) {
    return { ok: false, errors: { confirm_password: "The two passwords do not match." } };
  }

  // Membership is proved with the REQUEST-SCOPED client, before the
  // service-role client exists. profiles_select is org-scoped, so a target
  // outside the caller's organisation does not come back.
  //
  // org_id is compared here as well rather than left entirely to the policy.
  // profiles_update_self and profiles_delete have no org predicate, and anyone
  // debugging with RLS disabled would silently turn this guard into a no-op
  // while the service-role write below carried on regardless.
  const supabase = await createClient();
  const { data: target, error: lookupError } = await supabase
    .from("profiles")
    .select("id, full_name, org_id")
    .eq("id", userId)
    .maybeSingle();

  if (lookupError) {
    // 22P02 is a malformed uuid, which also means nothing unparseable can
    // reach the admin API's URL path below.
    return { ok: false, errors: {}, message: describeDbError(lookupError, "resetPassword.lookup") };
  }
  if (!target || target.org_id !== session.orgId) {
    return { ok: false, errors: {}, message: "That person is not in your organisation." };
  }

  // Compared against the id POSTGRES returned, never the raw form value.
  //
  // Postgres accepts a uuid in upper case, in braces, or without dashes, and
  // normalises all of them; GoTrue's parser is just as forgiving. A string
  // comparison against the submitted text therefore misses when the same uuid
  // arrives in a different shape, and the check would pass while every later
  // step resolved to the caller themselves.
  //
  // That matters because the account screen verifies the CURRENT password
  // before changing it, precisely so a hijacked live session cannot lock the
  // real owner out. This path proves nothing about the target, so it must not
  // become a way to change your own password without that check.
  if (target.id === session.userId) {
    return {
      ok: false,
      errors: {},
      message: "Change your own password from Your account, where the current one is checked.",
    };
  }

  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor?.email) redirect("/login");

  // Verified on a throwaway client that persists nothing. The request-scoped
  // client would issue a fresh session and rewrite the auth cookies as a side
  // effect of a check that is meant to be read-only.
  const verifier = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { error: verifyError } = await verifier.auth.signInWithPassword({
    email: actor.email,
    password: actorPassword,
  });
  if (verifyError) {
    return { ok: false, errors: { actor_password: "That is not your password." } };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false,
      errors: {},
      message:
        "Setting a password needs SUPABASE_SERVICE_ROLE_KEY set in the Vercel environment. See README.",
    };
  }

  const { error: authError } = await admin.auth.admin.updateUserById(target.id, { password });

  if (authError) {
    // Never log the password, and never echo it back in an error.
    console.error("[auth] resetMemberPassword", {
      status: authError.status,
      message: authError.message,
      target: target.id,
      actor: session.userId,
    });
    return { ok: false, errors: {}, message: authError.message };
  }

  // auth.users carries none of the audit triggers from 0001_init.sql — they
  // are all on public tables — so without this there is no record anywhere
  // that one person took over another's account. Written with the service-role
  // client because audit_log has no insert policy: it is normally only ever
  // written by SECURITY DEFINER triggers, and giving clients one would let any
  // of them forge entries.
  const { error: auditError } = await admin.from("audit_log").insert({
    org_id: session.orgId,
    actor_id: session.userId,
    table_name: "auth.users",
    record_id: target.id,
    action: "update",
    // The password never goes near this row, in either column.
    before: null,
    after: { field: "password", set_by_admin: true },
  });

  // A failed audit write must not be reported as a failed password change —
  // the password HAS changed by this point, and saying otherwise would send
  // the administrator to try again against credentials that already moved.
  // Logged under its own distinct prefix so the one case where a credential
  // takeover went unrecorded is greppable rather than buried among [db] noise.
  if (auditError) {
    console.error("[audit] MISSING password-reset record", {
      target: target.id,
      actor: session.userId,
      code: auditError.code,
      message: auditError.message,
    });
  }

  revalidatePath("/dashboard/team");
  return { ok: true };
}
