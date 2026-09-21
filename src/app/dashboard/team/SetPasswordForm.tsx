"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FormError, Submit } from "@/components/Field";
import type { ActionResult } from "@/lib/validate";
import { resetMemberPassword } from "./actions";

/**
 * Per-member password reset, behind a native <details> disclosure.
 *
 * <details> rather than a piece of React state: the row only needs to expand,
 * the browser already does that, and a table of twenty members would otherwise
 * carry twenty independent open/closed booleans for no gain.
 */
export function SetPasswordForm({ userId, name }: { userId: string; name: string }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(
    resetMemberPassword,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [reveal, setReveal] = useState(false);
  const errors = state && !state.ok ? state.errors : {};

  // Clear the fields once it has worked, so a password someone else chose is
  // not left sitting on screen in an open tab.
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-[11px] text-text-faint transition-colors marker:content-none hover:text-text-dim">
        <span className="group-open:hidden">Set password</span>
        <span className="hidden group-open:inline">Cancel</span>
      </summary>

      <form ref={formRef} action={action} className="mt-2 flex w-[15rem] flex-col gap-2">
        <input type="hidden" name="user_id" value={userId} />
        <FormError message={state && !state.ok ? state.message : undefined} />

        <PasswordField
          uid={userId}
          name="password"
          label={`New password for ${name}`}
          reveal={reveal}
          error={errors.password}
        />
        <PasswordField
          uid={userId}
          name="confirm_password"
          label="Confirm"
          reveal={reveal}
          error={errors.confirm_password}
        />
        {/* A step-up challenge, not a formality. Without it a stolen admin
            session is a credential-harvesting tool: every colleague's password
            reset one row at a time with nothing ever asked. */}
        <PasswordField
          uid={userId}
          name="actor_password"
          label="Your own password"
          autoComplete="current-password"
          // Whatever the admin's existing password is, including one set
          // before the 8-character rule existed. The server checks it by
          // signing in, which is the only test that matters.
          minLength={1}
          reveal={reveal}
          error={errors.actor_password}
        />

        <label className="flex items-center gap-2 text-[11px] text-text-dim">
          <input
            type="checkbox"
            checked={reveal}
            onChange={(e) => setReveal(e.currentTarget.checked)}
            className="size-4 accent-[var(--color-accent)]"
          />
          Show
        </label>

        {/* Stated in full because an administrator resetting a password after
            a suspected compromise will otherwise assume it ends the intruder's
            access. Supabase's admin API can only end a session it holds the
            token for, and deleting the auth user would cascade the profile
            away, so there is no in-app revocation to offer. */}
        <p className="text-[11px] leading-relaxed text-text-faint">
          This does not end sessions {name} already has. If the account is compromised, an
          intruder keeps working access for up to an hour and can keep refreshing it —
          locking them out means rotating the project JWT secret in Supabase, which signs
          everyone out. Send the new password over something other than email.
        </p>

        <div className="flex items-center gap-2">
          <Submit>Set password</Submit>
        </div>
        {state?.ok && (
          <span role="status" className="text-[11px] text-good">
            Password set.
          </span>
        )}
      </form>
    </details>
  );
}

function PasswordField({
  uid,
  name,
  label,
  reveal,
  error,
  minLength = 8,
  // "off", not "new-password", for the two fields that set someone else's
  // password: new-password invites the administrator's own browser to save a
  // colleague's credentials under the administrator's profile.
  autoComplete = "off",
}: {
  uid: string;
  name: string;
  label: string;
  reveal: boolean;
  error?: string;
  minLength?: number;
  autoComplete?: string;
}) {
  const id = `set-${uid}-${name}`;
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[11px] font-medium text-text-dim">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={reveal ? "text" : "password"}
        required
        minLength={minLength}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        // 16px below sm: anything smaller makes iOS Safari zoom the viewport
        // on focus and leave it zoomed.
        className={`w-full rounded-lg border bg-surface-2 px-2.5 py-2 text-base text-text outline-none focus:border-border-strong sm:text-xs ${
          error ? "border-danger" : "border-border"
        }`}
      />
      {error && (
        <p id={errorId} className="text-[11px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
