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

  /** Whole number within bounds. Blank falls back to `fallback`. */
  integer(name: string, label: string, min: number, max: number, fallback = 0): number {
    const raw = field(this.form, name);
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) {
      this.errors[name] = `${label} must be a whole number between ${min} and ${max}.`;
      return fallback;
    }
    return n;
  }

  /**
   * A non-negative money amount.
   *
   * Rejects negatives outright: a negative deal value is always a data-entry
   * error here, and it would silently corrupt pipeline and forecast totals
   * that are summed without any sign check.
   */
  money(name: string, label: string): number {
    const raw = field(this.form, name).replace(/[\s,]/g, "");
    if (!raw) return 0;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      this.errors[name] = `${label} must be a positive amount.`;
      return 0;
    }
    if (n > 999_999_999) {
      this.errors[name] = `${label} is unrealistically large.`;
      return 0;
    }
    // Two decimal places to match numeric(12,2); more would be silently
    // rounded by Postgres and the stored figure would not match what was typed.
    return Math.round(n * 100) / 100;
  }

  /** Optional ISO date (YYYY-MM-DD), as produced by <input type="date">. */
  optionalDate(name: string, label: string): string | null {
    const raw = field(this.form, name);
    if (!raw) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) {
      this.errors[name] = `${label} must be a valid date.`;
      return null;
    }
    return raw;
  }

  /**
   * A value from a fixed allow-list.
   *
   * Enum columns must never receive unvalidated input: an unknown value
   * produces a raw Postgres type error rather than a usable message.
   */
  choice<T extends string>(name: string, label: string, allowed: readonly T[], fallback: T): T {
    const raw = field(this.form, name);
    const found = allowed.find((a) => a === raw);
    if (!found) {
      if (raw) this.errors[name] = `${label} is not a recognised value.`;
      return fallback;
    }
    return found;
  }

  /**
   * A password being set for someone else.
   *
   * Length is the only rule that reliably helps. Composition requirements
   * ("one symbol, one digit") push people toward Password1! and measurably
   * weaken the result, which is why NIST dropped them.
   */
  password(name: string, label: string, min = 8): string {
    const value = this.form.get(name);
    const raw = typeof value === "string" ? value : "";
    if (!raw) {
      this.errors[name] = `${label} is required.`;
      return "";
    }
    // Not trimmed: leading and trailing spaces are legitimate password
    // characters, and silently stripping them locks the person out later.
    if (raw.length < min) {
      this.errors[name] = `${label} must be at least ${min} characters.`;
      return "";
    }
    if (raw.length > 72) {
      // bcrypt truncates beyond 72 bytes, so anything longer is silently
      // ignored past that point.
      this.errors[name] = `${label} must be 72 characters or fewer.`;
      return "";
    }
    return raw;
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
export function describeDbError(
  error: { code?: string; message?: string; details?: string; hint?: string },
  context?: string
): string {
  // Always log the full error server-side. It lands in the Vercel function
  // logs, where it is useful, rather than in front of a user who cannot act on
  // it. Without this an unrecognised failure is undiagnosable after the fact.
  console.error("[db]", context ?? "unknown", {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });

  switch (error.code) {
    case "42501":
      return "Your role does not allow that. Ask an administrator if you need access.";
    case "23505":
      return "That record already exists.";
    case "23503":
      return "That refers to a record that no longer exists.";
    case "23502":
      return "A required field was missing. Please check the form and try again.";
    case "23514":
      return "One of those values is outside the allowed range.";
    case "22P02":
      return "One of those values was not in the expected format.";
    case "42804":
      // The handle_new_user enum-cast class of bug. Naming it makes the next
      // occurrence identifiable in one step rather than several.
      return "Type mismatch saving that record (42804). This is a bug — please report it.";
    case "PGRST116":
      return "That record could not be found, or your role cannot see it.";
    case "PGRST204":
      return "The database schema is out of date with the app. Please report this.";
    case "PGRST301":
      return "Your session has expired. Sign in again.";
    default:
      // Surface the SQLSTATE. A five-character code leaks nothing meaningful
      // about the schema but turns "it broke" into a one-step diagnosis.
      return error.code
        ? `Could not save (error ${error.code}). Please report this code.`
        : "Could not save. Please try again.";
  }
}
