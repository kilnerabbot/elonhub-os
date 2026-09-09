"use client";

import { useActionState, useEffect, useRef } from "react";
import { Field, FormError, Submit } from "@/components/Field";
import type { ActionResult } from "@/lib/validate";
import {
  addInvoiceItem,
  createInvoice,
  issueInvoice,
  recordPayment,
  voidInvoice,
} from "./actions";

export function CreateInvoiceForm({
  customers,
  quotes,
}: {
  customers: { id: string; legal_name: string }[];
  quotes: { id: string; number: string; customer_id: string }[];
}) {
  const [state, action] = useActionState<ActionResult | null, FormData>(createInvoice, null);
  const errors = state && !state.ok ? state.errors : {};

  if (customers.length === 0) {
    return <p className="text-[13px] text-text-dim">Add a customer before raising an invoice.</p>;
  }

  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <FormError message={state && !state.ok ? state.message : undefined} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="customer_id" className="text-[12px] font-medium text-text-dim">
          Customer<span className="ml-0.5 text-danger">*</span>
        </label>
        <select
          id="customer_id"
          name="customer_id"
          required
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-border-strong"
        >
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.legal_name}
            </option>
          ))}
        </select>
        {errors.customer_id && <p className="text-[12px] text-danger">{errors.customer_id}</p>}
      </div>

      {quotes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="quote_id" className="text-[12px] font-medium text-text-dim">
            Copy lines from an accepted quote
          </label>
          <select
            id="quote_id"
            name="quote_id"
            defaultValue=""
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-border-strong"
          >
            <option value="">Start empty</option>
            {quotes.map((q) => (
              <option key={q.id} value={q.id}>
                {q.number}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-text-faint">
            Choosing a quote also sets the customer from that quote, and copies its lines.
          </p>
        </div>
      )}

      <Field name="due_date" label="Due date" type="date" error={errors.due_date} />

      <div>
        <Submit>Create draft invoice</Submit>
      </div>
    </form>
  );
}

export function AddInvoiceItemForm({ invoiceId }: { invoiceId: string }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(addInvoiceItem, null);
  const formRef = useRef<HTMLFormElement>(null);
  const errors = state && !state.ok ? state.errors : {};

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      <FormError message={state && !state.ok ? state.message : undefined} />
      <input type="hidden" name="invoice_id" value={invoiceId} />

      <Field name="description" label="Description" required error={errors.description} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="quantity"
          label="Quantity"
          type="number"
          defaultValue="1"
          error={errors.quantity}
        />
        <Field
          name="unit_price"
          label="Unit price (ZAR)"
          type="number"
          placeholder="0.00"
          error={errors.unit_price}
        />
      </div>

      <label className="flex items-center gap-2 text-[13px] text-text-dim">
        <input
          type="checkbox"
          name="is_vatable"
          defaultChecked
          className="size-4 accent-[var(--color-accent)]"
        />
        VAT applies to this line
      </label>

      <div>
        <Submit>Add line</Submit>
      </div>
    </form>
  );
}

export function PaymentForm({
  invoiceId,
  outstanding,
}: {
  invoiceId: string;
  outstanding: string;
}) {
  const [state, action] = useActionState<ActionResult | null, FormData>(recordPayment, null);
  const formRef = useRef<HTMLFormElement>(null);
  const errors = state && !state.ok ? state.errors : {};

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      <FormError message={state && !state.ok ? state.message : undefined} />
      <input type="hidden" name="invoice_id" value={invoiceId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="amount"
          label={`Amount (${outstanding} outstanding)`}
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

export function IssueButton({ invoiceId }: { invoiceId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    issueInvoice,
    null
  );
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-gold-bright px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-gold disabled:opacity-60"
      >
        {pending ? "Issuing…" : "Issue invoice"}
      </button>
      {state && !state.ok && (
        <span role="alert" className="text-[11px] text-danger">
          {state.message}
        </span>
      )}
    </form>
  );
}

export function VoidButton({ invoiceId }: { invoiceId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(voidInvoice, null);
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-border-strong px-3.5 py-2 text-[13px] text-text-dim transition-colors hover:border-danger hover:text-danger disabled:opacity-60"
      >
        {pending ? "Voiding…" : "Void"}
      </button>
      {state && !state.ok && (
        <span role="alert" className="text-[11px] text-danger">
          {state.message}
        </span>
      )}
    </form>
  );
}
