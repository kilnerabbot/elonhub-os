"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canEditOrganisation } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  isAccountNumber,
  isBranchCode,
  isVatNumber,
  normaliseDigits,
  stripControl,
} from "@/lib/company";
import { Validator, describeDbError, field, type ActionResult } from "@/lib/validate";

/**
 * Update the organisation's letterhead, VAT registration and banking details.
 *
 * These are the fields printed on every quote, invoice and receipt, so this is
 * the one screen where a typo leaves the building. The checks themselves live
 * in src/lib/company.ts, because a "use server" module may export only async
 * functions and nothing defined in one can be reached by a test.
 *
 * `vat_rate` is not part of this patch — it has its own action below, because
 * changing what documents charge is a different kind of change from changing
 * how they look, and a save here should not be able to touch it.
 *
 * ponytail: every save rewrites all twelve columns, so two people editing at
 * once silently overwrite each other. Fine for one super admin; revisit with a
 * version column if a second one ever exists.
 */
export async function updateOrganisation(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canEditOrganisation(session.role)) {
    return {
      ok: false,
      errors: {},
      message: "Only a super admin can change the company details.",
    };
  }

  const v = new Validator(formData);

  /**
   * A free-text letterhead field. Blank is stored as "" rather than NULL, so
   * that clearing one actually removes it from documents — NULL means "never
   * set" and falls back to the constant in src/lib/company.ts. Without the
   * distinction a company with no website could never stop printing one.
   */
  const text = (name: string, label: string, max: number): string =>
    stripControl(v.optional(name, label, max) ?? "");

  const patch = {
    name: stripControl(v.required("name", "Company name", 120)),
    address: text("address", "Address", 300),
    phone: text("phone", "Phone", 40),
    website: text("website", "Website", 120),
    bank_name: text("bank_name", "Bank", 80),
    bank_account_name: text("bank_account_name", "Account holder", 120),
    bank_account_type: text("bank_account_type", "Account type", 80),
    // Email keeps its shape check. Blank is "" for the same reason as above,
    // but anything non-blank still has to look like an address.
    email: v.optionalEmail("email", "Email") ?? "",
    // The four below are NULL when blank, not "". Each is either a real
    // registered value or absent — there is no meaningful "deliberately empty
    // VAT number" — and the CHECK constraints added in migration 0009 are
    // written as `is null or <format>`, which "" would violate.
    registration_number: v.optional("registration_number", "Registration number", 40),
    vat_number: v.optional("vat_number", "VAT number", 20),
    bank_account_number: v.optional("bank_account_number", "Account number", 20),
    bank_branch_code: v.optional("bank_branch_code", "Branch code", 10),
  };

  if (!patch.name) v.errors.name = "Company name is required.";
  if (patch.registration_number) {
    patch.registration_number = stripControl(patch.registration_number) || null;
  }

  // Normalised before being checked and before being stored, so the separators
  // people paste ("4123 456 789", "4123-456-789") are accepted and the stored
  // value is clean enough to copy straight into a banking app.
  //
  // A mistyped VAT number is not a cosmetic error: it invalidates the client's
  // input-tax claim and the invoice has to be reissued. A mistyped branch code
  // is a payment that never arrives. Both are worth refusing at the form.
  if (patch.vat_number) {
    patch.vat_number = normaliseDigits(patch.vat_number);
    if (!isVatNumber(patch.vat_number)) {
      v.errors.vat_number = "A South African VAT number is 10 digits starting with 4.";
    }
  }
  if (patch.bank_branch_code) {
    patch.bank_branch_code = normaliseDigits(patch.bank_branch_code);
    if (!isBranchCode(patch.bank_branch_code)) {
      v.errors.bank_branch_code = "A branch code is six digits.";
    }
  }
  if (patch.bank_account_number) {
    patch.bank_account_number = normaliseDigits(patch.bank_account_number);
    if (!isAccountNumber(patch.bank_account_number)) {
      v.errors.bank_account_number = "An account number is 6 to 20 digits.";
    }
  }

  if (!v.ok) return v.fail();

  const supabase = await createClient();
  // Scoped to the caller's own organisation from the session, never an id from
  // the form. This `.eq` is load-bearing rather than belt-and-braces until
  // migration 0009's `alter policy` is applied, because the original
  // org_update policy checked the role without checking the row.
  //
  // The result is read back so an RLS rejection reports itself instead of
  // looking like a save that worked.
  const { data, error } = await supabase
    .from("organisations")
    .update(patch)
    .eq("id", session.orgId)
    .select("id");

  if (error) {
    // The expected failure when migration 0009 has not been applied.
    if (error.code === "42703" || error.code === "PGRST204") {
      describeDbError(error, "updateOrganisation.update");
      return {
        ok: false,
        errors: {},
        message:
          "The company detail columns do not exist yet. Apply migration 0009_org_identity.sql in the Supabase SQL editor, then try again.",
      };
    }
    return {
      ok: false,
      errors: {},
      message: describeDbError(error, "updateOrganisation.update"),
    };
  }

  // An empty result is the rejection: RLS filtered the row out of the scan,
  // so nothing was written.
  if (!data || data.length === 0) {
    return {
      ok: false,
      errors: {},
      message: "That change was rejected. Only a super admin can edit the company details.",
    };
  }

  // The document routes are dynamic today — every one calls cookies() through
  // the Supabase server client — so nothing of theirs sits in the full route
  // cache. What this actually clears is the client Router Cache, so a document
  // already open in another tab stops showing the old banking block. It also
  // becomes load-bearing the moment anyone adds `revalidate` to those routes.
  revalidatePath("/dashboard/settings", "page");
  revalidatePath("/documents", "layout");
  return { ok: true };
}

/**
 * Change the organisation's VAT rate.
 *
 * Separate from updateOrganisation because it is a different kind of change:
 * the letterhead is how documents look, this is what they charge.
 *
 * Safe to expose only because migration 0010 records the rate on each quote
 * and invoice as it is raised, so this sets the figure for future documents
 * rather than restating issued ones. The Settings page probes for that column
 * and keeps the field locked where the migration has not been applied — but
 * the probe is a UI courtesy, so the same reasoning is repeated here rather
 * than assumed.
 */
export async function updateVatRate(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canEditOrganisation(session.role)) {
    return { ok: false, errors: {}, message: "Only a super admin can change the VAT rate." };
  }

  const raw = field(formData, "vat_rate").replace(/[\s%]/g, "");
  if (!raw) {
    // Not defaulted. A blank field silently becoming 0% would zero-rate every
    // future invoice, and nothing downstream would look wrong until SARS did.
    return { ok: false, errors: { vat_rate: "A VAT rate is required." } };
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return {
      ok: false,
      errors: { vat_rate: "A VAT rate is a percentage between 0 and 100." },
    };
  }

  // numeric(5,2) in the database; rounding here means the stored figure is the
  // one that was typed rather than one Postgres quietly rounded.
  const vatRate = Math.round(parsed * 100) / 100;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organisations")
    .update({ vat_rate: vatRate })
    .eq("id", session.orgId)
    .select("id");

  if (error) {
    return { ok: false, errors: {}, message: describeDbError(error, "updateVatRate.update") };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      errors: {},
      message: "That change was rejected. Only a super admin can edit the company details.",
    };
  }

  revalidatePath("/dashboard/settings", "page");
  return { ok: true };
}
