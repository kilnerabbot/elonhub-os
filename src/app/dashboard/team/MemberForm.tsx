"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Field, FormError, SelectField, Submit } from "@/components/Field";
import type { AppRole } from "@/lib/supabase/types";
import type { ActionResult } from "@/lib/validate";
import { addMember } from "./actions";

// Least privileged first, so the most powerful role is never the accidental
// default at the top of the list.
const ROLES: AppRole[] = [
  "employee", "salesperson", "sales_manager", "project_manager",
  "finance", "support_agent", "hr", "client", "director", "super_admin",
];

/** A readable password, so the admin is not inventing one under pressure. */
function suggestPassword() {
  const words = ["amber", "rosebank", "cobalt", "harvest", "lantern", "quartz", "meridian", "willow"];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  return `${pick()}-${pick()}-${Math.floor(Math.random() * 900 + 100)}`;
}

export function MemberForm() {
  const [state, action] = useActionState<ActionResult | null, FormData>(addMember, null);
  const formRef = useRef<HTMLFormElement>(null);
  // Uncontrolled: form.reset() clears it, so there is no state to synchronise
  // and no setState inside the effect.
  const passwordRef = useRef<HTMLInputElement>(null);
  const [reveal, setReveal] = useState(false);
  const errors = state && !state.ok ? state.errors : {};

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      <FormError message={state && !state.ok ? state.message : undefined} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="full_name" label="Full name" required error={errors.full_name} />
        <Field name="email" label="Email" type="email" required error={errors.email} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="field-password" className="text-[12px] font-medium text-text-dim">
            Password<span className="ml-0.5 text-danger">*</span>
          </label>
          <div className="flex gap-2">
            <input
              ref={passwordRef}
              id="field-password"
              name="password"
              // Toggleable rather than always masked: the admin has to read
              // this back to the person, and typing a password they cannot
              // see is how mistyped credentials get handed out.
              type={reveal ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              aria-invalid={errors.password ? true : undefined}
              className={`min-w-0 flex-1 rounded-lg border bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-border-strong ${
                errors.password ? "border-danger" : "border-border"
              }`}
            />
            <button
              type="button"
              onClick={() => setReveal((r) => !r)}
              className="flex-none rounded-lg border border-border-strong px-2 text-[11px] text-text-dim hover:bg-surface-2"
            >
              {reveal ? "Hide" : "Show"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (passwordRef.current) passwordRef.current.value = suggestPassword();
                setReveal(true);
              }}
              className="flex-none rounded-lg border border-border-strong px-2 text-[11px] text-text-dim hover:bg-surface-2"
            >
              Suggest
            </button>
          </div>
          {errors.password ? (
            <p className="text-[12px] text-danger">{errors.password}</p>
          ) : (
            <p className="text-[11px] text-text-faint">
              At least 8 characters. Share it with them and ask them to change it.
            </p>
          )}
        </div>

        <SelectField
          name="role"
          label="Role"
          options={ROLES}
          defaultValue="employee"
          error={errors.role}
        />
      </div>

      <div className="flex items-center gap-3">
        <Submit>Add member</Submit>
        {state?.ok && (
          <span className="text-[12px] text-good">
            Account created. They can sign in immediately.
          </span>
        )}
      </div>
    </form>
  );
}
