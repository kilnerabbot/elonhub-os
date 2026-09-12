"use client";

import { useActionState } from "react";
import { Field, FormError, Submit } from "@/components/Field";
import type { ActionResult } from "@/lib/validate";
import { updateOrganisation } from "./actions";

export type SettingsDefaults = {
  name: string;
  vat_number: string;
  registration_number: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  bank_name: string;
  bank_account_name: string;
  bank_account_type: string;
  bank_account_number: string;
  bank_branch_code: string;
};

export function SettingsForm({
  defaults,
  branchCodePlaceholder,
}: {
  defaults: SettingsDefaults;
  /** The inferred FNB universal code, shown as a hint rather than a value. */
  branchCodePlaceholder: string;
}) {
  const [state, action] = useActionState<ActionResult | null, FormData>(
    updateOrganisation,
    null
  );
  const errors = state && !state.ok ? state.errors : {};

  return (
    <form action={action} className="flex flex-col gap-6">
      <FormError message={state && !state.ok ? state.message : undefined} />
      {state?.ok && (
        <p
          role="status"
          className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-dim"
        >
          Saved. Open a quote or invoice document to check how it prints.
        </p>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-text-faint">
          Identity
        </h2>
        <Field
          name="name"
          label="Company name"
          required
          defaultValue={defaults.name}
          error={errors.name}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="vat_number"
            label="VAT number"
            placeholder="4123456789"
            defaultValue={defaults.vat_number}
            error={errors.vat_number}
          />
          <Field
            name="registration_number"
            label="Registration number"
            placeholder="2021/123456/07"
            defaultValue={defaults.registration_number}
            error={errors.registration_number}
          />
        </div>
        <Field
          name="address"
          label="Address"
          textarea
          placeholder="One line per line"
          defaultValue={defaults.address}
          error={errors.address}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field name="phone" label="Phone" defaultValue={defaults.phone} error={errors.phone} />
          <Field
            name="email"
            label="Email"
            type="email"
            defaultValue={defaults.email}
            error={errors.email}
          />
          <Field
            name="website"
            label="Website"
            defaultValue={defaults.website}
            error={errors.website}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-6">
        <div>
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-text-faint">
            Banking
          </h2>
          <p className="mt-1 text-[11px] text-text-faint">
            Printed on every invoice. Check these against your bank statement, not from
            memory — a wrong digit here is a payment that never arrives. The branch code is
            empty on purpose: the {branchCodePlaceholder} shown as a hint is FNB&rsquo;s
            universal code, which was inferred and never confirmed. Type it once you have
            checked it.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="bank_account_name"
            label="Account holder"
            defaultValue={defaults.bank_account_name}
            error={errors.bank_account_name}
          />
          <Field
            name="bank_name"
            label="Bank"
            defaultValue={defaults.bank_name}
            error={errors.bank_name}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            name="bank_account_type"
            label="Account type"
            defaultValue={defaults.bank_account_type}
            error={errors.bank_account_type}
          />
          <Field
            name="bank_account_number"
            label="Account number"
            defaultValue={defaults.bank_account_number}
            error={errors.bank_account_number}
          />
          <Field
            name="bank_branch_code"
            label="Branch code"
            placeholder={branchCodePlaceholder}
            defaultValue={defaults.bank_branch_code}
            error={errors.bank_branch_code}
          />
        </div>
      </section>

      <div>
        <Submit>Save company details</Submit>
      </div>
    </form>
  );
}
