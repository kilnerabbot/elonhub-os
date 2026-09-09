"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FormError, Submit } from "@/components/Field";
import type { ActionResult } from "@/lib/validate";
import { changePassword } from "./actions";

export function PasswordForm() {
  const [state, action] = useActionState<ActionResult | null, FormData>(changePassword, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [reveal, setReveal] = useState(false);
  const errors = state && !state.ok ? state.errors : {};

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex max-w-md flex-col gap-4">
      <FormError message={state && !state.ok ? state.message : undefined} />

      <PasswordField
        name="current_password"
        label="Current password"
        autoComplete="current-password"
        reveal={reveal}
        error={errors.current_password}
      />

      <PasswordField
        name="new_password"
        label="New password"
        autoComplete="new-password"
        reveal={reveal}
        error={errors.new_password}
        hint="At least 8 characters."
      />

      <PasswordField
        name="confirm_password"
        label="Confirm new password"
        autoComplete="new-password"
        reveal={reveal}
        error={errors.confirm_password}
      />

      <label className="flex items-center gap-2 text-[12px] text-text-dim">
        <input
          type="checkbox"
          checked={reveal}
          onChange={(e) => setReveal(e.currentTarget.checked)}
          className="size-4 accent-[var(--color-accent)]"
        />
        Show passwords
      </label>

      <div className="flex items-center gap-3">
        <Submit>Change password</Submit>
        {state?.ok && <span className="text-[12px] text-good">Password changed.</span>}
      </div>
    </form>
  );
}

function PasswordField({
  name,
  label,
  autoComplete,
  reveal,
  error,
  hint,
}: {
  name: string;
  label: string;
  autoComplete: string;
  reveal: boolean;
  error?: string;
  hint?: string;
}) {
  const id = `field-${name}`;
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12px] font-medium text-text-dim">
        {label}
        <span className="ml-0.5 text-danger">*</span>
      </label>
      <input
        id={id}
        name={name}
        type={reveal ? "text" : "password"}
        required
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`w-full rounded-lg border bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-border-strong ${
          error ? "border-danger" : "border-border"
        }`}
      />
      {error ? (
        <p id={errorId} className="text-[12px] text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="text-[11px] text-text-faint">{hint}</p>
      )}
    </div>
  );
}
