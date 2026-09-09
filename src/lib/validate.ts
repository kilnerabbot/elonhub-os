/**
 * Form validation for server actions.
 *
 * Runs on the server, on FormData, at the trust boundary — never in the client
 * component alone. Client-side `required` attributes are UX; this is the check
 * that actually holds when someone posts the form directly.
 */

export type FieldErrors = Record<string, string>;

export type ActionResult =
  | { ok: true }
  | { ok: false; errors: FieldErrors; message?: string };

/** Reads a FormData entry as a trimmed string. Non-string entries (files) become "". */
export function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export class Validator {
  readonly errors: FieldErrors = {};
  // A plain field rather than a constructor parameter property: parameter
  // properties emit runtime code, so they cannot be type-stripped by Node.
  private readonly form: FormData;

  constructor(form: FormData) {
    this.form = form;
  }

  /** Required free text, length-bounded. Returns "" when invalid so callers can keep chaining. */
  required(name: string, label: string, max = 200): string {
    const value = field(this.form, name);
    if (!value) {
      this.errors[name] = `${label} is required.`;
      return "";
    }
    if (value.length > max) {
      this.errors[name] = `${label} must be ${max} characters or fewer.`;
      return "";
    }
    return value;
  }

  /** Optional free text. Empty becomes null so the column stores NULL, not "". */
  optional(name: string, label: string, max = 200): string | null {
    const value = field(this.form, name);
    if (!value) return null;
    if (value.length > max) {
      this.errors[name] = `${label} must be ${max} characters or fewer.`;
      return null;
    }
    return value;
  }

  /**
   * Optional email.
   *
   * Deliberately a shape check, not RFC 5322. Anything stricter rejects valid
   * addresses; the only real proof an address works is sending to it.
   */
  optionalEmail(name: string, label: string): string | null {
    const value = field(this.form, name);
    if (!value) return null;
    if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      this.errors[name] = `${label} must be a valid email address.`;
      return null;
    }
    return value;
  }

  get ok(): boolean {
    return Object.keys(this.errors).length === 0;
  }

  fail(message?: string): ActionResult {
    return { ok: false, errors: this.errors, message };
  }
}

/**
 * Turns a Supabase/Postgres error into something a human can act on.
 *
 * Raw driver messages leak schema detail and read as noise, but silence is
 * worse — an RLS rejection must never look like success.
 */
export function describeDbError(error: { code?: string; message: string }): string {
  switch (error.code) {
    case "42501":
      return "Your role does not allow that. Ask an administrator if you need access.";
    case "23505":
      return "That record already exists.";
    case "23503":
      return "That refers to a record that no longer exists.";
    default:
      return "Could not save. Please try again.";
  }
}
