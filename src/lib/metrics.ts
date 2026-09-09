/**
 * Pure derivation helpers for the dashboard.
 *
 * These live outside the page component so the money math is testable without
 * a database, a React renderer or a Supabase session. See metrics.test.mjs.
 */

/**
 * Percentage change from `previous` to `current`.
 *
 * Returns null when there is no non-zero baseline. Growth from zero is not
 * "infinite percent" and not "0%" — it is undefined, and the UI must say so
 * rather than print a number that reads as fact.
 */
export function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/** `part` as a percentage of `whole`, clamped to 0 when there is nothing billed. */
export function ratePct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return (part / whole) * 100;
}

/**
 * Sum `rows` into a fixed, pre-seeded list of buckets.
 *
 * Buckets are supplied by the caller and always returned in full, so a period
 * with no rows renders as an explicit 0 rather than vanishing from the chart
 * and silently compressing the x-axis.
 */
export function bucketSum<T>(
  rows: T[] | null | undefined,
  buckets: string[],
  keyOf: (row: T) => string,
  valueOf: (row: T) => number
): number[] {
  const totals = new Map(buckets.map((b) => [b, 0]));
  for (const row of rows ?? []) {
    const key = keyOf(row);
    const current = totals.get(key);
    if (current !== undefined) totals.set(key, current + valueOf(row));
  }
  return buckets.map((b) => totals.get(b) ?? 0);
}

/** Numeric coercion for Postgres numeric columns, which arrive as strings. */
export function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}
