"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Field, FormError, SelectField, Submit } from "@/components/Field";
import type { AppRole } from "@/lib/supabase/types";
import type { ActionResult } from "@/lib/validate";
import { inviteMember } from "./actions";

const ROLES: AppRole[] = [
  "employee", "salesperson", "sales_manager", "project_manager",
  "finance", "support_agent", "hr", "director", "client", "super_admin",
];

export function InviteForm({ signupUrl }: { signupUrl: string }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(inviteMember, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [copied, setCopied] = useState(false);
  const errors = state && !state.ok ? state.errors : {};

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <div className="flex flex-col gap-4">
      <form ref={formRef} action={action} className="flex flex-col gap-4">
        <FormError message={state && !state.ok ? state.message : undefined} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="email" label="Email" type="email" required error={errors.email} />
          <Field name="full_name" label="Full name" error={errors.full_name} />
        </div>

        {/* Ordered least- to most-privileged so the destructive option is not
            the easy accidental pick. */}
        <SelectField
          name="role"
          label="Role"
          options={ROLES}
          defaultValue="employee"
          error={errors.role}
        />

        <div className="flex items-center gap-3">
          <Submit>Add member</Submit>
          {state?.ok && (
            <span className="text-[12px] text-good">
              Invited. Send them the signup link below.
            </span>
          )}
        </div>
      </form>

      <div className="rounded-lg bg-surface-2 px-3 py-2.5">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
          Signup link
        </p>
        <div className="mt-1 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate text-[12px] text-text">{signupUrl}</code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(signupUrl).then(
                () => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                },
                // Clipboard access can be denied; the link is on screen either
                // way, so this only affects the convenience of copying it.
                () => setCopied(false)
              );
            }}
            className="flex-none rounded border border-border-strong px-2 py-1 text-[11px] text-text-dim transition-colors hover:bg-surface"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-text-dim">
          They sign up with the invited address and arrive holding the role above. Any other
          address gets the default employee role.
        </p>
      </div>
    </div>
  );
}
