"use client";

import { useActionState, useEffect, useRef } from "react";
import { Field, FormError, Submit } from "@/components/Field";
import type { ActionResult } from "@/lib/validate";
import { createContact } from "./actions";

export function ContactForm({ customerId }: { customerId: string }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(createContact, null);
  const formRef = useRef<HTMLFormElement>(null);
  const errors = state && !state.ok ? state.errors : {};

  // Clear the form after a successful save. Without this the fields keep the
  // previous contact's details and the next entry starts as an accidental
  // near-duplicate.
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      <FormError message={state && !state.ok ? state.message : undefined} />
      <input type="hidden" name="customer_id" value={customerId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="full_name" label="Full name" required error={errors.full_name} />
        <Field name="role_title" label="Job title" error={errors.role_title} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="email" label="Email" type="email" error={errors.email} />
        <Field name="phone" label="Phone" type="tel" error={errors.phone} />
      </div>

      <label className="flex items-center gap-2 text-[13px] text-text-dim">
        <input type="checkbox" name="is_primary" className="size-4 accent-[var(--color-accent)]" />
        Primary contact for this customer
      </label>

      <div>
        <Submit>Add contact</Submit>
      </div>
    </form>
  );
}
