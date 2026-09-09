"use client";

import { useActionState } from "react";
import { Field, FormError, Submit } from "@/components/Field";
import type { ActionResult } from "@/lib/validate";
import { convertQuoteToInvoice } from "../invoices/actions";

/** Default due date: 30 days out, the usual agency term. */
function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

export function ConvertToInvoiceForm({
  quoteId,
  existingInvoice,
}: {
  quoteId: string;
  existingInvoice: { id: string; number: string } | null;
}) {
  const [state, action] = useActionState<ActionResult | null, FormData>(
    convertQuoteToInvoice,
    null
  );
  const errors = state && !state.ok ? state.errors : {};

  if (existingInvoice) {
    return (
      <p className="text-[13px] text-text-dim">
        Invoice{" "}
        <a
          href={`/dashboard/invoices/${existingInvoice.id}`}
          className="text-gold-bright hover:underline"
        >
          {existingInvoice.number}
        </a>{" "}
        was already raised from this quote.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError message={state && !state.ok ? state.message : undefined} />
      <input type="hidden" name="quote_id" value={quoteId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="due_date"
          label="Payment due"
          type="date"
          defaultValue={defaultDueDate()}
          error={errors.due_date}
        />
      </div>

      <p className="text-[11px] text-text-faint">
        Every line copies across and the invoice is created as a draft, so you can adjust it
        before issuing. Discounted lines are folded into their net price so the invoice total
        matches this quote exactly.
      </p>

      <div>
        <Submit>Convert to invoice</Submit>
      </div>
    </form>
  );
}
