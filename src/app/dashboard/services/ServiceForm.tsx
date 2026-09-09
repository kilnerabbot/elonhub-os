"use client";

import { useActionState, useEffect, useRef } from "react";
import { Field, FormError, SelectField, Submit } from "@/components/Field";
import type { ActionResult } from "@/lib/validate";
import { createService } from "./actions";

export function ServiceForm() {
  const [state, action] = useActionState<ActionResult | null, FormData>(createService, null);
  const formRef = useRef<HTMLFormElement>(null);
  const errors = state && !state.ok ? state.errors : {};

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      <FormError message={state && !state.ok ? state.message : undefined} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="sku" label="SKU" required error={errors.sku} />
        <div className="sm:col-span-2">
          <Field name="name" label="Name" required error={errors.name} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="category" label="Category" error={errors.category} />
        <SelectField name="kind" label="Kind" options={["once_off", "recurring"]} error={errors.kind} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="cost" label="Cost (ZAR)" type="number" placeholder="0.00" error={errors.cost} />
        <Field
          name="sell_price"
          label="Sell price (ZAR)"
          type="number"
          placeholder="0.00"
          error={errors.sell_price}
        />
      </div>

      <Field name="description" label="Description" textarea error={errors.description} />

      <label className="flex items-center gap-2 text-[13px] text-text-dim">
        <input
          type="checkbox"
          name="is_vatable"
          defaultChecked
          className="size-4 accent-[var(--color-accent)]"
        />
        VAT applies to this service
      </label>

      <div>
        <Submit>Add to catalogue</Submit>
      </div>
    </form>
  );
}
