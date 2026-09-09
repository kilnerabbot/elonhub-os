"use client";

import { useActionState } from "react";
import { Field, FormError, SelectField, Submit } from "@/components/Field";
import { OPEN_STAGES, STAGE_PROBABILITY } from "@/lib/domain";
import type { ActionResult } from "@/lib/validate";
import { convertLead } from "./actions";

export function ConvertForm({
  leadId,
  defaultName,
}: {
  leadId: string;
  defaultName: string;
}) {
  const [state, action] = useActionState<ActionResult | null, FormData>(convertLead, null);
  const errors = state && !state.ok ? state.errors : {};

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError message={state && !state.ok ? state.message : undefined} />
      <input type="hidden" name="lead_id" value={leadId} />

      <Field
        name="name"
        label="Opportunity name"
        required
        defaultValue={defaultName}
        error={errors.name}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="stage"
          label="Stage"
          options={OPEN_STAGES}
          defaultValue="qualified"
          error={errors.stage}
        />
        <Field
          name="probability"
          label="Probability %"
          type="number"
          defaultValue={String(STAGE_PROBABILITY.qualified)}
          error={errors.probability}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="value"
          label="Value (ZAR)"
          type="number"
          placeholder="0.00"
          error={errors.value}
        />
        <Field
          name="expected_close_date"
          label="Expected close"
          type="date"
          error={errors.expected_close_date}
        />
      </div>

      <div>
        <Submit>Convert to opportunity</Submit>
      </div>
    </form>
  );
}
