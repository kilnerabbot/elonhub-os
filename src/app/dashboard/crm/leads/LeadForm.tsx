"use client";

import { useActionState } from "react";
import { Field, FormError, SelectField, Submit } from "@/components/Field";
import { LEAD_SOURCES, LEAD_STATUSES } from "@/lib/domain";
import type { ActionResult } from "@/lib/validate";
import { createLead } from "./actions";

export function LeadForm() {
  const [state, action] = useActionState<ActionResult | null, FormData>(createLead, null);
  const errors = state && !state.ok ? state.errors : {};

  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <FormError message={state && !state.ok ? state.message : undefined} />

      <Field name="company_name" label="Company name" required error={errors.company_name} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="contact_name" label="Contact name" error={errors.contact_name} />
        <Field name="email" label="Email" type="email" error={errors.email} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="phone" label="Phone" type="tel" error={errors.phone} />
        <SelectField
          name="source"
          label="Source"
          options={LEAD_SOURCES}
          defaultValue="whatsapp"
          error={errors.source}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="industry" label="Industry" error={errors.industry} />
        <Field name="location" label="Location" error={errors.location} />
        <Field
          name="score"
          label="Score (0–100)"
          type="number"
          placeholder="0"
          error={errors.score}
        />
      </div>

      <SelectField
        name="status"
        label="Status"
        options={LEAD_STATUSES}
        defaultValue="new"
        error={errors.status}
      />

      <Field name="notes" label="Notes" textarea error={errors.notes} />

      <div className="mt-1">
        <Submit>Create lead</Submit>
      </div>
    </form>
  );
}
