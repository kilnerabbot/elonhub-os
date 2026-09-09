"use client";

import { useActionState } from "react";
import { Field, FormError, Submit } from "@/components/Field";
import type { ActionResult } from "@/lib/validate";
import { createCustomer } from "./actions";

export function CustomerForm() {
  const [state, action] = useActionState<ActionResult | null, FormData>(createCustomer, null);
  const errors = state && !state.ok ? state.errors : {};

  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <FormError message={state && !state.ok ? state.message : undefined} />

      <Field name="legal_name" label="Legal name" required error={errors.legal_name} />
      <Field
        name="trading_name"
        label="Trading name"
        placeholder="If it differs from the legal name"
        error={errors.trading_name}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="registration_number"
          label="Registration number"
          error={errors.registration_number}
        />
        <Field name="vat_number" label="VAT number" error={errors.vat_number} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="industry" label="Industry" error={errors.industry} />
        <Field
          name="website"
          label="Website"
          placeholder="https://"
          error={errors.website}
        />
      </div>

      <Field name="address" label="Address" textarea error={errors.address} />

      <div className="mt-1">
        <Submit>Create customer</Submit>
      </div>
    </form>
  );
}
