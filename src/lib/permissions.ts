import type { AppRole } from "@/lib/supabase/types";

/**
 * UI-side mirror of the RLS policies in supabase/migrations/0002_rls.sql.
 *
 * IMPORTANT: this is presentation only. It decides whether to render a button,
 * nothing more. The database is the actual security boundary — every one of
 * these tables has RLS enabled, so a forged request still fails at Postgres.
 * If this file and 0002_rls.sql ever disagree, the policy file wins and this
 * one is the bug.
 *
 * Kept as explicit role lists rather than clever role hierarchies because the
 * matrix genuinely is not a hierarchy: `director` can read every customer but
 * cannot create one, while `salesperson` can create but only reads its own.
 */

const CUSTOMER_WRITE: AppRole[] = ["super_admin", "sales_manager", "salesperson"];
const CUSTOMER_EDIT_ALL: AppRole[] = ["super_admin", "sales_manager"];
const CUSTOMER_DELETE: AppRole[] = ["super_admin", "sales_manager"];

export function canCreateCustomer(role: AppRole): boolean {
  return CUSTOMER_WRITE.includes(role);
}

export function canCreateContact(role: AppRole): boolean {
  // contacts_write: same role list as customers.
  return CUSTOMER_WRITE.includes(role);
}

export function canDeleteCustomer(role: AppRole): boolean {
  return CUSTOMER_DELETE.includes(role);
}

/** leads_write and opportunities_write use the same role list as customers_write. */
export function canCreateLead(role: AppRole): boolean {
  return CUSTOMER_WRITE.includes(role);
}

export function canCreateOpportunity(role: AppRole): boolean {
  return CUSTOMER_WRITE.includes(role);
}

/**
 * Whether this user may move an opportunity along the pipeline.
 *
 * Mirrors opportunities_update: leadership moves anything, a salesperson moves
 * only their own. Board columns stay visible either way — RLS already decided
 * what is visible; this only decides whether the stage control is interactive.
 */
export function canMoveOpportunity(
  role: AppRole,
  ownerId: string | null,
  userId: string
): boolean {
  if (CUSTOMER_EDIT_ALL.includes(role)) return true;
  return ownerId !== null && ownerId === userId;
}

/**
 * Whether this user may edit a given customer.
 *
 * Mirrors customers_update: leadership edits anything, a salesperson edits
 * only what they own. Ownership is passed in rather than looked up so the
 * caller controls the query.
 */
export function canEditCustomer(
  role: AppRole,
  ownerId: string | null,
  userId: string
): boolean {
  if (CUSTOMER_EDIT_ALL.includes(role)) return true;
  return ownerId !== null && ownerId === userId;
}
