"use client";

import { useFormStatus } from "react-dom";

const BASE =
  "w-full rounded-lg border bg-surface-2 px-3 py-2 text-sm text-text outline-none transition-colors placeholder:text-text-faint focus:border-border-strong";

export function Field({
  name,
  label,
  error,
  type = "text",
  required,
  placeholder,
  textarea,
  defaultValue,
}: {
  name: string;
  label: string;
  error?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  textarea?: boolean;
  defaultValue?: string;
}) {
  const id = `field-${name}`;
  const errorId = `${id}-error`;
  const border = error ? "border-danger" : "border-border";

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12px] font-medium text-text-dim">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {textarea ? (
        <textarea
          id={id}
          name={name}
          rows={3}
          required={required}
          placeholder={placeholder}
          defaultValue={defaultValue}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`${BASE} ${border} resize-y`}
        />
      ) : (
        <input
          id={id}
          name={name}
          type={type}
          required={required}
          placeholder={placeholder}
          defaultValue={defaultValue}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`${BASE} ${border}`}
        />
      )}
      {error && (
        <p id={errorId} className="text-[12px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Submit button that reports pending state, so a slow save cannot be double-fired. */
export function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-gold-bright px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gold disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

/** Form-level error banner, for failures that belong to no single field. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger"
    >
      {message}
    </p>
  );
}
