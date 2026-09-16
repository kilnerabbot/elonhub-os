"use client";

import { useActionState } from "react";
import { Field, FormError, Submit } from "@/components/Field";
import type { ActionResult } from "@/lib/validate";
import { updateVatRate } from "./actions";

/**
 * Its own form and its own action, separate from the letterhead.
 *
 * The letterhead is cosmetic; this figure decides what every future document
 * charges. Keeping them apart means saving an address cannot touch the rate,
 * and the confirmation text can say what actually changed.
 */
export function VatRateForm({ defaultValue }: { defaultValue: string }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(updateVatRate, null);
  const errors = state && !state.ok ? state.errors : {};

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError message={state && !state.ok ? state.message : undefined} />
      {state?.ok && (
        <p
          role="status"
          className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-dim"
        >
          Saved. Quotes and invoices raised from now on use this rate.
        </p>
      )}

      <div className="max-w-[12rem]">
        <Field
          name="vat_rate"
          label="Rate (%)"
          required
          defaultValue={defaultValue}
          error={errors.vat_rate}
        />
      </div>

      <div>
        <Submit>Save VAT rate</Submit>
      </div>
    </form>
  );
}
