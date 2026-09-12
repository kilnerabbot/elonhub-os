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
import { Validator, describeDbError, type ActionResult } from "@/lib/validate";

/**
 * Update the organisation's letterhead, VAT registration and banking details.
 *
 * These are the fields printed on every quote, invoice and receipt, so this is
 * the one screen where a typo leaves the building. The checks themselves live
 * in src/lib/company.ts, because a "use server" module may export only async
 * functions and nothing defined in one can be reached by a test.
 *
 * `vat_rate` is deliberately NOT editable here. Documents recompute their
 * totals from line items using the organisation's current rate, so changing it
 * would silently reprint invoices that were already issued and sent at the old
 * rate. Making it editable needs the rate snapshotted onto the invoice row
 * first; until then the rate is changed in SQL, consciously.
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
  // count: "exact" so an RLS rejection reports itself instead of looking like
  // a save that worked.
  const { error, count } = await supabase
    .from("organisations")
    .update(patch, { count: "exact" })
    .eq("id", session.orgId);

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

  // Not `count === 0`: supabase-js types count as `number | null`, and a null
  // would fall through and report a rejected write as saved.
  if (count !== 1) {
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
