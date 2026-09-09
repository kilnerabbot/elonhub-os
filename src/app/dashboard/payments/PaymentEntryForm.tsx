"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Field, FormError, Submit } from "@/components/Field";
import type { ActionResult } from "@/lib/validate";
import { recordPayment } from "../invoices/actions";

export type PayableInvoice = {
  id: string;
  number: string;
  customer: string;
  outstanding: number;
};

const zar = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 2,
});

/**
 * Record a payment against any outstanding invoice, for working from a bank
 * statement rather than opening each invoice in turn.
 *
 * The action is the same recordPayment used on the invoice page, so the
 * overpayment guard and status derivation apply identically.
 */
export function PaymentEntryForm({ invoices }: { invoices: PayableInvoice[] }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(recordPayment, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [selected, setSelected] = useState(invoices[0]?.id ?? "");
  const errors = state && !state.ok ? state.errors : {};

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  if (invoices.length === 0) {
    return (
      <p className="text-[13px] text-text-dim">
        Nothing is outstanding. Issue an invoice before recording a payment.
      </p>
    );
  }

  const chosen = invoices.find((i) => i.id === selected) ?? invoices[0];

  return (
    <form ref={formRef} action={action} className="flex max-w-xl flex-col gap-4">
      <FormError message={state && !state.ok ? state.message : undefined} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="invoice_id" className="text-[12px] font-medium text-text-dim">
          Invoice<span className="ml-0.5 text-danger">*</span>
        </label>
        <select
          id="invoice_id"
          name="invoice_id"
          required
          value={selected}
          onChange={(e) => setSelected(e.currentTarget.value)}
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-border-strong"
        >
          {invoices.map((i) => (
            <option key={i.id} value={i.id}>
              {i.number} — {i.customer} — {zar.format(i.outstanding)} outstanding
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="amount"
          label={`Amount (max ${zar.format(chosen.outstanding)})`}
          type="number"
          placeholder="0.00"
          error={errors.amount}
        />
        <Field
          name="paid_at"
          label="Date received"
          type="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
          error={errors.paid_at}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="method" label="Method" placeholder="EFT" error={errors.method} />
        <Field name="reference" label="Reference" error={errors.reference} />
      </div>

      <div>
        <Submit>Record payment</Submit>
      </div>
    </form>
  );
}
