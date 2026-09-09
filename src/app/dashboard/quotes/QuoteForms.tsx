"use client";

import { useActionState, useEffect, useRef } from "react";
import { Field, FormError, SelectField, Submit } from "@/components/Field";
import type { ActionResult } from "@/lib/validate";
import { addQuoteItem, createQuote, setQuoteStatus } from "./actions";

export function CreateQuoteForm({
  customers,
}: {
  customers: { id: string; legal_name: string }[];
}) {
  const [state, action] = useActionState<ActionResult | null, FormData>(createQuote, null);
  const errors = state && !state.ok ? state.errors : {};

  if (customers.length === 0) {
    return (
      <p className="text-[13px] text-text-dim">
        A quote needs a customer. Add one under Customers first.
      </p>
    );
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

export function AddItemForm({
  quoteId,
  services,
}: {
  quoteId: string;
  services: { id: string; sku: string; name: string; sell_price: number; is_vatable: boolean }[];
}) {
  const [state, action] = useActionState<ActionResult | null, FormData>(addQuoteItem, null);
  const formRef = useRef<HTMLFormElement>(null);
  const errors = state && !state.ok ? state.errors : {};

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  // Picking a catalogue service pre-fills description, price and VAT flag.
  // They stay editable: a quote often prices a standard service differently,
  // and locking the fields would push people back to editing by hand elsewhere.
  function applyService(id: string) {
    const form = formRef.current;
    const service = services.find((s) => s.id === id);
    if (!form || !service) return;
    (form.elements.namedItem("description") as HTMLInputElement).value = service.name;
    (form.elements.namedItem("unit_price") as HTMLInputElement).value = String(service.sell_price);
    (form.elements.namedItem("is_vatable") as HTMLInputElement).checked = service.is_vatable;
  }

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      <FormError message={state && !state.ok ? state.message : undefined} />

      {services.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="service_id" className="text-[12px] font-medium text-text-dim">
            Prefill from catalogue
          </label>
          <select
            id="service_id"
            name="service_id"
            defaultValue=""
            onChange={(e) => applyService(e.currentTarget.value)}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-border-strong"
          >
            <option value="">Custom line…</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.sku} — {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <input type="hidden" name="quote_id" value={quoteId} />
      <Field name="description" label="Description" required error={errors.description} />

      <div className="grid gap-4 sm:grid-cols-3">
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
        <Field
          name="discount_pct"
          label="Discount %"
          type="number"
          defaultValue="0"
          error={errors.discount_pct}
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

export function StatusForm({ quoteId, status }: { quoteId: string; status: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    setQuoteStatus,
    null
  );
  const failed = state && !state.ok;

  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="quote_id" value={quoteId} />
      <SelectField
        name="status"
        label="Status"
        options={["draft", "sent", "viewed", "accepted", "rejected", "expired"]}
        defaultValue={status}
      />
      <button
        type="submit"
        disabled={pending}
        className="mt-1 self-start rounded-lg border border-border-strong px-3 py-1.5 text-[12px] text-text transition-colors hover:bg-surface-2 disabled:opacity-60"
      >
        {pending ? "Updating…" : "Update status"}
      </button>
      {failed && (
        <span role="alert" className="text-[11px] text-danger">
          {state.message}
        </span>
      )}
    </form>
  );
}
