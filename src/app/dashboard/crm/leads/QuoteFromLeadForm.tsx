"use client";

import { useActionState } from "react";
import { Field, FormError, Submit } from "@/components/Field";
import type { ActionResult } from "@/lib/validate";
import { createQuoteForLead } from "./actions";

export function QuoteFromLeadForm({
  leadId,
  companyName,
  customers,
}: {
  leadId: string;
  companyName: string;
  customers: { id: string; legal_name: string }[];
}) {
  const [state, action] = useActionState<ActionResult | null, FormData>(
    createQuoteForLead,
    null
  );
  const errors = state && !state.ok ? state.errors : {};

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError message={state && !state.ok ? state.message : undefined} />
      <input type="hidden" name="lead_id" value={leadId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="customer_id" className="text-[12px] font-medium text-text-dim">
          Quote as
        </label>
        <select
          id="customer_id"
          name="customer_id"
          defaultValue=""
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-border-strong"
        >
          <option value="">New customer &ldquo;{companyName}&rdquo;</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.legal_name}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-text-faint">
          A quote belongs to a customer, so quoting this lead will create one from its details
          unless you pick an existing record. Its contact person carries across too.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="payment_terms"
          label="Payment terms"
          placeholder="50% deposit, balance on delivery"
          error={errors.payment_terms}
        />
        <Field name="valid_until" label="Valid until" type="date" error={errors.valid_until} />
      </div>

      <div>
        <Submit>Create quote</Submit>
      </div>
    </form>
  );
}
