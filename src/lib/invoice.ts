import { toCents } from "./money.ts";

/**
 * Invoice status derivation.
 *
 * Status is derived from what has actually been paid rather than set by hand,
 * so it cannot drift from the payments table. Kept pure and separate from the
 * database so the transitions are testable.
 */

export type InvoiceStatusValue =
  | "draft"
  | "sent"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "void";

/** An invoice is locked against edits once it has left draft. */
export function isEditable(status: string): boolean {
  return status === "draft";
}

/**
 * What is still owed, in cents.
 *
 * Compared in integer cents: `total - paid` in floating point can leave
 * 0.000000001 outstanding on a fully paid invoice, which would keep it
 * showing as partially paid forever.
 */
export function outstandingCents(total: number, paid: number): number {
  return toCents(total) - toCents(paid);
}

/**
 * The status an invoice should have, given what has been paid.
 *
 * `draft` and `void` are terminal in opposite directions and are never
 * derived — a draft has not been issued, and a void invoice is settled by
 * cancellation, not payment.
 */
export function deriveStatus(
  current: string,
  total: number,
  paid: number,
  dueDate: string | null,
  today: string
): InvoiceStatusValue {
  if (current === "draft" || current === "void") return current;

  const outstanding = outstandingCents(total, paid);

  // A zero-total invoice is settled the moment it is issued; without this it
  // would sit at "sent" forever because no payment can ever arrive.
  if (outstanding <= 0) return "paid";
  if (toCents(paid) > 0) return "partially_paid";
  if (dueDate !== null && dueDate < today) return "overdue";
  return "sent";
}
