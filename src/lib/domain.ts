/**
 * Enum values and display labels, mirroring the types in 0001_init.sql.
 *
 * Declared `as const` so the arrays double as the allow-lists passed to
 * Validator.choice() — the same list drives the <select> options and the
 * server-side check, so they cannot drift apart.
 */

export const LEAD_SOURCES = [
  "website", "whatsapp", "email", "referral", "social", "phone", "campaign", "manual",
] as const;

export const LEAD_STATUSES = [
  "new", "contacted", "qualified", "disqualified", "converted",
] as const;

export const PIPELINE_STAGES = [
  "new", "contacted", "qualified", "discovery", "proposal", "negotiation", "won", "lost",
] as const;

/** Stages shown as columns on the board. Won and lost are outcomes, not columns. */
export const OPEN_STAGES = [
  "new", "contacted", "qualified", "discovery", "proposal", "negotiation",
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];
export type LeadStatusValue = (typeof LEAD_STATUSES)[number];
export type PipelineStageValue = (typeof PIPELINE_STAGES)[number];

/** Default win probability per stage, used to pre-fill the field on conversion. */
export const STAGE_PROBABILITY: Record<PipelineStageValue, number> = {
  new: 10,
  contacted: 20,
  qualified: 40,
  discovery: 50,
  proposal: 65,
  negotiation: 80,
  won: 100,
  lost: 0,
};

export function label(value: string): string {
  return value.replace(/_/g, " ");
}

/**
 * Next human-readable reference for a year, e.g. nextReference("LEAD", 2026, 6)
 * gives "LEAD-2026-0007".
 *
 * ponytail: derived from a row count, so two simultaneous creates can produce
 * the same reference and the second hits the unique constraint. The caller
 * retries once. Move to a Postgres sequence per org if lead volume ever makes
 * that collision common.
 */
export function nextReference(prefix: string, year: number, existingCount: number): string {
  const n = existingCount + 1;
  return `${prefix}-${year}-${String(n).padStart(4, "0")}`;
}
