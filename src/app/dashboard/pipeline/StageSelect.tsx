"use client";

import { useActionState } from "react";
import { PIPELINE_STAGES } from "@/lib/domain";
import type { ActionResult } from "@/lib/validate";
import { moveOpportunity } from "./actions";

export function StageSelect({
  opportunityId,
  stage,
  disabled,
}: {
  opportunityId: string;
  stage: string;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    moveOpportunity,
    null
  );
  const failed = state && !state.ok;

  if (disabled) {
    return (
      <span className="text-[11px] capitalize text-text-faint">{stage.replace(/_/g, " ")}</span>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="opportunity_id" value={opportunityId} />
      <select
        name="stage"
        defaultValue={stage}
        disabled={pending}
        aria-label="Stage"
        aria-invalid={failed ? true : undefined}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={`w-full rounded border bg-surface px-1.5 py-1 text-[11px] capitalize text-text disabled:opacity-60 ${
          failed ? "border-danger" : "border-border"
        }`}
      >
        {PIPELINE_STAGES.map((s) => (
          <option key={s} value={s}>
            {s.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      {failed && (
        <span role="alert" className="text-[10px] text-danger">
          {state.message}
        </span>
      )}
    </form>
  );
}
